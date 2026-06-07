# Serving minitel from a Caution enclave

Practical recap of how this is built and deployed. Design rationale lives in
`docs/caution-enclave-design.md`.

> **The crux:** the built SPAs under `deploy/site/` are **committed to git on
> purpose** (one dir per chain, with content-hashed assets like
> `dot/assets/index-*.css`). Caution rebuilds from the repo at the attested
> commit and **never runs your CI**, so the dist has to be in git for the enclave
> to serve it and for `caution verify` to reproduce the PCRs. Only the Go binary
> is built inside StageX; the static tree is read verbatim. CI (`build-site.yml`)
> keeps `deploy/site/` in sync whenever `apps/**` changes — don't hand-edit it.
>
> **This is the v1 trade-off.** Vendoring side-steps non-deterministic JS builds
> at the cost of trusting committed bytes — the *binary* is attested, the *site*
> is not built inside the reproducible boundary. See
> [Status & future work](#status--future-work) for the better v2 approach.

## What it is

All 21 chain decoders (client-side Vite SPAs) are served from a **single**
AWS Nitro / Caution enclave. A tiny Go server (`deploy/`) `go:embed`s a prebuilt
static tree and serves it on `:8080`; Caution fronts it with TLS. The build is
StageX-reproducible so `caution verify` can reproduce the enclave measurements
(PCRs) from source.

Routing: each chain is a path prefix — `/<chain>/` (e.g. `/ethereum/`) — with a
landing page at `/`. Each SPA is built with Vite `--base=/<chain>/` so its assets
resolve under that prefix. The server sets the project's security headers, with
the **CSP chosen per chain** (ada/dot/ksm need `wasm-unsafe-eval` and/or RPC
`connect-src`), sourced from each app's `vercel.json`.

**End-to-end encryption (STEVE):** the Procfile sets `e2e: true`, so Caution runs
the STEVE proxy in the enclave and a browser service worker E2E-encrypts traffic
to the attested enclave (host-blind, even though the host terminates TLS).
Currently a **pilot on the `ethereum` app**. See `docs/steve-e2e.md` for the full
showcase of how it works.

## Files

| File | Role |
|---|---|
| `deploy/handler.go`, `deploy/main.go` | Go static server (`go:embed all:site`, `:8080`) |
| `deploy/site/` | **Vendored** built SPAs (one dir/chain) + `index.html` + `csp.json` |
| `deploy/build-site.sh` | Builds all 21 apps + generates `csp.json` + landing page |
| `Containerfile` | Reproducible StageX `pallet-go` build → `FROM scratch` (repo root) |
| `Procfile` | Caution run config (`run`, `ports`, `http_port`) (repo root) |
| `.github/workflows/build-site.yml` | Rebuilds & commits `deploy/site/` on app changes |
| `Makefile` | Ops shortcuts (see `make help`) |

## Prerequisites

- **bun** (build the SPAs), **go** ≥ 1.22 (local server tests).
- **Docker + buildx** for the enclave image. StageX images are **linux/amd64
  only**; on Apple Silicon the build runs under emulation (slower but works).
- **caution CLI** for the actual deploy (`caution apps build/push`, `caution
  verify`). See https://docs.caution.co/.

## Build & test locally

```bash
make build      # bun install + build-site.sh + go test
make run        # serve on http://localhost:8080  (try /, /ethereum/, /ada/)
```

`make run` lets you eyeball routing and per-chain CSP headers:

```bash
curl -sI http://localhost:8080/ada/ | grep -i content-security-policy   # has wasm-unsafe-eval
curl -sI http://localhost:8080/ethereum/ | grep -i content-security-policy  # strict default
```

## Reproducible build with StageX

The image compiles the Go binary inside `stagex/pallet-go` (digest-pinned),
hermetically (`--network=none`, stdlib-only, `SOURCE_DATE_EPOCH=1`,
`-trimpath -buildvcs=false -ldflags="-s -w -buildid="`) and ships it `FROM
scratch`. Prove it's byte-for-byte reproducible:

```bash
make repro      # two --no-cache OCI builds, compared with cmp -> "REPRODUCIBLE"
```

Re-pin the StageX base when updating (writes nothing — copy the digest into
`Containerfile`):

```bash
make digest     # prints stagex/pallet-go@sha256:... and its go version (must be >= 1.22)
```

## Deploy to Caution

Deploy goes through the `caution` CLI directly (it's interactive — FIDO2
signing — so it isn't wrapped in the Makefile).

> **Both `Procfile` and `Containerfile` must sit at the repo root** of the branch
> you deploy. Caution clones the repo, requires a root `Procfile` (with `run:`),
> and auto-detects a root `Containerfile` (before `Dockerfile`). A `Procfile`
> living only on a feature branch fails with *"No Procfile found in repository
> root"* when a branch without it (e.g. bare `main`) is the one pushed — deploy
> the branch that actually carries these files.

1. **Initialize the deployment** (once, writes `.caution/`):
   ```bash
   caution init
   ```
2. **Inspect the enclave image locally** (optional sanity check):
   ```bash
   caution apps build      # builds the EIF locally, doesn't deploy
   ```
3. **Create / deploy the app:**
   ```bash
   caution apps create
   ```

Caution builds from the root `Containerfile` (`docker build -f Containerfile .`
from the repo root) and runs `/server` per the Procfile. Set `domain:` +
`http_port` in the Procfile if you want TLS fronting for a custom hostname.

## Verify a live deployment

```bash
caution verify --attestation-url https://<your-domain>/attestation
```

This re-downloads the source at the attested commit, rebuilds the EIF, and
compares PCR0/1/2 against the live attestation. A match means the bytes being
served are exactly what the pinned source produces.

## Updating the UI

Edit an app under `apps/**` or a shared package under `packages/**`, then:

```bash
make site && git add deploy/site && git commit -m "chore: rebuild site"
```

CI (`build-site.yml`) does this automatically on push, so the vendored dist and
`csp.json` never drift from source. After the UI changes, redeploy with
`caution apps create`.

## Status & future work

**This is v1.** It works and deploys, but it is deliberately the simpler design.
Its one real weakness: the served UI is **not built inside the reproducible
boundary**. StageX reproducibly compiles the Go server, but the SPA bundles are
prebuilt on a developer machine / CI and committed to `deploy/site/`. `caution
verify` therefore proves the *binary* matches source, and that the binary embeds
*whatever bytes are in `deploy/site/` at the attested commit* — but it does not
prove those bytes are the faithful output of `apps/**`. You are trusting the
committed dist (and the CI job that regenerates it), not attesting it.

Secondary costs: the repo carries built artifacts (content-hashed assets churn
on every UI change, bloating history and diffs), and the vendored tree can drift
if someone hand-edits it or bypasses CI.

**v2 — build the SPAs inside StageX too.** Move the Vite build into the
reproducible image so the *entire* artifact (site + server) is produced
hermetically from `apps/**` + `packages/**`, with nothing prebuilt vendored:

- Add a `stagex/pallet-bun` (or `pallet-nodejs`) build stage that runs
  `bun install --frozen-lockfile` and the per-chain `vite build` with
  `SOURCE_DATE_EPOCH=1`, then `COPY --from=build /site` into the Go stage's
  embed path. Drop `deploy/site/` and `build-site.yml` entirely.
- The hard part is JS build determinism (see the `stagex-reproducible-builds`
  skill's Node section): Vite/esbuild/Rollup must emit byte-identical bundles
  across two `--no-cache` builds. This needs a fully pinned toolchain
  (bun version pinned, `bun.lock` frozen), no timestamp/hostname/absolute-path
  leakage in the output, and a stable asset-hash seed. Prove it with the same
  two-build `cmp` we use for the Go binary (`make repro`) before trusting it.
- Generate `csp.json` inside that stage from `apps/*/vercel.json` (the logic
  already lives in `build-site.sh`) so per-chain CSP stays data-driven.

The payoff: `caution verify` then attests the actual UI a user loads, the repo
stops carrying build output, and drift becomes impossible by construction. The
blocker to doing it now is reproducible JS builds — until that's proven
byte-for-byte, v1's vendor-and-trust is the honest, shippable choice.

# Serving minitel from a Caution enclave

Practical recap of how this is built and deployed. Design rationale lives in
`docs/superpowers/specs/2026-06-07-caution-enclave-design.md`.

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

## Files

| File | Role |
|---|---|
| `deploy/handler.go`, `deploy/main.go` | Go static server (`go:embed all:site`, `:8080`) |
| `deploy/site/` | **Vendored** built SPAs (one dir/chain) + `index.html` + `csp.json` |
| `deploy/build-site.sh` | Builds all 21 apps + generates `csp.json` + landing page |
| `deploy/Containerfile` | Reproducible StageX `pallet-go` build → `FROM scratch` |
| `Procfile` | Caution run config (`run`, `ports`, `http_port`, `domain`) |
| `.github/workflows/build-site.yml` | Rebuilds & commits `deploy/site/` on app changes |
| `Makefile` | Ops shortcuts (see `make help`) |

The vendored `deploy/site/` is committed on purpose: Caution rebuilds from the
repo at the attested commit and never runs CI, so the dist must be in git for
verification to reproduce. CI keeps it in sync with source automatically.

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
`deploy/Containerfile`):

```bash
make digest     # prints stagex/pallet-go@sha256:... and its go version (must be >= 1.22)
```

## Deploy to Caution

1. **Set the domain.** Edit `Procfile` → `domain:` to the real hostname
   (it ships as `minitel.example.com`). `http_port` must stay listed in `ports`.
2. **Build the enclave image:**
   ```bash
   make caution-build      # caution apps build
   ```
3. **Push it:**
   ```bash
   make deploy             # caution apps push
   ```

Caution builds from `deploy/Containerfile` (`docker build -f deploy/Containerfile .`
from the repo root), runs `/server` per the Procfile, and terminates TLS for
`domain` on `http_port`.

## Verify a live deployment

```bash
make verify ATT_URL=https://<your-domain>/attestation
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
`make deploy`.

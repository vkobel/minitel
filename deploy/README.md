# minitel in a verifiable enclave — Caution × STEVE × StageX

Serves all 21 client-side chain decoders (`apps/ethereum`, `apps/solana`, …) from
a **single AWS Nitro enclave** whose bytes can be **independently reproduced and
verified**. For a tool you use to inspect transactions before signing, "trust the
server to serve the right code" isn't enough — this lets a user prove the UI their
browser runs is the audited source, with the host cut out of the trust boundary.

A tiny Go server (`deploy/`) `go:embed`s the prebuilt SPAs and serves them on
`:8083`; Caution fronts it with TLS. Each chain is a path prefix `/<chain>/` (built
with Vite `--base=/<chain>/`), with a landing page at `/` and per-chain CSP sourced
from each app's `vercel.json`.

**The stack:**
- **StageX** — hermetic, deterministic build. The Go server compiles inside a
  digest-pinned `stagex/pallet-go` (no network, `SOURCE_DATE_EPOCH=1`, stripped
  build IDs) → byte-for-byte reproducible image.
- **Caution** — runs the image in a Nitro enclave, measured into PCRs and attested.
  `caution verify` rebuilds from the attested commit and matches the PCRs.
- **STEVE** — a browser service worker does attestation → X25519 key exchange →
  AES-256-GCM, so traffic is encrypted to *inside* the enclave even though the host
  terminates TLS. Enabled with one Procfile line (`e2e: true`).

> **STEVE is a pilot on `ethereum` only.** The full client-side wiring (service
> worker + the live verification panel) lives in `apps/ethereum/src/steve/` and
> `apps/ethereum/public/enclave-sw.js`. Other chains are served from the same
> attested enclave but without the browser-side E2E layer yet. See
> `../docs/steve-e2e.md`.

## Build & test locally

```bash
make build      # bun install + build all 21 SPAs + go test
make run        # serve on http://localhost:8083  (try /, /ethereum/, /ada/)
make repro      # prove the StageX build is byte-for-byte reproducible
```

```bash
curl -sI http://localhost:8083/ada/ | grep -i content-security-policy       # has wasm-unsafe-eval
curl -sI http://localhost:8083/ethereum/ | grep -i content-security-policy  # strict default
```

Needs **bun**, **go ≥ 1.22**, and **Docker + buildx** (StageX is linux/amd64 only;
runs under emulation on Apple Silicon).

## Deploy & verify

Deploy is interactive (FIDO2), so it goes through the `caution` CLI directly, not
the Makefile. **Both `Procfile` and `Containerfile` must be at the repo root of the
branch you push.**

```bash
caution init                   # once; writes .caution/
git push caution main          # build EIF + deploy
caution verify --attestation-url https://<host>/attestation   # PCRs match source?
```

## Updating the UI

```bash
make site && git add deploy/site && git commit -m "chore: rebuild site"
```

Rebuild a **single** chain without wiping the others (the full `build-site.sh` does
`rm -rf deploy/site` first):

```bash
C=ethereum && ( cd apps/$C && bunx vite build --base="/$C/" --outDir dist --emptyOutDir ) \
  && rm -rf deploy/site/$C && cp -r apps/$C/dist deploy/site/$C
```

CI (`.github/workflows/build-site.yml`) regenerates the vendored dist + `csp.json`
on push, so it never drifts from source — **don't hand-edit `deploy/site/`.**

## Assumptions & current limitations (v1)

- **The SPAs are prebuilt and committed to `deploy/site/`.** Caution rebuilds from
  the repo at the attested commit and never runs your CI, so the dist must be in
  git. Only the **Go binary** is built inside StageX; the static tree is embedded
  verbatim.
- **So `caution verify` attests the binary, not the UI's provenance.** It proves
  the server matches source and embeds whatever bytes are in `deploy/site/` — not
  that those bytes are the faithful output of `apps/**`. You trust the committed
  dist (and the CI that regenerates it).
- **Port `:8083` is fixed** because, with `e2e: true`, Caution routes
  Caddy → STEVE → `127.0.0.1:8083`. Overridable via `PORT`.
- Cost: content-hashed assets churn the git history on every UI change.

**v2** would move the Vite build inside StageX so the whole artifact is
reproducible from source — blocked on proving byte-for-byte deterministic JS
builds.

## Docs

- `../docs/steve-e2e.md` — STEVE E2E threat model & lifecycle.
- `../docs/caution-enclave-design.md` — design spec.
- Upstream: [StageX](https://codeberg.org/stagex/stagex),
  [Caution](https://docs.caution.co/), and the `steve` / `steve-js-sdk` projects.

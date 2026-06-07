# Serve minitel from a Caution enclave — design

Date: 2026-06-07
Branch: `feat/caution-enclave`

## Goal

Serve the minitel multi-chain transaction decoder (21 client-side Vite SPAs) from
a single AWS Nitro / Caution enclave, with a StageX-based reproducible build so
the deployment is attestable and `caution verify` can reproduce the PCR
measurements from source.

## Why an enclave

minitel is a security tool: users inspect raw transactions with it *before*
signing. The integrity of the decoder UI is exactly the property worth
attesting — a tampered decoder could hide a malicious transaction. Running it in
a Caution enclave makes the served bytes verifiable against the attested source
commit.

The apps are fully offline client-side code: all 21 ship `connect-src 'self'` in
their CSP, and the only external URLs are explorer links the user clicks
(etherscan, solscan, beaconcha.in) — navigations, not runtime fetches. So the
enclave needs **no outbound internet** for the app itself.

## Decisions (settled during brainstorming)

| Decision | Choice |
|---|---|
| Scope | All 21 chains served from **one** enclave |
| Build strategy | **Vendor prebuilt dist** — build in CI, commit, COPY into image |
| Routing | **Path-based + landing page** (`/ethereum/`, `/solana/`, … and `/`) |
| In-enclave server | **Go** (`pallet-go`, deterministic defaults) |
| App networking | None required (offline decoders) |

## Architecture

```
CI (GitHub Actions)                Repo (committed)            Caution enclave (Nitro)
─────────────────────              ────────────────            ───────────────────────
bun install                        deploy/site/                Caddy (TLS, :443)
vite build --base=/ethereum/  ──►    ├── index.html   ──►        │  terminates TLS
  ... ×21 chains                     ├── ethereum/             ┌─▼──────────────┐
generate landing index.html          ├── solana/              │ Go static server│ :8080
assemble + commit deploy/site/       └── …21 dirs             │ go:embed site/  │
                                                              │ sets CSP headers│
                                   deploy/server/  ──build──► └─────────────────┘
                                   Containerfile (repo root)   FROM scratch, /server
                                   Procfile (repo root)
```

## Components

### 1. CI build → vendored `deploy/site/`

A GitHub Actions workflow builds every app and assembles a single static tree
that is **committed** to the repo.

- For each chain `<c>`: `vite build --base=/<c>/` so all asset URLs resolve under
  that path. Output copied to `deploy/site/<c>/`.
- A generated `deploy/site/index.html` landing page links to all 21 chains.
- Caution rebuilds from the repo at the attested commit and **never runs CI**, so
  the dist must live in git for `caution verify` to reproduce PCRs. Committing
  the dist is therefore required, not optional, given the vendor-dist strategy.
- The workflow triggers on changes to `apps/**` or `packages/**`, rebuilds, and
  commits `deploy/site/` so it cannot silently drift from source.

What it does: produce a deterministic static tree of all chains.
Interface: writes `deploy/site/`.
Depends on: bun, the existing per-app Vite builds.

### 2. Go static server (`deploy/server/`)

A small `net/http` server.

- `go:embed deploy/site` — binary is fully self-contained, enabling `FROM
  scratch` (no filesystem in the runtime image).
- Serves embedded files. Per-chain SPA fallback: a miss under `/<chain>/...`
  serves `/<chain>/index.html`; `/` serves the landing page.
- Sets the **same security headers** as the current `vercel.json` on every
  response: `Content-Security-Policy`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.
- Listens plain HTTP on `:8083` (STEVE's upstream when `e2e` is on; override with
  `PORT`). Caution's Caddy terminates TLS; with e2e it routes Caddy → STEVE →
  `127.0.0.1:8083`.

What it does: serve the embedded multi-app static tree with security headers.
Interface: HTTP on `:8083`.
Depends on: `deploy/site/` at build time.

### 3. `Containerfile` (repo root; StageX, reproducible)

- Build stage: `FROM stagex/pallet-go@sha256:<verified-digest>` (digest pinned).
  `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`, `SOURCE_DATE_EPOCH=1`.
  `RUN --network=none go build -trimpath -buildvcs=false -ldflags="-s -w
  -buildid=" -o /server .`
- Run stage: `FROM scratch`, `COPY --from=build /server /server`,
  `ENTRYPOINT ["/server"]`.
- All `FROM` and any `COPY --from=stagex/...` pinned by verified digest.
- `--platform=linux/amd64` (StageX is amd64-only; required on Apple Silicon
  hosts).

### 4. `Procfile`

At the repo root (alongside `Containerfile`). No `containerfile:` key needed —
Caution auto-detects the root `Containerfile`.

```procfile
run: /server
e2e: true
app_sources: https://github.com/kilnfi/minitel
```

With `e2e: true`, Caution fronts the app with STEVE (Caddy → STEVE →
`127.0.0.1:8083`), so no `http_port`/`ports` is needed — the app port is internal
behind STEVE. (For a non-e2e deploy you'd instead set `http_port`/`ports`, and the
`http_port` value also appears in `ports` — Caution Procfile validation requires
it). Add `domain: <hostname>` if you want Caddy TLS fronting for a custom domain.

## Verification story

- Dist is vendored + Go build is deterministic ⇒ two `--no-cache` buildx OCI
  exports are byte-identical (proven with `cmp`, confirming both passes actually
  recompiled, not `CACHED`).
- `caution verify --attestation-url <url>` reproduces PCR0/1/2 from the attested
  commit.
- Independent audit: anyone can rebuild `deploy/site/` from the TS source and
  diff against the committed dist to confirm the dist matches source.

## Tradeoff accepted

Committing 21 built dists causes repo churn and imposes a discipline: every UI
change requires rebuilding + committing `deploy/site/`. The CI workflow
automates this so vendored dist stays in sync with source.

## Out of scope

- Locksmith / secrets (the app has none).
- Outbound networking from the enclave.
- Per-chain subdomains (rejected in favor of path-based + landing page).

## Open items to resolve at implementation time

- The production `domain` value.
- Verified current `stagex/pallet-go` digest (must be fetched, not taken from
  memory).
- Whether to keep HSTS in the app-level headers given Caddy also fronts TLS
  (harmless duplicate; keep to match current behavior).

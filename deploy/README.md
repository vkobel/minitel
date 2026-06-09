# minitel in a verifiable enclave — Caution × STEVE × StageX

minitel is a **client-side transaction decoder**: it parses and displays raw
blockchain transactions in your browser so you can inspect exactly what you are
about to sign, across 21 chains (`ethereum`, `solana`, `ada`, …). For a tool you
use to vet transactions before signing, "trust the server to serve the right
code" isn't good enough. This deployment removes that trust: every byte the
enclave runs is **independently reproducible**, the running enclave is
**cryptographically attested**, and (on the `ethereum` pilot) your browser
**verifies that attestation live and shows you the result** — with the hosting
provider cut out of the trust boundary.

All 21 decoders are served from a **single AWS Nitro enclave**. A tiny Go server
(`deploy/`) `go:embed`s the prebuilt SPAs and serves them on `:8083`; Caution
fronts it with TLS. Each chain is a path prefix `/<chain>/` (built with Vite
`--base=/<chain>/`), with a landing page at `/` and per-chain CSP sourced from
each app's `vercel.json`.

## The three guarantees

- **Reproducible build (StageX).** The Go server compiles inside a digest-pinned
  `stagex/pallet-go` — no network, `SOURCE_DATE_EPOCH=1`, stripped build IDs —
  producing a byte-for-byte reproducible image. Anyone can rebuild it and get the
  same bytes.
- **Attested enclave (Caution).** Caution runs that image in a Nitro enclave,
  measured into PCRs and signed by AWS into an attestation document.
  `caution verify` rebuilds from the attested commit and confirms the PCRs match
  the source — proving the enclave runs *this* code and nothing else.
- **Host-blind transport (STEVE).** A browser service worker performs attestation
  → X25519 key exchange → AES-256-GCM, so traffic is encrypted to code *inside*
  the enclave even though the host terminates TLS. Enabled with one Procfile line
  (`e2e: true`). See `../docs/steve-e2e.md` for the threat model and lifecycle.

## What a user sees (the `ethereum` pilot)

The guarantees aren't just back-office mechanics — on `ethereum`, the proof is
surfaced **in the page header, live, in the user's own browser**:

- **"Verified enclave" badge.** On load, the page runs a Nitro attestation check
  *independently of STEVE* (so it works even where a service worker can't
  register). It shows `Verifying enclave…` → **`Verified enclave`** (green) or
  `Verification failed` (red). The result is the browser's own verdict, not a
  claim from the server.
- **Attestation modal.** Clicking the badge opens the full attestation detail:
  the AWS-signed Nitro document, the enclave's **PCR measurements**
  (PCR0–4, PCR8), the attested **Ed25519 key**, and the **source commits** the
  build maps back to.
- **Live STEVE panel.** A step-by-step view of the real end-to-end handshake as
  it happens: **1 · Attestation** (Nitro doc verified, PCRs, STEVE key) →
  **2 · Key exchange** (X25519 ECDH, signature bound to the attested enclave,
  HKDF → AES-256-GCM session cipher) → **3 · Encrypted assets** (each asset
  fetch streaming as ciphertext to the enclave). The badges reflect the *actual*
  handshake state — they go green only when the crypto really completes.

> **STEVE is a pilot on `ethereum` only.** The client-side wiring (service worker
> + the live verification UI) lives in `apps/ethereum/src/steve/` and
> `apps/ethereum/public/enclave-sw.js`. The other 20 chains are served from the
> same attested, reproducible enclave but don't yet have the browser-side E2E
> layer. See `../docs/steve-e2e.md`.

## Verify it yourself

```bash
caution verify --attestation-url https://<host>/attestation   # rebuild from the
                                                              # attested commit;
                                                              # confirm PCRs match
```

Or just open the `ethereum` decoder and click **Verified enclave** in the
header — your browser fetches `/attestation`, verifies the AWS signature and PCR
chain, and shows you the result. In DevTools → Network you'll see asset requests
sent as `POST … application/octet-stream` with an `X-E2P-Key` header: ciphertext
the host can't read, bound to the attested enclave.

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

## Deploy

Deploy is interactive (FIDO2), so it goes through the `caution` CLI directly, not
the Makefile. **Both `Procfile` and `Containerfile` must be at the repo root of the
branch you push.**

```bash
caution init                   # once; writes .caution/
git push caution main          # build EIF + deploy
```

### Updating the UI

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

## Honest scope & limitations (v1)

A verifiable showcase should be precise about what it does and doesn't prove:

- **The SPAs are prebuilt and committed to `deploy/site/`.** Caution rebuilds from
  the repo at the attested commit and never runs your CI, so the dist must be in
  git. Only the **Go binary** is built inside StageX; the static tree is embedded
  verbatim.
- **So `caution verify` attests the binary, not the UI's provenance.** It proves
  the server matches source and embeds whatever bytes are in `deploy/site/` — not
  that those bytes are the faithful output of `apps/**`. You trust the committed
  dist (and the CI that regenerates it).
- **For a static decoder, STEVE protects delivery, not secret payloads.** minitel
  parses transactions entirely in the browser and sends no private keys or
  sensitive data to the server. STEVE's value here is **attested, host-blind
  delivery of the asset bytes** — strong integrity/provenance — rather than
  protecting secret user data in flight. It gets more impactful once minitel grows
  server-side functionality.
- **Port `:8083` is fixed** because, with `e2e: true`, Caution routes
  Caddy → STEVE → `127.0.0.1:8083`. Overridable via `PORT`.

**v2** would move the Vite build inside StageX so the whole artifact is
reproducible from source — blocked on proving byte-for-byte deterministic JS
builds.

## Docs

- `../docs/steve-e2e.md` — STEVE E2E threat model & lifecycle.
- `../docs/caution-enclave-design.md` — design spec.
- Upstream: [StageX](https://codeberg.org/stagex/stagex),
  [Caution](https://docs.caution.co/), and the `steve` / `steve-js-sdk` projects.

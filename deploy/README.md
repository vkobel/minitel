# minitel in a verifiable enclave — Caution × STEVE × StageX

minitel is a **client-side transaction decoder**. It parses raw blockchain
transactions in your browser so you can inspect what you're about to sign, across
21 chains (`ethereum`, `solana`, `ada`, …). For a tool you use to vet transactions
before signing, "trust the server to serve the right code" isn't good enough.

This deployment removes that trust. Every byte the enclave runs is
**independently reproducible**. The running enclave is **cryptographically
attested**. And on `ethereum`, your browser **verifies that attestation live and
shows you the result**. The hosting provider is cut out of the trust boundary.

**Live:** <https://minitel.kobl.one/ethereum/>

All 21 chains run from one **AWS Nitro enclave**. A tiny Go server (`deploy/`)
`go:embed`s the prebuilt SPAs and serves them on `:8083`; Caution fronts it with
TLS. Each chain is a path prefix `/<chain>/` (built with Vite `--base=/<chain>/`),
with a landing page at `/` and per-chain CSP from each app's `vercel.json`.
`ethereum` is the only page wired with the **STEVE** browser-side E2E layer; the
rest run from the same enclave without it (yet).

## The three guarantees

- **Reproducible build (StageX).** The Go server compiles inside a digest-pinned
  `stagex/pallet-go` — no network, `SOURCE_DATE_EPOCH=1`, stripped build IDs —
  producing a byte-for-byte reproducible image. Anyone can rebuild it and get the
  same bytes. **Caveat:** StageX builds only the Go binary. The SPAs use a Vite/bun
  build that isn't yet byte-for-byte deterministic. So they're built locally,
  committed to `deploy/site/`, and embedded verbatim. You build the UI locally,
  *then* deploy. Moving that build onto the Caution builder is the v2 goal (see
  [limitations](#honest-scope--limitations-v1)).
- **Attested enclave (Caution).** Caution runs that image in a Nitro enclave,
  measured into PCRs and signed by AWS into an attestation document.
  `caution verify` rebuilds from the attested commit and confirms the PCRs match
  the source — proving the enclave runs *this* code and nothing else.
- **Host-blind transport (STEVE).** A browser service worker performs attestation
  → X25519 key exchange → AES-256-GCM, so traffic is encrypted to code *inside*
  the enclave even though the host terminates TLS. Enabled with one Procfile line
  (`e2e: true`). See `../docs/steve-e2e.md` for the threat model and lifecycle.

## What a user sees (the `ethereum` pilot)

These aren't just back-office mechanics. On `ethereum`, the proof is surfaced
**in the page header, live, in the user's own browser**:

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

> Client wiring (service worker + verification UI): `apps/ethereum/src/steve/`
> and `apps/ethereum/public/enclave-sw.js`. The other 20 chains use the same
> enclave, just without this client layer yet.

## Verify it yourself

Point the `caution` CLI at the live attestation endpoint. It fetches the signed
Nitro document, rebuilds the EIF from the commit in the manifest, and confirms the
reproduced PCRs match the deployed enclave.

```bash
caution verify --attestation-url https://minitel.kobl.one/attestation
```

<details>
<summary>Example output (passing)</summary>

```
> caution-macos-arm64-untrusted verify --attestation-url https://minitel.kobl.one/attestation
Verifying enclave attestation...
Learn more: https://docs.caution.co/concepts/attestation/

Challenge nonce (sent): 3bf863f059ad8a707bfd05228b101e37f59885461d76c5350ec69eed01238064
Requesting attestation...

Remote PCR values (from deployed enclave):
  PCR0: a930016af18817fd9e9468ccf14508a834cb07dccaae50d8b4a809183d4156d0c4b56fc801120a75a28e7762f48e378f
  PCR1: a930016af18817fd9e9468ccf14508a834cb07dccaae50d8b4a809183d4156d0c4b56fc801120a75a28e7762f48e378f
  PCR2: 21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a

Manifest information:
  App source: https://github.com/vkobel/minitel commit: d88cdce79b5c6663660fd059b30532584dd53d34 branch: feat/caution-enclave
  Enclave source: https://git.distrust.co/public/enclaveos/archive/9582e25239430070667fdd0a6b64d887f1c308df.tar.gz commit: 9582e25239430070667fdd0a6b64d887f1c308df
  Framework source: https://codeberg.org/caution/platform/archive/main.tar.gz commit: 639bc8adc600563d9903fed228d93523a7d66fe2

Reproducing build from remote manifest...
Docker build completed successfully

Expected PCR values:
  PCR0: a930016af18817fd9e9468ccf14508a834cb07dccaae50d8b4a809183d4156d0c4b56fc801120a75a28e7762f48e378f
  PCR1: a930016af18817fd9e9468ccf14508a834cb07dccaae50d8b4a809183d4156d0c4b56fc801120a75a28e7762f48e378f
  PCR2: 21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a

Verifying attestation with bootproof-sdk...
✓ Certificate chain verified against AWS Nitro root CA
✓ All certificates are within validity period
✓ COSE signature verified
✓ Nonce verified (prevents replay attacks)
✓ PCR values match expected

✓ Attestation verification PASSED
The deployed enclave matches the expected PCRs.
This means the code running in the enclave is exactly what you expect.
```

</details>

Or just open the `ethereum` decoder and click **Verified enclave** in the
header — your browser fetches `/attestation`, verifies the AWS signature and PCR
chain, and shows you the result. In DevTools → Network you'll see asset requests
sent as `POST … application/octet-stream` with an `X-E2P-Key` header: ciphertext
the host can't read, bound to the attested enclave.

## Run it locally (the app, not the enclave)

```bash
make build      # bun install + build all 21 SPAs + go test
make run        # serve on http://localhost:8083  (try /, /ethereum/, /ada/)
```

```bash
curl -sI http://localhost:8083/ada/ | grep -i content-security-policy       # has wasm-unsafe-eval
curl -sI http://localhost:8083/ethereum/ | grep -i content-security-policy  # strict default
```

Needs **bun** and **go ≥ 1.22**.

## Build, reproduce & deploy the enclave

The enclave image is built, reproduced, and deployed with the **`caution` CLI** —
see Caution's [fully-managed quickstart](https://docs.caution.co/quickstart/fully-managed/#what-you-need)
for prerequisites (a Caution account + a FIDO2 authenticator; the build itself
needs **Docker + buildx**, as StageX is linux/amd64 only and runs under emulation
on Apple Silicon). **Both `Procfile` and `Containerfile` must be at the repo root
of the branch you deploy.**

```bash
caution login                  # FIDO2/WebAuthn (or `caution register` first)
caution init                   # once; writes .caution/

caution apps build             # build the EIF locally — reproducible, no deploy.
                               # Run it twice and compare PCRs to prove the StageX
                               # build is byte-for-byte deterministic.

caution apps create            # build + deploy to a Nitro enclave
```

The commands are interactive (FIDO2 signing), so they're run directly, not via the
Makefile.

### Updating the UI

```bash
make site && git add deploy/site && git commit -m "chore: rebuild site"
```

Rebuild a **single** chain without wiping the others (the full `make site` /
`build-site.sh` does `rm -rf deploy/site` first):

```bash
make site-one C=ethereum
```

It builds just that app with the right `--base=/<chain>/` and swaps only
`deploy/site/<chain>`, leaving the other 20 untouched. Then commit the rebuilt
dist as above.

CI (`.github/workflows/build-site.yml`) rebuilds the site on push and **fails if
`deploy/site/` is out of sync** with `apps/**` — so run `make site` and commit the
rebuilt dist before pushing. **Don't hand-edit `deploy/site/`.**

## Honest scope & limitations (v1)

A verifiable showcase should be precise about what it does and doesn't prove:

- **The SPAs are prebuilt and committed to `deploy/site/`.** Caution rebuilds from
  the repo at the attested commit and never runs your CI, so the dist must be in
  git. Only the **Go binary** is built inside StageX; the static tree is embedded
  verbatim.
- **So `caution verify` attests the binary, not the UI's provenance.** It proves
  the server matches source and embeds whatever bytes are in `deploy/site/` — not
  that those bytes are the faithful output of `apps/**`. You trust the committed
  dist (CI checks it matches `apps/**`, but the check build is non-hermetic).
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

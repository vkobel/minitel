# minitel in a verifiable enclave — Caution × STEVE × StageX

A technical use case: taking a 21-app, fully client-side transaction-decoder
monorepo and serving it from a **single AWS Nitro enclave** whose every byte —
from the kernel to the UI — can be **independently reproduced and verified**, with
**end-to-end encryption** from the user's browser to inside the enclave.

This folder is the implementation. This README is the overview; the deeper docs
are linked at the end.

---

## The problem

minitel is 21 independent Vite/React SPAs (`apps/ethereum`, `apps/solana`, …),
one per chain, that decode raw transactions **entirely in the browser**. No
backend, no secrets on a server. So why put it in an enclave at all?

Because for a tool people use to inspect transactions before signing them,
**"trust me, the server is serving the right code" is not good enough.** The
interesting properties aren't confidentiality of a database — they're:

1. **Provenance** — can a user prove the code their browser runs is the exact,
   audited source, not a swapped-in malicious bundle?
2. **Host-blindness** — can the machine operating the deployment be cut out of the
   trust boundary entirely?

Three technologies compose to deliver exactly that.

---

## The three pillars

### 1. StageX — reproducible build (the *what*)

[StageX](https://codeberg.org/stagex/stagex) is a full-source-bootstrapped,
hermetic, deterministic toolchain delivered as OCI images. We compile the Go
server inside a digest-pinned `stagex/pallet-go`, with no network, stdlib only,
`SOURCE_DATE_EPOCH=1`, and stripped build IDs, then ship it `FROM scratch`.

The payoff is **bit-for-bit reproducibility**: two independent `--no-cache` builds
produce byte-identical images. We prove it on every change:

```bash
make repro      # two OCI builds, compared with cmp -> "REPRODUCIBLE"
```

That determinism is the foundation everything else stands on — without it,
"verify the enclave matches the source" is impossible.

### 2. Caution — the verifiable enclave platform (the *where*)

[Caution](https://docs.caution.co/) runs the image inside an AWS Nitro Enclave on
a custom EnclaveOS, measured into **PCRs** and attested by the Nitro Security
Module. Two files define the deployment, both at the repo root:

- `Containerfile` — the reproducible StageX recipe above.
- `Procfile` — how to run it (`run: /server`, `e2e: true`).

Anyone can then check the running enclave against the source:

```bash
caution verify --attestation-url https://<host>/attestation
```

This re-downloads the source at the **attested commit**, rebuilds the enclave, and
compares PCR0/1/2 against what the live enclave reports. A match means the bytes
being served are provably the bytes the pinned source produces — StageX
reproducibility is what makes that comparison meaningful.

### 3. STEVE — end-to-end encryption to inside the enclave (the *how it's reached*)

The host terminates TLS, so plain HTTPS leaves the **untrusted host** able to read
traffic. [STEVE](../) ("Secure Transport Encryption Via Enclave") closes that gap:
a browser **service worker** runs attestation → X25519 key exchange (signed by the
attested enclave key) → AES-256-GCM, establishing a second encryption layer the
host **cannot** decrypt. The host's Caddy routes encrypted traffic to STEVE inside
the enclave, which decrypts and forwards plaintext to the app. Enabled with one
Procfile line (`e2e: true`); the client side is wired as a pilot on the `ethereum`
app.

For minitel specifically this is mostly **attested, host-blind delivery of the
UI** (the decoder has no secret payloads in flight) — a strong provenance and
integrity story, and the groundwork for any future server-side functionality.

---

## How they compose

```
   Developer source (apps/**, deploy/**)
        │
        │  StageX: hermetic, deterministic
        ▼
   Reproducible OCI image  ──►  identical hash on any machine (make repro)
        │
        │  Caution: build EIF, measure into PCRs, attest
        ▼
   AWS Nitro enclave  ◄── caution verify reproduces PCRs from the attested commit
        │
        │  STEVE (e2e): browser SW ↔ enclave, host-blind
        ▼
   User's browser runs code it can cryptographically trace to source
```

Each layer depends on the one below: STEVE binds a session to an **attested**
enclave; attestation is only meaningful because the build is **reproducible**;
reproducibility is delivered by **StageX**.

---

## What we actually built

| Piece | What it does |
|---|---|
| `deploy/handler.go`, `deploy/main.go` | Go static server: `go:embed`s the site, per-chain SPA routing, per-chain CSP, listens `:8083` (STEVE's upstream under e2e) |
| `deploy/site/` | The 21 built SPAs, **vendored** (committed) so the enclave build is self-contained and reproducible |
| `deploy/build-site.sh` | Builds all chains with per-chain `--base`, generates the landing page + `csp.json` |
| `Containerfile` (root) | Reproducible StageX `pallet-go` build → `FROM scratch` |
| `Procfile` (root) | Caution run config: `run`, `e2e: true` |
| `apps/ethereum/src/steve/`, `…/public/enclave-sw.js` | STEVE service-worker client (E2E pilot) |
| `Makefile` | `make repro` / `build` / `run` / `digest` |

**A deliberate v1 trade-off:** the SPA bundles are prebuilt and committed rather
than built inside StageX (JS builds aren't yet proven byte-reproducible). So
`caution verify` attests the **server binary** and that it embeds the committed
bytes — not that those bytes derive from `apps/**`. The path to v2 (build the SPAs
inside StageX too) is written up in `CAUTION.md`.

---

## Try it

```bash
make build      # bun install + build all 21 SPAs + go test
make run        # serve locally on http://localhost:8083  (try /, /ethereum/)
make repro      # prove the StageX build is byte-for-byte reproducible
```

Deploy + verify (interactive `caution` CLI) is walked through in `CAUTION.md`.

---

## Documentation map

- **`CAUTION.md`** — practical build/deploy/verify walkthrough, the vendored-site
  rationale, and the v1→v2 reproducibility story.
- **`../docs/steve-e2e.md`** — the STEVE end-to-end encryption showcase: threat
  model, single-origin routing, attestation → key-exchange → encryption lifecycle.
- **`../docs/caution-enclave-design.md`** — the original design spec.
- **Upstream** — [StageX](https://codeberg.org/stagex/stagex),
  [Caution](https://docs.caution.co/), and the `steve` / `steve-js-sdk` projects.

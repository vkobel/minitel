# STEVE end-to-end encryption — how it works

A showcase of the end-to-end encryption layer between a user's browser and the
minitel enclave. This explains **what we have**, how the pieces fit, and what it
does and does not protect. It is descriptive, not aspirational — where something
is only wired as a pilot, it says so.

---

## 1. The one-paragraph version

When minitel runs inside a Caution enclave, the host machine that terminates TLS
is **untrusted** — it can read everything a normal HTTPS reverse proxy can. STEVE
("Secure Transport Encryption Via Enclave") closes that gap: a service worker in
the browser establishes a *second* encryption layer, keyed to the enclave's
verified identity, that only the code **inside** the enclave can decrypt. The
host sees ciphertext even though it terminates TLS. Today this is wired as a
pilot on the `ethereum` app.

---

## 2. Why a second encryption layer at all?

Standard HTTPS protects traffic between the browser and whoever terminates TLS.
In a Nitro/Caution deployment, that terminator is **Caddy on the host**, outside
the enclave's trust boundary. So plain TLS gives you:

```
Browser  ──TLS──►  Host Caddy  ──plaintext──►  Enclave app
                   ▲
                   └─ untrusted: sees plaintext after TLS termination
```

STEVE adds an inner layer that the host cannot read:

```
Browser  ──TLS──►  Host Caddy  ──still E2E-encrypted──►  STEVE (in enclave)  ──plaintext──►  app
   │                  ▲                                     │
   └── E2E key ───────┼─────────────────────────────────── ┘  (shared secret the host never has)
                      └─ untrusted: terminates TLS, but only sees E2E ciphertext
```

Two independent layers, two different terminators:

| Layer | From | To | Terminated at | Purpose |
|-------|------|-----|---------------|---------|
| **TLS** | Browser | Host Caddy | Host (untrusted) | Transport security on the public internet |
| **E2E** | Service worker | STEVE | **Inside the enclave** | Application data the host cannot read |

The E2E key is **bound to attestation** — it is derived against a public key the
enclave proves it holds via a signed AWS Nitro attestation document. A malicious
host cannot substitute its own key without failing attestation verification in
the browser.

---

## 3. The moving parts

| Component | Where it runs | Role |
|-----------|---------------|------|
| `enclave-sw.js` (service worker) | Browser | Intercepts `fetch()`, runs attestation + key exchange, encrypts/decrypts every in-scope request |
| `register.js` | Browser (app bundle) | Thin API to register and drive the service worker |
| **STEVE** (`/steve`) | Enclave | Rust proxy: decrypts inbound requests, forwards plaintext to the app, encrypts responses |
| **bootproofd** | Enclave | Serves the signed Nitro attestation document at `/attestation` |
| **Caddy** | Host | TLS termination + path routing to STEVE / bootproofd / app |
| The app (`/server`) | Enclave | minitel's Go static server — only ever sees plaintext |

STEVE itself is not vendored into this repo. Caution injects it automatically
when the Procfile sets `e2e: true` (it pins a `steve_commit` and adds STEVE to
the enclave's `run.sh`). We only ship the **client** half — the service worker.

---

## 4. The single-origin routing trick

The browser talks to one origin (`https://<domain>`). The host's Caddy fans that
single origin out by path and headers. When `e2e: true`, the **default upstream
is STEVE** — so all app traffic (encrypted *or* plain) flows through STEVE, which
decrypts E2E requests and forwards everything to the app on `127.0.0.1:8083`.
Only `/attestation` bypasses STEVE (it goes to bootproofd). This is why the
service worker can use plain same-origin paths with no CORS:

```
                         https://<domain>  (Caddy, host, TLS)
                                  │
                ┌─────────────────┴──────────────────┐
                │                                     │
          /attestation                        everything else
                │                       (/e2p/*, encrypted POSTs, and plain)
                ▼                                     ▼
          bootproofd                              STEVE  :49500
          :49502                                  (decrypt / passthrough)
          (attestation doc)                          │
                                                      ▼
                                               minitel app  :8083
                                               (/server, plaintext)
```

The relevant host Caddyfile (the default upstream becomes STEVE under e2e):

```caddyfile
handle /e2p/*            { reverse_proxy localhost:49500 }   # key exchange -> STEVE
@e2p_encrypted {                                             # encrypted app traffic
    method POST
    header X-E2P-Key *
    header X-E2P-Original-Method *
    header Content-Type application/octet-stream
}
handle @e2p_encrypted    { reverse_proxy localhost:49500 }   # -> STEVE
handle /attestation      { reverse_proxy localhost:49502 }   # -> bootproofd
handle                   { reverse_proxy localhost:49500 }   # default -> STEVE (e2e)
```

STEVE forwards both decrypted and plain (passthrough, no `X-E2P-Key`) requests to
its hardcoded upstream `http://127.0.0.1:8083`, so **the app must listen on
`:8083`** when e2e is enabled (minitel's server defaults to it; override with
`PORT`). Ports `49500` (STEVE) and `49502` (bootproofd) are internal enclave ports
bridged over vsock; the browser never addresses them directly. Because all of
this is one origin, the service worker's default endpoints (`/attestation`,
`/e2p/v1/create_shared_key`) work unchanged and **no `e2e_cors_origins` is
needed**.

---

## 5. The request lifecycle

### Step 0 — registration (page load)

`main.tsx` calls `initEnclaveE2E()`, which registers `enclave-sw.js` with scope
`/ethereum/`. The worker calls `skipWaiting()` + `clients.claim()`, so it controls
the page immediately.

### Step 1 — attestation (lazy, on first encrypted request)

```
Browser SW ──POST /attestation { nonce } ──► bootproofd
Browser SW ◄── signed Nitro attestation document ──
```

The worker:
1. generates a random 32-byte nonce,
2. fetches the attestation document,
3. **verifies** it with `tee-attestation-js`: certificate chain → COSE signature
   → nonce match → extracts the enclave's **verifying key** (Ed25519) and the
   **PCR** measurements.

If verification fails, no secure channel is established and the request errors —
the host cannot forge an enclave identity.

### Step 2 — key exchange (X25519 ECDH)

```
Browser SW ──POST /e2p/v1/create_shared_key { client_pubkey, nonce } ──► STEVE
Browser SW ◄── { steve_pubkey, signature, enclave_encrypted_shared_key } ──
```

- Both sides generate ephemeral **X25519** keypairs → ECDH shared secret (forward
  secrecy: fresh keys per session).
- STEVE signs `(nonce ‖ steve_pubkey)` with the **attested Ed25519 key** from
  Step 1. The worker verifies that signature, which cryptographically ties the
  key exchange to the *attested* enclave — not a man-in-the-middle.
- An HKDF derives the **AES-256-GCM** session key.

### Step 3 — encrypted requests

For every in-scope `fetch()` that is not on the passthrough/exclude list, the
worker:
1. encrypts the request (method, path, headers, body) with AES-256-GCM,
2. sends it as a `POST` with `Content-Type: application/octet-stream` and the
   `X-E2P-Key` header,
3. Caddy routes it to STEVE, which decrypts and replays the original request to
   the app on `:8083`,
4. STEVE encrypts the app's response, the worker decrypts it, and the page
   receives a normal `Response`.

Keys rotate on an interval (default 30 min) — the worker re-runs Step 2
transparently.

---

## 6. How it maps onto minitel concretely

minitel serves 21 independent SPAs under path prefixes (`/ethereum/`, `/solana/`,
…) from one Go server in one enclave. The pilot wires STEVE into **`ethereum`**:

- **Files added**
  - `apps/ethereum/public/enclave-sw.js` — the service worker, served at
    `/ethereum/enclave-sw.js` (Vite copies `public/` to the chain root). Its scope
    is therefore `/ethereum/` with no `Service-Worker-Allowed` header needed.
  - `apps/ethereum/src/steve/register.js` — vendored SDK module (bundled into the
    app).
  - `apps/ethereum/src/steve/index.ts` — `initEnclaveE2E()`: registers the worker
    and configures it for the path prefix.
  - `apps/ethereum/src/main.tsx` — calls `initEnclaveE2E()` on load.
- **Procfile** — `e2e: true` turns on STEVE in the enclave.

The per-chain configuration the worker is given:

```ts
registerEnclaveServiceWorker({
  swPath: `${base}enclave-sw.js`,        // /ethereum/enclave-sw.js
  scope:  base,                          // /ethereum/
  config: {
    attestationEndpoint: '/attestation',            // root — Caddy -> bootproofd
    keyExchangeEndpoint: '/e2p/v1/create_shared_key',// root — Caddy -> STEVE
    excludePrefixes: ['/attestation', '/e2p/'],     // never encrypt the bootstrap calls
    passthroughPaths: [base, `${base}index.html`, `${base}enclave-sw.js`],
  },
});
```

`base` comes from Vite's `import.meta.env.BASE_URL` (the `--base=/ethereum/` used
at build time), so the same code is correct for any chain when we roll it out.

**What ends up encrypted:** the HTML shell and the worker script are passthrough
so the page can bootstrap before the secure channel exists; **everything else —
the hashed JS/CSS asset requests — is E2E-encrypted** to the enclave.

**No server or CSP change was required.** The Go server already serves `.js` as
`text/javascript`; the existing CSP (`script-src 'self'` covers the worker via the
`worker-src` fallback, `connect-src 'self'` covers the same-origin `/attestation`
and `/e2p/` calls) already permits everything.

---

## 7. What this protects — objectively

Be precise about the value, because minitel is an unusual case.

**What STEVE gives you here:**
- **Host-blind transport.** The untrusted host that terminates TLS cannot read
  request/response contents — it only sees E2E ciphertext routed to STEVE.
- **Attested provenance.** The browser cryptographically verifies it is talking to
  *this* enclave (PCR-measured, AWS-signed) before establishing the channel. The
  asset bytes a user runs are bound to a verifiable enclave identity, not "some
  server claiming to be minitel".
- **Forward secrecy** via ephemeral X25519 keys per session.

**What it does *not* change for minitel specifically:**
- minitel is a **client-side decoder** — transaction parsing happens entirely in
  the browser. It does **not** send private keys or sensitive payloads to the
  server. So unlike, say, a chat or signing service, there is no secret *user
  data in flight* for E2E to protect; what E2E protects here is the
  **confidentiality and integrity of the asset fetches** and the **provenance**
  of the code being served.
- It is **not** a substitute for verifying the build. Reproducibility +
  `caution verify` (see `caution-enclave-design.md`) is what proves the enclave
  runs the expected source; STEVE proves your *session* is talking to that
  attested enclave.

In short: STEVE is most impactful once minitel grows server-side functionality.
For the current static decoder it provides attested, host-blind delivery — a
strong integrity/provenance story — rather than protection of secret payloads.

---

## 8. Cost and trade-offs

- **A round-trip per encrypted asset.** Every non-passthrough request is encrypted
  by the worker and decrypted by STEVE inside the enclave. Bootstrap assets are
  passthrough to keep first paint robust; the rest pay STEVE's hop.
- **Service-worker lifecycle.** First load registers and claims the worker; the
  secure channel is established lazily on the first encrypted request. A failed
  attestation/key-exchange must degrade gracefully — `initEnclaveE2E()` swallows
  errors so a handshake failure cannot blank the decoder.
- **Reproducibility.** The worker is vendored (committed) like the rest of the
  built site, so `caution verify` reproduces it byte-for-byte from source.

---

## 9. Current status

| Piece | State |
|-------|-------|
| Enclave STEVE (`e2e: true`) | Enabled in Procfile; Caution injects STEVE at build |
| Client service worker | **Pilot on `ethereum` only** |
| Other 20 chains | Not wired yet (planned: lift `src/steve/` into `@protocols/ui`, copy the worker per chain in `build-site.sh`) |
| Local verification | Build, tests, SW serving + headers confirmed |
| Live crypto handshake | **Unverified** — attestation needs a real NSM, so the X25519/AES flow can only be exercised on a deployed enclave |

When validating on a live deploy, check **DevTools → Application → Service
Workers** (registered, scope `/ethereum/`, activated) and **Network** (asset
requests sent as `POST … application/octet-stream` with `X-E2P-Key`). If
`tee-attestation-js` turns out to need WebAssembly, a CSP error will appear and
`'wasm-unsafe-eval'` must be added to the chain's policy — this could not surface
locally because the verifier only runs against a real attestation document.

---

## 10. Pointers

- Client wiring: `apps/ethereum/src/steve/index.ts`, `apps/ethereum/src/main.tsx`
- Vendored SDK: `apps/ethereum/public/enclave-sw.js`, `apps/ethereum/src/steve/register.js`
- Enclave switch: `Procfile` (`e2e: true`)
- Enclave/build design: `docs/caution-enclave-design.md`
- Deploy/verify walkthrough: `deploy/CAUTION.md`
- Upstream STEVE + SDK: the `steve` and `steve-js-sdk` projects

// STEVE end-to-end encryption (client side).
//
// Registers the steve-js-sdk service worker so every in-scope request is
// transparently E2E-encrypted (AES-256-GCM, bound to the verified Nitro
// attestation) and routed to the STEVE proxy inside the enclave. Caution's
// host Caddy routes `/e2p/*` -> STEVE and `/attestation` -> bootproofd on the
// app's own origin, so the SDK's same-origin endpoints work as-is.
//
// `enclave-sw.js` lives in this app's `public/` and is served at
// `<base>enclave-sw.js`; its scope is therefore `<base>` (e.g. `/ethereum/`)
// without needing a `Service-Worker-Allowed` header.

// @ts-expect-error - vendored JS module from steve-js-sdk/dist, ships no types
import { registerEnclaveServiceWorker } from './register.js';

export async function initEnclaveE2E(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  // Vite injects the per-chain base (e.g. "/ethereum/") at build time.
  const base = import.meta.env.BASE_URL;

  try {
    const client = await registerEnclaveServiceWorker({
      swPath: `${base}enclave-sw.js`,
      scope: base,
      config: {
        // Absolute root paths — Caddy routes these to the enclave services,
        // independent of the app's base prefix.
        attestationEndpoint: '/attestation',
        keyExchangeEndpoint: '/e2p/v1/create_shared_key',
        excludePrefixes: ['/attestation', '/e2p/'],
        // Leave the bootstrap shell unencrypted so the page can load before the
        // secure channel is established; everything else (assets) is encrypted.
        passthroughPaths: [base, `${base}index.html`, `${base}enclave-sw.js`],
      },
    });
    await client.initialize();
  } catch (err) {
    // E2E is best-effort: a registration failure must not blank the decoder.
    console.error('STEVE E2E init failed:', err);
  }
}

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
import { registerEnclaveServiceWorker } from '@/steve/register.js';

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

// Status reported by the STEVE service worker's `get-status` message. Mirrors
// the reply shape in `enclave-sw.js` (handleMessage -> "get-status").
export type SteveStatus = {
  type: 'status';
  initialized: boolean;
  error: string | null;
  attestation: {
    verified: boolean;
    pcrs: Record<string, string>;
    moduleId: string;
  } | null;
  lastKeyRotation: number | null;
};

/**
 * Query the live STEVE service worker for its E2E status. Returns `null` when
 * no controlling/active worker can be reached (no SW support, not yet
 * registered, or no reply within `timeoutMs`). This reads the worker's real
 * state — it does not assume or fabricate it.
 */
export async function getSteveStatus(timeoutMs = 4000): Promise<SteveStatus | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  // `controller` is null until the SW controls the page; fall back to the
  // active worker of the current registration so we can still query it.
  const registration = await navigator.serviceWorker.getRegistration();
  const target = navigator.serviceWorker.controller ?? registration?.active ?? null;
  if (!target) {
    return null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data as SteveStatus);
    };
    try {
      target.postMessage({ type: 'get-status' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

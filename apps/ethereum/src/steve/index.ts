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
//
// We keep the registered client and pipe its live `enclave:*` events into the
// STEVE store so the header badges and detail panel reflect the worker's real
// handshake state (see `store.ts`).

// @ts-expect-error - vendored JS module from steve-js-sdk/dist, ships no types
import { registerEnclaveServiceWorker } from '@/steve/register.js';
import {
  applyStatus,
  markUnsupported,
  onEncryptedAsset,
  onError,
  onInitialized,
  onKeyExchange,
  onStage,
} from '@/steve/store';

export async function initEnclaveE2E(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    markUnsupported();
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
        // Stream encrypted asset traffic to the page for the verification panel.
        emitEncryptedPayloads: true,
      },
    });

    // Subscribe to live handshake events before kicking off initialization so
    // we don't miss any. (`enclave:` prefix is stripped by EnclaveClient.)
    client.on('status', (data: { stage?: string }) => {
      if (data.stage) {
        onStage(data.stage);
      }
    });
    client.on('initialized', (data: { pcrs?: Record<string, string>; moduleId?: string; verifyingKey?: string }) =>
      onInitialized(data),
    );
    client.on('key-exchange', (data: Parameters<typeof onKeyExchange>[0]) => onKeyExchange(data));
    client.on('key-rotated', () => {
      /* lastKeyRotation already refreshed via the key-exchange event */
    });
    client.on('error', (data: { message?: string }) => onError(data.message ?? 'Unknown STEVE error'));
    client.on('encrypted-request', (data: { path?: string; size: number; payload: string }) =>
      onEncryptedAsset('request', data),
    );
    client.on('encrypted-response', (data: { status?: number; size: number; payload: string }) =>
      onEncryptedAsset('response', data),
    );

    // Backfill whatever the worker already did (e.g. handshake triggered by an
    // asset fetch before this code ran).
    try {
      applyStatus(await client.getStatus());
    } catch {
      /* status is best-effort; live events will fill in */
    }

    await client.initialize();
    applyStatus(await client.getStatus());
  } catch (err) {
    // E2E is best-effort: a registration failure must not blank the decoder.
    console.error('STEVE E2E init failed:', err);
    onError(err instanceof Error ? err.message : String(err));
  }
}

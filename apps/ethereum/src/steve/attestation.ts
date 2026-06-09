// Attestation modal (client side).
//
// Opens the vendored distrust `attestation-widget` as a modal that fetches
// `/attestation`, verifies the Nitro attestation document (COSE signature ->
// AWS root CA -> cert chain -> nonce -> PCRs) with `tee-attestation-js`, and
// shows the result — PCRs and the app/enclave source commits from the manifest
// — so the enclave's verified identity is *visible* on demand.
//
// Standalone: it does its own attestation fetch + verify, independent of the
// STEVE service worker (`enclave-sw.js`). Both hit the same `/attestation`
// (Caddy -> bootproofd) with the same `{ document }` contract, so the modal
// reflects the same attested enclave the service worker E2E-encrypts to. It
// verifies the enclave's *attestation*; it does not itself exercise STEVE's
// encrypt/decrypt path.

// @ts-expect-error - vendored JS bundle from attestation-widget/dist, ships no types
import { AttestationWidget, showModal } from '@/steve/attestation-widget.js';
import { setEnclaveVerified } from '@/steve/store';

let isOpen = false;

// Runs a background attestation check independent of the STEVE service worker.
// Renders the widget into a detached (off-screen) element so no UI appears, but
// the widget's internal DOM ops succeed. Result feeds the enclave verification badge.
export function startEnclaveVerification(): void {
  const detached = document.createElement('div');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widget = new (AttestationWidget as any)({
    attestationUrl: '/attestation',
    autoVerify: false,
    onVerified: () => setEnclaveVerified(true),
    onError: () => setEnclaveVerified(false),
  });
  widget.render(detached);
  (widget.verify() as Promise<void>).catch(() => setEnclaveVerified(false));
}

export function openAttestationModal(): void {
  if (isOpen) {
    return;
  }
  isOpen = true;
  try {
    showModal({
      // Absolute root path — Caddy routes it to bootproofd regardless of the
      // app's base prefix (mirrors the service worker's attestation endpoint).
      attestationUrl: '/attestation',
      onClose: () => {
        isOpen = false;
      },
    });
  } catch (err) {
    isOpen = false;
    console.error('Attestation modal failed:', err);
  }
}

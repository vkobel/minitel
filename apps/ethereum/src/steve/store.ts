// Live STEVE state store.
//
// Single source of truth for the E2E handshake, fed by the STEVE service
// worker's events (`enclave:*` broadcasts) and its `get-status` reply. Both the
// header badges (truthful pending → verified/failed) and the detail panel read
// from here via `useSteveState`. It only ever reflects what the worker reports
// — it never fabricates a verified state.

import { useSyncExternalStore } from 'react';

// Handshake phases, mirroring the worker's `stage` values plus terminal states.
export type Phase =
  | 'idle'
  | 'requesting-attestation'
  | 'verifying-attestation'
  | 'establishing-channel'
  | 'rotating-key'
  | 'initialized'
  | 'error';

export type AttestationInfo = {
  verified: boolean;
  pcrs: Record<string, string>;
  moduleId: string;
  verifyingKey: string | null;
};

export type KeyExchangeInfo = {
  ourPublicKey: string;
  theirPublicKey: string;
  signature: string;
  signatureValid: boolean;
  sharedSecretBits: number;
  kdf: string;
  cipher: string;
};

export type EncryptedAsset = {
  id: number;
  direction: 'request' | 'response';
  path?: string;
  status?: number;
  size: number;
  payload: string;
  ts: number;
};

export type SteveState = {
  /** Whether service workers (and therefore E2E) are available at all. */
  supported: boolean;
  phase: Phase;
  initialized: boolean;
  error: string | null;
  attestation: AttestationInfo | null;
  keyExchange: KeyExchangeInfo | null;
  /** Live feed of encrypted asset traffic (most recent last), capped. */
  assets: EncryptedAsset[];
  lastKeyRotation: number | null;
};

const MAX_ASSETS = 50;

let snapshot: SteveState = {
  supported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  phase: 'idle',
  initialized: false,
  error: null,
  attestation: null,
  keyExchange: null,
  assets: [],
  lastKeyRotation: null,
};

const listeners = new Set<() => void>();
let assetSeq = 0;

function set(patch: Partial<SteveState>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SteveState {
  return snapshot;
}

export function useSteveState(): SteveState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Derive the phase from a status snapshot: a reported error wins, then a
// completed handshake, then the in-flight stage.
function phaseFromStatus(initialized: boolean, error: string | null, stage: string | null): Phase {
  if (error) {
    return 'error';
  }
  if (initialized) {
    return 'initialized';
  }
  return (stage as Phase) ?? 'idle';
}

// --- Mutators driven by the service-worker plumbing in index.ts ---

type StatusReply = {
  initialized?: boolean;
  error?: string | null;
  stage?: string | null;
  attestation?: AttestationInfo | null;
  keyExchange?: KeyExchangeInfo | null;
  lastKeyRotation?: number | null;
};

/** Apply a full `get-status` reply (used to backfill state on load). */
export function applyStatus(status: StatusReply | null): void {
  if (!status) {
    return;
  }
  const initialized = status.initialized ?? snapshot.initialized;
  const error = status.error ?? null;
  set({
    initialized,
    error,
    phase: phaseFromStatus(initialized, error, status.stage ?? null),
    attestation: status.attestation ?? snapshot.attestation,
    keyExchange: status.keyExchange ?? snapshot.keyExchange,
    lastKeyRotation: status.lastKeyRotation ?? snapshot.lastKeyRotation,
  });
}

export function onStage(stage: string): void {
  // Don't let a late stage event clobber a terminal state.
  if (snapshot.phase === 'initialized' && stage !== 'rotating-key') {
    return;
  }
  set({ phase: (stage as Phase) ?? snapshot.phase, error: stage === 'rotating-key' ? null : snapshot.error });
}

export function onInitialized(data: { pcrs?: Record<string, string>; moduleId?: string; verifyingKey?: string }): void {
  set({
    initialized: true,
    phase: 'initialized',
    error: null,
    attestation: {
      verified: true,
      pcrs: data.pcrs ?? snapshot.attestation?.pcrs ?? {},
      moduleId: data.moduleId ?? snapshot.attestation?.moduleId ?? '',
      verifyingKey: data.verifyingKey ?? snapshot.attestation?.verifyingKey ?? null,
    },
  });
}

export function onKeyExchange(data: KeyExchangeInfo): void {
  set({ keyExchange: data, lastKeyRotation: Date.now() });
}

export function onError(message: string): void {
  set({ phase: 'error', error: message });
}

export function onEncryptedAsset(
  direction: 'request' | 'response',
  data: { path?: string; status?: number; size: number; payload: string },
): void {
  const asset: EncryptedAsset = {
    id: ++assetSeq,
    direction,
    path: data.path,
    status: data.status,
    size: data.size,
    payload: data.payload,
    ts: Date.now(),
  };
  const assets = [...snapshot.assets, asset].slice(-MAX_ASSETS);
  set({ assets });
}

export function markUnsupported(): void {
  set({ supported: false, phase: 'idle' });
}

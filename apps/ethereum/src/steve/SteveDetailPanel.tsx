// STEVE verification detail panel.
//
// Live, on-page view of the secure-channel handshake the service worker
// performs — attestation → key exchange → encrypted asset traffic — mirroring
// the standalone steve-e2e-tester. Reads the STEVE store, so it shows the
// worker's real state (PCRs, the attested Ed25519 key, the X25519 ECDH key
// exchange + signature check, and each encrypted asset as it streams).

import { Badge, cn } from '@protocols/ui';
import {
  CheckCircle2Icon,
  CircleIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react';
import { useSteveState } from '@/steve/store';

type StepState = 'pending' | 'running' | 'ok' | 'error';

const STEP_ICON: Record<StepState, { Icon: typeof CircleIcon; className: string; spin?: boolean }> = {
  pending: { Icon: CircleIcon, className: 'text-muted-foreground/50' },
  running: { Icon: Loader2Icon, className: 'text-amber-500', spin: true },
  ok: { Icon: CheckCircle2Icon, className: 'text-emerald-500' },
  error: { Icon: XCircleIcon, className: 'text-red-500' },
};

function StepHeader({ state, title, Lead }: { state: StepState; title: string; Lead: typeof LockIcon }) {
  const { Icon, className, spin } = STEP_ICON[state];
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn('size-4 shrink-0', className, spin && 'animate-spin')} />
      <Lead className="size-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-sm">{title}</span>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'ok' | 'error' | 'muted' }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="text-xs text-muted-foreground shrink-0 sm:w-40">{label}</span>
      <span
        className={cn(
          'font-mono text-xs break-all',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'error' && 'text-red-600 dark:text-red-400',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StepBody({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 ml-6 flex flex-col gap-1.5 border-l border-border pl-4">{children}</div>;
}

export function SteveDetailPanel({ onClose }: { onClose: () => void }) {
  const { supported, phase, initialized, error, attestation, keyExchange, assets } = useSteveState();

  const attVerified = attestation?.verified === true;
  const attState: StepState = attVerified
    ? 'ok'
    : phase === 'error' && !attVerified
      ? 'error'
      : phase === 'requesting-attestation' || phase === 'verifying-attestation'
        ? 'running'
        : phase === 'idle'
          ? 'pending'
          : 'ok';

  const kexValid = keyExchange?.signatureValid === true;
  const kexState: StepState = kexValid
    ? 'ok'
    : keyExchange && !keyExchange.signatureValid
      ? 'error'
      : phase === 'error' && attVerified
        ? 'error'
        : phase === 'establishing-channel'
          ? 'running'
          : initialized
            ? 'ok'
            : 'pending';

  const sessionState: StepState = initialized ? 'ok' : phase === 'error' && attVerified ? 'error' : 'pending';

  const pcrEntries = Object.entries(attestation?.pcrs ?? {})
    .filter(([pcr]) => ['PCR0', 'PCR1', 'PCR2', 'PCR3', 'PCR4', 'PCR8'].includes(pcr))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="border-b border-border bg-muted/20">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">STEVE end-to-end encryption</h2>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              attestation → key exchange → encrypted assets
            </Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close STEVE panel"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {!supported && (
          <p className="text-sm text-muted-foreground">
            Service workers aren't available in this browser, so end-to-end encryption can't be established.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            <span className="font-medium">Error:</span> {error}
          </p>
        )}

        {/* Step 1 — Attestation */}
        <div>
          <StepHeader state={attState} title="1 · Attestation" Lead={ShieldCheckIcon} />
          <StepBody>
            <Field
              label="Nitro attestation"
              value={
                attVerified
                  ? '✓ verified — COSE signature · cert chain → AWS root CA · nonce'
                  : attState === 'error'
                    ? '✗ verification failed'
                    : 'verifying COSE signature, cert chain, nonce…'
              }
              tone={attVerified ? 'ok' : attState === 'error' ? 'error' : 'muted'}
            />
            {attestation?.moduleId && <Field label="module id" value={attestation.moduleId} />}
            {attestation?.verifyingKey && (
              <Field
                label="STEVE key (Ed25519)"
                value={`${attestation.verifyingKey} (${attestation.verifyingKey.length / 2} bytes)`}
              />
            )}
            {pcrEntries.length > 0 && (
              <div className="flex flex-col gap-1 pt-1">
                {pcrEntries.map(([pcr, value]) => (
                  <Field key={pcr} label={pcr} value={value} />
                ))}
              </div>
            )}
          </StepBody>
        </div>

        {/* Step 2 — Key exchange */}
        <div>
          <StepHeader state={kexState} title="2 · Key exchange" Lead={KeyRoundIcon} />
          <StepBody>
            {keyExchange ? (
              <>
                <Field
                  label="Ed25519 signature"
                  value={
                    keyExchange.signatureValid
                      ? '✓ valid — key exchange bound to the attested enclave'
                      : '✗ INVALID — not from the attested enclave'
                  }
                  tone={keyExchange.signatureValid ? 'ok' : 'error'}
                />
                <Field label="our X25519 pubkey" value={keyExchange.ourPublicKey} />
                <Field label="enclave X25519 pubkey" value={keyExchange.theirPublicKey} />
                <Field label="signature" value={keyExchange.signature} tone="muted" />
                <Field
                  label="key derivation"
                  value={`X25519 ECDH (${keyExchange.sharedSecretBits}-bit) → ${keyExchange.kdf}`}
                  tone="muted"
                />
                <Field label="session cipher" value={keyExchange.cipher} tone={initialized ? 'ok' : 'muted'} />
              </>
            ) : (
              <Field
                label="status"
                value={
                  kexState === 'running'
                    ? 'exchanging keys with STEVE…'
                    : kexState === 'error'
                      ? 'key exchange failed'
                      : 'waiting for attestation…'
                }
                tone={kexState === 'error' ? 'error' : 'muted'}
              />
            )}
          </StepBody>
        </div>

        {/* Step 3 — Encrypted asset traffic */}
        <div>
          <StepHeader state={sessionState} title="3 · Encrypted assets" Lead={LockIcon} />
          <StepBody>
            <Field
              label="secure channel"
              value={
                initialized
                  ? '✓ active — every in-scope asset (CSS/JS) is AES-256-GCM encrypted to the enclave'
                  : 'not yet established'
              }
              tone={initialized ? 'ok' : 'muted'}
            />
            {assets.length === 0 ? (
              <Field
                label="traffic"
                value={
                  initialized
                    ? 'no encrypted asset requests observed yet (reload to see cached assets re-fetched encrypted)'
                    : '—'
                }
                tone="muted"
              />
            ) : (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background/50">
                {assets
                  .slice()
                  .reverse()
                  .map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-2 border-b border-border/50 px-2 py-1 text-xs last:border-b-0"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 font-mono',
                          asset.direction === 'request'
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-violet-600 dark:text-violet-400',
                        )}
                      >
                        {asset.direction === 'request' ? '→ req' : '← res'}
                      </Badge>
                      <span className="font-mono truncate flex-1 text-muted-foreground">
                        {asset.path ?? (asset.status != null ? `status ${asset.status}` : 'response')}
                      </span>
                      <span className="font-mono text-muted-foreground shrink-0">{asset.size} B</span>
                    </div>
                  ))}
              </div>
            )}
          </StepBody>
        </div>
      </div>
    </section>
  );
}

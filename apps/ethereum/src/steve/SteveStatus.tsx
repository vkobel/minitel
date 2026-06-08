// Live STEVE end-to-end-encryption indicator.
//
// Polls the STEVE service worker's `get-status` and reflects its *actual*
// state — it never claims E2E is active without the worker reporting
// `initialized` + a verified attestation. Distinct from the attestation modal:
// that verifies the enclave's identity; this shows whether your session's
// traffic is currently E2E-encrypted to it.

import { cn } from '@protocols/ui';
import { useEffect, useState } from 'react';
import { getSteveStatus } from '@/steve';

type PillState = 'loading' | 'active' | 'inactive' | 'error';

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 12; // ~36s before settling, to allow the SW handshake

const PRESENTATION: Record<PillState, { label: string; dot: string; text: string }> = {
  loading: { label: 'E2E connecting', dot: 'bg-amber-500 animate-pulse', text: 'text-muted-foreground' },
  active: { label: 'E2E encrypted', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  error: { label: 'E2E error', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  inactive: { label: 'E2E off', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

export function SteveStatus() {
  const [state, setState] = useState<PillState>('loading');
  const [detail, setDetail] = useState('Checking end-to-end encryption…');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const tick = async () => {
      const status = await getSteveStatus();
      if (cancelled) {
        return;
      }
      attempts += 1;

      if (status?.error) {
        setState('error');
        setDetail(`End-to-end encryption error: ${status.error}`);
        return;
      }
      if (status?.initialized && status.attestation?.verified) {
        setState('active');
        setDetail('Your traffic is end-to-end encrypted to the verified enclave (STEVE).');
        return;
      }
      // Not ready yet — keep polling until the handshake completes or we give up.
      if (attempts >= MAX_ATTEMPTS) {
        setState('inactive');
        setDetail(
          status
            ? 'End-to-end encryption is not active for this session.'
            : 'End-to-end encryption unavailable (no service worker controlling this page).',
        );
        return;
      }
      setState('loading');
      setDetail('Establishing end-to-end encryption to the enclave…');
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const { label, dot, text } = PRESENTATION[state];

  return (
    <output
      title={detail}
      aria-label={detail}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm select-none',
        text,
      )}
    >
      <span className={cn('size-2 rounded-full', dot)} />
      {label}
    </output>
  );
}

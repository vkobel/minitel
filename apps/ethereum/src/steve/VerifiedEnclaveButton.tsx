// Header "Verified enclave" badge.
//
// Truthful: it reflects the *actual* attestation verdict from the STEVE store,
// not static text. Pending/amber while the enclave is being verified, green
// once the Nitro attestation is verified, red if verification fails. Clicking
// opens the attestation modal for the full on-demand detail (PCRs, source
// commits) via the vendored distrust widget.

import { Button, cn } from '@protocols/ui';
import { Loader2Icon, ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';
import { openAttestationModal } from '@/steve/attestation';
import { useSteveState } from '@/steve/store';

type Verdict = 'pending' | 'verified' | 'failed';

function verdictOf(phase: string, verified: boolean | undefined, error: string | null): Verdict {
  if (verified) {
    return 'verified';
  }
  if (phase === 'error' || verified === false || error) {
    return 'failed';
  }
  return 'pending';
}

const PRESENTATION: Record<
  Verdict,
  { label: string; className: string; Icon: typeof ShieldCheckIcon; spin?: boolean }
> = {
  pending: {
    label: 'Verifying enclave…',
    className: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
    Icon: Loader2Icon,
    spin: true,
  },
  verified: {
    label: 'Verified enclave',
    className: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
    Icon: ShieldCheckIcon,
  },
  failed: {
    label: 'Verification failed',
    className: 'border-red-500/40 text-red-600 dark:text-red-400',
    Icon: ShieldAlertIcon,
  },
};

export function VerifiedEnclaveButton() {
  const { phase, attestation, error } = useSteveState();
  const verdict = verdictOf(phase, attestation?.verified, error);
  const { label, className, Icon, spin } = PRESENTATION[verdict];

  return (
    <Button
      variant="outline"
      onClick={openAttestationModal}
      aria-label="Verify enclave attestation"
      className={cn(className)}
    >
      <Icon className={cn(spin && 'animate-spin')} />
      {label}
    </Button>
  );
}

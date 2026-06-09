// Header "Verified enclave" badge.
//
// Reflects the result of a direct (STEVE-independent) Nitro attestation check:
// pending while the check is in-flight, green once the enclave is verified,
// red if attestation fails. Independent of the STEVE service worker so a
// browser that can't register SWs (e.g. Chrome over self-signed TLS) still
// shows the correct attestation result. Clicking opens the full detail modal.

import { Button, cn } from '@protocols/ui';
import { Loader2Icon, ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react';
import { openAttestationModal } from '@/steve/attestation';
import { useSteveState } from '@/steve/store';

type Verdict = 'pending' | 'verified' | 'failed';

function verdictOf(enclaveVerified: boolean | null): Verdict {
  if (enclaveVerified === true) return 'verified';
  if (enclaveVerified === false) return 'failed';
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
  const { enclaveVerified } = useSteveState();
  const verdict = verdictOf(enclaveVerified);
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

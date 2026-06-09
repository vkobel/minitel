// Header E2E status pill.
//
// Reflects the live STEVE secure-channel state from the store: amber while the
// handshake is in flight, green once traffic is E2E-encrypted to the verified
// enclave, red on error. Clicking it toggles the STEVE verification panel.

import { cn } from '@protocols/ui';
import { useSteveState } from '@/steve/store';

type PillState = 'connecting' | 'active' | 'error' | 'unavailable';

const PRESENTATION: Record<PillState, { label: string; dot: string; text: string }> = {
  connecting: {
    label: 'E2E connecting',
    dot: 'bg-amber-500 animate-pulse',
    text: 'text-amber-600 dark:text-amber-400',
  },
  active: { label: 'E2E encrypted', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  error: { label: 'E2E error', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  unavailable: { label: 'E2E unavailable', dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
};

type Props = {
  isOpen: boolean;
  onToggle: () => void;
};

export function SteveStatusPill({ isOpen, onToggle }: Props) {
  const { supported, phase, initialized, error } = useSteveState();

  let pill: PillState = 'connecting';
  if (!supported) {
    pill = 'unavailable';
  } else if (phase === 'error') {
    pill = 'error';
  } else if (initialized) {
    pill = 'active';
  }

  const { label, dot, text } = PRESENTATION[pill];
  const detail = error
    ? `End-to-end encryption error: ${error}`
    : initialized
      ? 'Your traffic is end-to-end encrypted to the verified enclave (STEVE).'
      : 'Establishing end-to-end encryption to the enclave…';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={detail}
      aria-label={detail}
      aria-expanded={isOpen}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm select-none transition-colors cursor-pointer',
        isOpen ? 'border-foreground/30 bg-muted/50' : 'border-border hover:bg-muted/40',
        text,
      )}
    >
      <span className={cn('size-2 rounded-full', dot)} />
      {label}
    </button>
  );
}

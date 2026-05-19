import type { LeaveStatus } from '@/lib/types';
import styles from './StatusPill.module.css';

type Status = LeaveStatus | string;

const VARIANT_MAP: Record<string, string> = {
  pending_approval: 'warning',
  approved: 'success',
  scheduled: 'success',
  taken: 'neutral',
  declined: 'danger',
  cancelled: 'neutral',
  draft: 'neutral',
};

interface StatusPillProps {
  status: Status;
  label: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const variant = VARIANT_MAP[status] ?? 'neutral';
  return (
    <span className={[styles.pill, styles[variant]].join(' ')}>
      {label}
    </span>
  );
}

'use client';
import { useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/Button';
import type { ApprovalItem } from '@/lib/types';
import styles from './ApprovalCard.module.css';

interface ApprovalCardProps {
  item: ApprovalItem;
  onDecide: (instanceId: string, stepId: string, decision: 'approved' | 'declined', note?: string) => Promise<void>;
}

const MODULE_COLOR: Record<string, string> = {
  leave: 'var(--color-blue-600)',
  letters: 'var(--color-orange-500)',
  payroll: 'var(--color-green-500)',
  benefits: 'var(--color-gray-500)',
};

function formatSla(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function ApprovalCard({ item, onDecide }: ApprovalCardProps) {
  const { t, locale } = useLocale();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function decide(decision: 'approved' | 'declined') {
    setBusy(true);
    try {
      await onDecide(item.instanceId, item.stepId, decision, note || undefined);
    } finally {
      setBusy(false);
    }
  }

  const slaDue = new Date(item.slaDueAt);
  const isOverdue = slaDue < new Date();

  return (
    <article className={styles.card} aria-label={item.title}>
      <div className={styles.moduleTag} style={{ '--mod-color': MODULE_COLOR[item.module] } as React.CSSProperties}>
        {item.module}
      </div>

      <div className={styles.body}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.requester}>{item.requesterName}</p>
          </div>
          <div className={styles.slaBadge} data-overdue={isOverdue ? '' : undefined}>
            <span className={styles.slaLabel}>{t('approvals_sla')}</span>
            <bdi className="ltr-isolate">{formatSla(item.slaDueAt, locale)}</bdi>
          </div>
        </div>

        <p className={styles.summary}>{item.summary}</p>

        {declining && (
          <div className={styles.noteRow}>
            <label htmlFor={`note-${item.instanceId}`} className={styles.noteLabel}>
              Decline reason
            </label>
            <textarea
              id={`note-${item.instanceId}`}
              className={styles.noteInput}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`note-hint-${item.instanceId}`}
            />
            <span id={`note-hint-${item.instanceId}`} className={styles.noteHint}>
              Optional — sent to the requester
            </span>
          </div>
        )}

        <div className={styles.actions} role="group" aria-label={`Actions for ${item.title}`}>
          {!declining ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeclining(true)}
                disabled={busy}
              >
                {t('approvals_decline')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={busy}
                onClick={() => decide('approved')}
              >
                {t('approvals_approve')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDeclining(false); setNote(''); }}
                disabled={busy}
              >
                {t('form_cancel')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={busy}
                onClick={() => decide('declined')}
              >
                {t('approvals_decline')}
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

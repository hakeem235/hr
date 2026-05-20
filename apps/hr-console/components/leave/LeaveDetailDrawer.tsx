'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchLeaveRequest, cancelLeaveRequest } from '@/lib/api';
import type { LeaveRecord } from '@/lib/types';
import styles from './NewLeaveDrawer.module.css';
import detailStyles from './LeaveDetailDrawer.module.css';

interface LeaveDetailDrawerProps {
  requestId: string | null;
  onClose: () => void;
  onCancelled: () => void;
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const CANCELLABLE: string[] = ['pending_approval', 'approved', 'scheduled'];

export function LeaveDetailDrawer({ requestId, onClose, onCancelled }: LeaveDetailDrawerProps) {
  const { t, locale } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [record, setRecord] = useState<LeaveRecord | null>(null);
  const [etag, setEtag] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const open = requestId !== null;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) { el.showModal(); } else { el.close(); }
  }, [open]);

  useEffect(() => {
    if (!requestId) { setRecord(null); setEtag(''); setError(null); setConfirmOpen(false); return; }
    setLoading(true);
    setError(null);
    fetchLeaveRequest(requestId)
      .then(({ record: r, etag: e }) => { setRecord(r); setEtag(e); })
      .catch(() => setError(t('error_fetch')))
      .finally(() => setLoading(false));
  }, [requestId, t]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function handleCancel() {
    if (!record) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelLeaveRequest(record.id, etag);
      setToast(t('leave_cancel_success'));
      setTimeout(() => { setToast(null); onCancelled(); }, 1200);
    } catch {
      setError(t('leave_cancel_failed'));
    } finally {
      setCancelling(false);
      setConfirmOpen(false);
    }
  }

  const canCancel = record && CANCELLABLE.includes(record.status);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="detail-drawer-title"
      aria-describedby={record ? 'detail-drawer-body' : undefined}
      onClick={handleBackdropClick}
    >
      <div className={styles.drawer} role="document">
        <div className={styles.drawerHeader}>
          <h2 id="detail-drawer-title" className={styles.drawerTitle}>
            {t('leave_detail_title')}
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('form_cancel')}
          >
            ✕
          </button>
        </div>

        <div id="detail-drawer-body" className={detailStyles.body}>
          {loading && (
            <div className={detailStyles.loadingRows}>
              {[1,2,3,4].map((i) => (
                <div key={i} className={detailStyles.skelRow}>
                  <span className={detailStyles.skelLabel} />
                  <span className={detailStyles.skelValue} />
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <p className={detailStyles.error} role="alert">{error}</p>
          )}

          {record && !loading && (
            <>
              <dl className={detailStyles.fields}>
                <div className={detailStyles.field}>
                  <dt>{t('leave_detail_employee')}</dt>
                  <dd><bdi className="ltr-isolate">{record.employeeId}</bdi></dd>
                </div>
                <div className={detailStyles.field}>
                  <dt>{t('leave_detail_type')}</dt>
                  <dd className={detailStyles.capitalize}>{record.leaveTypeId.replace(/_/g, ' ')}</dd>
                </div>
                <div className={detailStyles.field}>
                  <dt>{t('col_status')}</dt>
                  <dd>
                    <StatusPill
                      status={record.status}
                      label={t(`status_${record.status}` as Parameters<typeof t>[0])}
                    />
                  </dd>
                </div>
                <div className={detailStyles.field}>
                  <dt>{t('leave_detail_dates')}</dt>
                  <dd>
                    <bdi className="ltr-isolate">
                      {formatDate(record.startDate, locale)}
                    </bdi>
                    {' — '}
                    <bdi className="ltr-isolate">
                      {formatDate(record.endDate, locale)}
                    </bdi>
                  </dd>
                </div>
                <div className={detailStyles.field}>
                  <dt>{t('leave_detail_days')}</dt>
                  <dd>
                    <bdi className="ltr-isolate">
                      {record.workingDays} {record.workingDays === 1 ? t('day') : t('days')}
                    </bdi>
                  </dd>
                </div>
                {record.reason && (
                  <div className={detailStyles.field}>
                    <dt>{t('leave_detail_reason')}</dt>
                    <dd>{record.reason}</dd>
                  </div>
                )}
                <div className={detailStyles.field}>
                  <dt>{t('leave_detail_submitted')}</dt>
                  <dd><bdi className="ltr-isolate">{formatDate(record.createdAt, locale)}</bdi></dd>
                </div>
                {record.currentStep && (
                  <div className={detailStyles.field}>
                    <dt>{t('leave_detail_workflow')}</dt>
                    <dd><bdi className="ltr-isolate">{record.currentStep.actor}</bdi></dd>
                  </div>
                )}
              </dl>

              {canCancel && !confirmOpen && (
                <div className={detailStyles.actions}>
                  <button
                    className={detailStyles.cancelBtn}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t('leave_cancel_request')}
                  </button>
                </div>
              )}

              {confirmOpen && (
                <div className={detailStyles.confirm} role="region" aria-label="Confirm cancellation">
                  <p className={detailStyles.confirmText}>{t('leave_cancel_confirm')}</p>
                  <div className={detailStyles.confirmActions}>
                    <button
                      className={detailStyles.confirmYes}
                      onClick={handleCancel}
                      disabled={cancelling}
                      aria-busy={cancelling}
                    >
                      {cancelling ? t('leave_loading_more') : t('leave_cancel_request')}
                    </button>
                    <button
                      className={detailStyles.confirmNo}
                      onClick={() => setConfirmOpen(false)}
                      disabled={cancelling}
                    >
                      {t('form_cancel')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {toast && (
          <div className={detailStyles.toast} role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </dialog>
  );
}

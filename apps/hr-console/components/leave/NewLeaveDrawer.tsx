'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/Button';
import { createLeaveRequest } from '@/lib/api';
import type { LeaveType } from '@/lib/types';
import styles from './NewLeaveDrawer.module.css';

interface NewLeaveDrawerProps {
  open: boolean;
  leaveTypes: LeaveType[];
  onClose: () => void;
  onSuccess: () => void;
}

export function NewLeaveDrawer({ open, leaveTypes, onClose, onSuccess }: NewLeaveDrawerProps) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  /* Close on backdrop click */
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const employeeId = fd.get('employeeId') as string;
    const leaveTypeId = fd.get('leaveTypeId') as string;
    const startDate = fd.get('startDate') as string;
    const endDate = fd.get('endDate') as string;
    const reason = fd.get('reason') as string;

    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      setError(t('form_required'));
      return;
    }

    setSubmitting(true);
    try {
      await createLeaveRequest({
        entityId: 'ent_default',
        employeeId,
        leaveTypeId,
        startDate,
        endDate,
        reason: reason || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('error_fetch');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClick={handleDialogClick}
      aria-labelledby="drawer-title"
      aria-modal="true"
    >
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 id="drawer-title" className={styles.drawerTitle}>
            {t('leave_new_request')}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="employeeId" className={styles.label}>
              {t('form_employee_id')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="employeeId"
              name="employeeId"
              type="text"
              className={styles.input}
              required
              aria-required="true"
              placeholder="emp_018f23"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="leaveTypeId" className={styles.label}>
              {t('form_leave_type')} <span aria-hidden="true">*</span>
            </label>
            <select
              id="leaveTypeId"
              name="leaveTypeId"
              className={styles.input}
              required
              aria-required="true"
              defaultValue=""
            >
              <option value="" disabled>—</option>
              {leaveTypes.length > 0
                ? leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>{lt.name}</option>
                  ))
                : (
                  <>
                    <option value="annual">{t('leave_annual')}</option>
                    <option value="sick">{t('leave_sick')}</option>
                    <option value="emergency">{t('leave_emergency')}</option>
                    <option value="maternity">{t('leave_maternity')}</option>
                  </>
                )
              }
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="startDate" className={styles.label}>
                {t('form_start_date')} <span aria-hidden="true">*</span>
              </label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                className={styles.input}
                required
                aria-required="true"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="endDate" className={styles.label}>
                {t('form_end_date')} <span aria-hidden="true">*</span>
              </label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                className={styles.input}
                required
                aria-required="true"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="reason" className={styles.label}>
              {t('form_reason')}
            </label>
            <textarea
              id="reason"
              name="reason"
              className={[styles.input, styles.textarea].join(' ')}
              rows={3}
            />
          </div>

          {error && (
            <div role="alert" className={styles.errorBanner}>
              {error}
            </div>
          )}

          <div className={styles.formActions}>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('form_cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {t('form_submit')}
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

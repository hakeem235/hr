'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/locale-context';
import { Button } from '@/components/ui/Button';
import { createLetterRequest } from '@/lib/api';
import type { LetterType, LetterLanguage } from '@/lib/types';
import styles from './NewLetterDrawer.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LETTER_TYPES: LetterType[] = [
  'salary_certificate', 'employment_certificate', 'experience_letter',
  'noc', 'bank_letter', 'embassy_letter', 'salary_transfer',
];

const LANGUAGES: LetterLanguage[] = ['en', 'ar', 'bilingual'];

export function NewLetterDrawer({ open, onClose, onSuccess }: Props) {
  const { t } = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  function handleBackdrop(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const employeeId = String(fd.get('employeeId') ?? '').trim();
    const letterType = String(fd.get('letterType') ?? '').trim();
    const language   = String(fd.get('language') ?? '').trim();

    if (!employeeId || !letterType || !language) {
      setError(t('form_required'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLetterRequest({
        entityId: 'ent_default',
        employeeId,
        letterType,
        language,
        purpose:       String(fd.get('purpose') ?? '').trim() || undefined,
        recipientName: String(fd.get('recipientName') ?? '').trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('error_fetch'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClick={handleBackdrop}
      aria-labelledby="letter-drawer-title"
      aria-modal="true"
    >
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 id="letter-drawer-title" className={styles.drawerTitle}>{t('letters_new')}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="ltr-emp" className={styles.label}>{t('letters_form_employee')}</label>
            <input id="ltr-emp" name="employeeId" className={styles.input}
              required placeholder="emp_018f23" aria-required="true" />
          </div>

          <div className={styles.field}>
            <label htmlFor="ltr-type" className={styles.label}>{t('letters_form_type')}</label>
            <select id="ltr-type" name="letterType" className={styles.input} required aria-required="true">
              <option value="">—</option>
              {LETTER_TYPES.map((lt) => (
                <option key={lt} value={lt}>
                  {t(`letter_type_${lt}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="ltr-lang" className={styles.label}>{t('letters_form_language')}</label>
            <select id="ltr-lang" name="language" className={styles.input} required aria-required="true">
              <option value="">—</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`letters_lang_${l}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="ltr-purpose" className={styles.label}>{t('letters_form_purpose')}</label>
            <input id="ltr-purpose" name="purpose" className={styles.input} />
          </div>

          <div className={styles.field}>
            <label htmlFor="ltr-recipient" className={styles.label}>{t('letters_form_recipient')}</label>
            <input id="ltr-recipient" name="recipientName" className={styles.input} />
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="ghost" size="md" onClick={onClose}>{t('form_cancel')}</Button>
            <Button type="submit" variant="primary" size="md" loading={submitting}>{t('letters_form_submit')}</Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

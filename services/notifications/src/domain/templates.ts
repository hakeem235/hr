/**
 * Notification templates — ICU MessageFormat-style, en + ar.
 * Localization happens at delivery time using recipient preference (CLAUDE.md §8).
 *
 * Variables are {varName} placeholders. Full ICU plural/select support
 * would live in /packages/i18n; these are in-service stubs that follow
 * the same key pattern so migration is mechanical.
 */

export type NotifType =
  | 'leave_submitted'
  | 'leave_approved'
  | 'leave_declined'
  | 'leave_cancelled'
  | 'approval_required'
  | 'approval_sla_warning'
  | 'approval_escalated'
  | 'letter_issued'
  | 'letter_declined'
  | 'document_expiring'
  | 'employee_onboarded'
  | 'employee_terminated';

export type Locale = 'en' | 'ar';

interface Template {
  title: { en: string; ar: string };
  body:  { en: string; ar: string };
}

/** Simple {var} interpolation — replace with ICU library when /packages/i18n is ready. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function renderTemplate(
  type: NotifType,
  vars: Record<string, string>,
  locale: Locale,
): { title: string; body: string } {
  const tpl = TEMPLATES[type];
  if (!tpl) return { title: type, body: JSON.stringify(vars) };
  return {
    title: interpolate(tpl.title[locale], vars),
    body:  interpolate(tpl.body[locale],  vars),
  };
}

const TEMPLATES: Record<NotifType, Template> = {
  leave_submitted: {
    title: { en: 'Leave request submitted',          ar: 'تم تقديم طلب الإجازة' },
    body:  { en: 'Your {leaveType} leave request from {startDate} to {endDate} has been submitted for approval.',
             ar: 'تم تقديم طلب إجازة {leaveType} من {startDate} إلى {endDate} للموافقة.' },
  },
  leave_approved: {
    title: { en: 'Leave request approved',           ar: 'تمت الموافقة على طلب الإجازة' },
    body:  { en: 'Your {leaveType} leave from {startDate} to {endDate} ({days} days) has been approved.',
             ar: 'تمت الموافقة على إجازة {leaveType} من {startDate} إلى {endDate} ({days} أيام).' },
  },
  leave_declined: {
    title: { en: 'Leave request declined',           ar: 'تم رفض طلب الإجازة' },
    body:  { en: 'Your leave request has been declined.',
             ar: 'تم رفض طلب إجازتك.' },
  },
  leave_cancelled: {
    title: { en: 'Leave request cancelled',          ar: 'تم إلغاء طلب الإجازة' },
    body:  { en: 'Your leave request from {startDate} to {endDate} has been cancelled.',
             ar: 'تم إلغاء طلب إجازتك من {startDate} إلى {endDate}.' },
  },
  approval_required: {
    title: { en: 'Action required: {title}',         ar: 'إجراء مطلوب: {title}' },
    body:  { en: '{requesterName} has submitted {title} and is awaiting your approval. SLA: {slaDueAt}.',
             ar: 'قدّم {requesterName} طلب {title} وينتظر موافقتك. الموعد النهائي: {slaDueAt}.' },
  },
  approval_sla_warning: {
    title: { en: 'Approval SLA approaching: {title}', ar: 'اقتراب موعد الموافقة: {title}' },
    body:  { en: 'The approval SLA for {title} expires at {slaDueAt}. Please act now.',
             ar: 'ينتهي الموعد النهائي للموافقة على {title} في {slaDueAt}. يرجى اتخاذ الإجراء اللازم.' },
  },
  approval_escalated: {
    title: { en: 'Approval escalated to you: {title}', ar: 'تصعيد الموافقة إليك: {title}' },
    body:  { en: 'The approval for {title} has been escalated to you following an SLA breach.',
             ar: 'تمّ تصعيد الموافقة على {title} إليك بعد تجاوز الموعد النهائي.' },
  },
  letter_issued: {
    title: { en: 'Your letter is ready',             ar: 'خطابك جاهز' },
    body:  { en: 'Your {letterType} letter is ready. Document ID: {documentId}.',
             ar: 'خطاب {letterType} الخاص بك جاهز. رقم المستند: {documentId}.' },
  },
  letter_declined: {
    title: { en: 'Letter request declined',          ar: 'تم رفض طلب الخطاب' },
    body:  { en: 'Your {letterType} letter request has been declined.',
             ar: 'تم رفض طلب خطاب {letterType} الخاص بك.' },
  },
  document_expiring: {
    title: { en: 'Document expiring: {docType}',     ar: 'وثيقة منتهية الصلاحية: {docType}' },
    body:  { en: 'Your {docType} expires on {expiresOn}. Please renew it before the deadline.',
             ar: 'تنتهي صلاحية {docType} في {expiresOn}. يرجى تجديدها قبل الموعد النهائي.' },
  },
  employee_onboarded: {
    title: { en: 'Welcome to {entityName}!',         ar: 'مرحباً بك في {entityName}!' },
    body:  { en: 'Your employment has been activated. Your employee number is {employeeNo}.',
             ar: 'تم تفعيل توظيفك. رقم موظفك هو {employeeNo}.' },
  },
  employee_terminated: {
    title: { en: 'Employment ended',                 ar: 'انتهاء العمل' },
    body:  { en: 'Your employment ended on {exitDate}. Please complete the offboarding checklist.',
             ar: 'انتهى عملك في {exitDate}. يرجى إكمال قائمة مهام إنهاء الخدمة.' },
  },
};

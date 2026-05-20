/**
 * Notification templates — ICU MessageFormat-style, en + ar.
 * Localization happens at delivery time using recipient preference (CLAUDE.md §8).
 *
 * Variables are {varName} placeholders. Full ICU plural/select support
 * would live in /packages/i18n; these are in-service stubs that follow
 * the same key pattern so migration is mechanical.
 */
export type NotifType = 'leave_submitted' | 'leave_approved' | 'leave_declined' | 'leave_cancelled' | 'approval_required' | 'approval_sla_warning' | 'approval_escalated' | 'letter_issued' | 'letter_declined' | 'document_expiring' | 'employee_onboarded' | 'employee_terminated';
export type Locale = 'en' | 'ar';
/** Simple {var} interpolation — replace with ICU library when /packages/i18n is ready. */
export declare function interpolate(template: string, vars: Record<string, string>): string;
export declare function renderTemplate(type: NotifType, vars: Record<string, string>, locale: Locale): {
    title: string;
    body: string;
};

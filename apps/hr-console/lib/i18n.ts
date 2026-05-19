/**
 * Minimal bilingual strings (en/ar) using plain objects.
 * Keys only — no hardcoded display strings in components.
 * Production would use ICU MessageFormat with 6 Arabic plural forms.
 */

export type Locale = 'en' | 'ar';

const en = {
  // Nav
  nav_leave: 'Leave',
  nav_approvals: 'Approvals',
  nav_people: 'People',
  nav_payroll: 'Payroll',
  nav_compliance: 'Compliance',
  nav_settings: 'Settings',

  // Leave page
  leave_title: 'Leave Management',
  leave_subtitle: 'Review and manage employee leave requests',
  leave_new_request: 'New Request',
  leave_balance_title: 'Leave Balances',
  leave_requests_title: 'Leave Requests',
  leave_empty: 'No leave requests found',
  leave_empty_sub: 'Requests submitted by employees will appear here.',
  leave_annual: 'Annual Leave',
  leave_sick: 'Sick Leave',
  leave_emergency: 'Emergency Leave',
  leave_maternity: 'Maternity Leave',

  // Table headers
  col_employee: 'Employee',
  col_type: 'Type',
  col_dates: 'Dates',
  col_days: 'Days',
  col_status: 'Status',
  col_submitted: 'Submitted',
  col_actions: 'Actions',

  // Status labels
  status_pending_approval: 'Pending',
  status_approved: 'Approved',
  status_declined: 'Declined',
  status_cancelled: 'Cancelled',
  status_scheduled: 'Scheduled',
  status_taken: 'Taken',

  // Balance card
  balance_available: 'Available',
  balance_used: 'Used',
  balance_accrued: 'Accrued',

  // Approvals page
  approvals_title: 'Approvals Inbox',
  approvals_subtitle: 'Pending decisions across all modules',
  approvals_empty: 'All caught up',
  approvals_empty_sub: 'No pending approvals at the moment.',
  approvals_approve: 'Approve',
  approvals_decline: 'Decline',
  approvals_view: 'View details',
  approvals_sla: 'Due by',
  approvals_filter_all: 'All',
  approvals_filter_leave: 'Leave',
  approvals_filter_letters: 'Letters',
  approvals_filter_payroll: 'Payroll',

  // Drawer / form
  form_employee_id: 'Employee ID',
  form_leave_type: 'Leave Type',
  form_start_date: 'Start Date',
  form_end_date: 'End Date',
  form_reason: 'Reason (optional)',
  form_submit: 'Submit Request',
  form_cancel: 'Cancel',
  form_required: 'This field is required',

  // General
  loading: 'Loading…',
  error_fetch: 'Failed to load data. Please try again.',
  retry: 'Retry',
  days: 'days',
  day: 'day',
  of: 'of',
};

const ar: typeof en = {
  nav_leave: 'الإجازات',
  nav_approvals: 'الموافقات',
  nav_people: 'الموظفون',
  nav_payroll: 'الرواتب',
  nav_compliance: 'الامتثال',
  nav_settings: 'الإعدادات',

  leave_title: 'إدارة الإجازات',
  leave_subtitle: 'مراجعة وإدارة طلبات إجازات الموظفين',
  leave_new_request: 'طلب جديد',
  leave_balance_title: 'أرصدة الإجازات',
  leave_requests_title: 'طلبات الإجازة',
  leave_empty: 'لا توجد طلبات إجازة',
  leave_empty_sub: 'ستظهر هنا الطلبات المقدمة من الموظفين.',
  leave_annual: 'إجازة سنوية',
  leave_sick: 'إجازة مرضية',
  leave_emergency: 'إجازة طارئة',
  leave_maternity: 'إجازة أمومة',

  col_employee: 'الموظف',
  col_type: 'النوع',
  col_dates: 'التواريخ',
  col_days: 'الأيام',
  col_status: 'الحالة',
  col_submitted: 'تاريخ الطلب',
  col_actions: 'الإجراءات',

  status_pending_approval: 'قيد المراجعة',
  status_approved: 'موافق عليه',
  status_declined: 'مرفوض',
  status_cancelled: 'ملغى',
  status_scheduled: 'مجدول',
  status_taken: 'مأخوذة',

  balance_available: 'المتاح',
  balance_used: 'المستخدم',
  balance_accrued: 'المستحق',

  approvals_title: 'صندوق الموافقات',
  approvals_subtitle: 'القرارات المعلقة في جميع الوحدات',
  approvals_empty: 'لا توجد موافقات معلقة',
  approvals_empty_sub: 'لا توجد موافقات معلقة في الوقت الحالي.',
  approvals_approve: 'موافقة',
  approvals_decline: 'رفض',
  approvals_view: 'عرض التفاصيل',
  approvals_sla: 'الموعد النهائي',
  approvals_filter_all: 'الكل',
  approvals_filter_leave: 'الإجازات',
  approvals_filter_letters: 'الخطابات',
  approvals_filter_payroll: 'الرواتب',

  form_employee_id: 'رقم الموظف',
  form_leave_type: 'نوع الإجازة',
  form_start_date: 'تاريخ البداية',
  form_end_date: 'تاريخ النهاية',
  form_reason: 'السبب (اختياري)',
  form_submit: 'إرسال الطلب',
  form_cancel: 'إلغاء',
  form_required: 'هذا الحقل مطلوب',

  loading: 'جارٍ التحميل…',
  error_fetch: 'فشل تحميل البيانات. يرجى المحاولة مرة أخرى.',
  retry: 'إعادة المحاولة',
  days: 'أيام',
  day: 'يوم',
  of: 'من',
};

export const translations = { en, ar };
export type TranslationKey = keyof typeof en;

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale][key] ?? translations.en[key] ?? key;
}

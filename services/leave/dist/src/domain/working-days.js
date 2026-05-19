/**
 * Working-day calculation against an entity working calendar.
 *
 * Per leave-api.md: workingDays is ALWAYS computed server-side. Never trust a
 * client-sent duration. Per workflow-engine.md §5, KSA work week is Sun–Thu and
 * holidays (incl. Ramadan/Eid/Hajj clusters) must be excluded or downstream SLA
 * math is wrong.
 */
function toISO(d) {
    return d.toISOString().slice(0, 10);
}
/**
 * Inclusive count of working days between start and end.
 * A day counts if its weekday is in workWeek AND it is not a holiday.
 */
export function computeWorkingDays(startDate, endDate, cal) {
    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    if (end < start) {
        throw new LeaveError('INVALID_DATE_RANGE', 'endDate is before startDate', 'endDate');
    }
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const dow = cur.getUTCDay();
        const iso = toISO(cur);
        if (cal.workWeek.includes(dow) && !cal.holidays.has(iso)) {
            count += 1;
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
}
/** Domain error → maps to the standard envelope (leave-api.md). */
export class LeaveError extends Error {
    code;
    field;
    details;
    constructor(code, message, field, details) {
        super(message);
        this.code = code;
        this.field = field;
        this.details = details;
        this.name = 'LeaveError';
    }
}
/** HTTP status for each domain error code (leave-api.md). */
export function statusFor(code) {
    switch (code) {
        case 'INSUFFICIENT_BALANCE':
        case 'OVERLAPPING_REQUEST':
            return 409;
        case 'POLICY_VIOLATION':
        case 'INELIGIBLE':
        case 'INVALID_DATE_RANGE':
            return 422;
        case 'WORKFLOW_UNAVAILABLE':
            return 503;
        default:
            return 400;
    }
}

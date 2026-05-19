/**
 * Working-day calculation against an entity working calendar.
 *
 * Per leave-api.md: workingDays is ALWAYS computed server-side. Never trust a
 * client-sent duration. Per workflow-engine.md §5, KSA work week is Sun–Thu and
 * holidays (incl. Ramadan/Eid/Hajj clusters) must be excluded or downstream SLA
 * math is wrong.
 */
export interface WorkingCalendar {
    /** 0=Sun … 6=Sat. KSA default: [0,1,2,3,4] */
    workWeek: number[];
    /** ISO date strings 'YYYY-MM-DD' that are holidays for this entity */
    holidays: Set<string>;
}
/**
 * Inclusive count of working days between start and end.
 * A day counts if its weekday is in workWeek AND it is not a holiday.
 */
export declare function computeWorkingDays(startDate: string, endDate: string, cal: WorkingCalendar): number;
/** Domain error → maps to the standard envelope (leave-api.md). */
export declare class LeaveError extends Error {
    code: string;
    field?: string | undefined;
    details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, field?: string | undefined, details?: Record<string, unknown> | undefined);
}
/** HTTP status for each domain error code (leave-api.md). */
export declare function statusFor(code: string): number;

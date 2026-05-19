/**
 * Domain error class and HTTP-status mapping for /services/people.
 * Mirror of the leave service pattern (CLAUDE.md §12).
 */
export type PeopleErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'VALIDATION' | 'DUPLICATE' | 'INVALID_DATE_RANGE' | 'INACTIVE_EMPLOYEE' | 'ALREADY_TERMINATED' | 'PRECONDITION_REQUIRED' | 'UNKNOWN';
export declare class PeopleError extends Error {
    readonly code: PeopleErrorCode;
    readonly field?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: PeopleErrorCode, message: string, field?: string | undefined, details?: Record<string, unknown> | undefined);
}
export declare function statusFor(code: PeopleErrorCode): number;

export type PayrollErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INVALID_STATE' | 'VALIDATION' | 'UNKNOWN';
export declare class PayrollError extends Error {
    readonly code: PayrollErrorCode;
    readonly field?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: PayrollErrorCode, message: string, field?: string | undefined, details?: Record<string, unknown> | undefined);
}
export declare function statusFor(code: PayrollErrorCode): number;

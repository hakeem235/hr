export type BenefitErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'INELIGIBLE' | 'ALREADY_ENROLLED' | 'INVALID_STATE' | 'VALIDATION' | 'UNKNOWN';
export declare class BenefitError extends Error {
    readonly code: BenefitErrorCode;
    readonly field?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: BenefitErrorCode, message: string, field?: string | undefined, details?: Record<string, unknown> | undefined);
}
export declare function statusFor(code: BenefitErrorCode): number;

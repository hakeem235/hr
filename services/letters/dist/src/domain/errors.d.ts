export type LetterErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INELIGIBLE' | 'POLICY_VIOLATION' | 'WORKFLOW_UNAVAILABLE' | 'INVALID_STATE' | 'UNKNOWN';
export declare class LetterError extends Error {
    readonly code: LetterErrorCode;
    readonly field?: string | undefined;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: LetterErrorCode, message: string, field?: string | undefined, details?: Record<string, unknown> | undefined);
}
export declare function statusFor(code: LetterErrorCode): number;

export type NotifErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'UNKNOWN';
export declare class NotifError extends Error {
    readonly code: NotifErrorCode;
    readonly field?: string | undefined;
    constructor(code: NotifErrorCode, message: string, field?: string | undefined);
}
export declare function statusFor(code: NotifErrorCode): number;

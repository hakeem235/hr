export type LetterErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INELIGIBLE'
  | 'POLICY_VIOLATION'
  | 'WORKFLOW_UNAVAILABLE'
  | 'INVALID_STATE'
  | 'UNKNOWN';

export class LetterError extends Error {
  constructor(
    public readonly code: LetterErrorCode,
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LetterError';
  }
}

export function statusFor(code: LetterErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':            return 404;
    case 'FORBIDDEN':            return 403;
    case 'CONFLICT':             return 409;
    case 'INELIGIBLE':           return 422;
    case 'POLICY_VIOLATION':     return 422;
    case 'INVALID_STATE':        return 422;
    case 'WORKFLOW_UNAVAILABLE': return 503;
    default:                     return 400;
  }
}

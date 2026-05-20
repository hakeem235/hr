export type PayrollErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'VALIDATION'
  | 'UNKNOWN';

export class PayrollError extends Error {
  constructor(
    public readonly code: PayrollErrorCode,
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PayrollError';
  }
}

export function statusFor(code: PayrollErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':     return 404;
    case 'FORBIDDEN':     return 403;
    case 'CONFLICT':      return 409;
    case 'INVALID_STATE': return 422;
    case 'VALIDATION':    return 422;
    default:              return 400;
  }
}

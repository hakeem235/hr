export type BenefitErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INELIGIBLE'
  | 'ALREADY_ENROLLED'
  | 'INVALID_STATE'
  | 'VALIDATION'
  | 'UNKNOWN';

export class BenefitError extends Error {
  constructor(
    public readonly code: BenefitErrorCode,
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BenefitError';
  }
}

export function statusFor(code: BenefitErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':       return 404;
    case 'FORBIDDEN':       return 403;
    case 'CONFLICT':        return 409;
    case 'ALREADY_ENROLLED':return 409;
    case 'INELIGIBLE':      return 422;
    case 'INVALID_STATE':   return 422;
    case 'VALIDATION':      return 422;
    default:                return 400;
  }
}

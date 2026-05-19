/**
 * Domain error class and HTTP-status mapping for /services/people.
 * Mirror of the leave service pattern (CLAUDE.md §12).
 */

export type PeopleErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'INVALID_DATE_RANGE'
  | 'INACTIVE_EMPLOYEE'
  | 'ALREADY_TERMINATED'
  | 'PRECONDITION_REQUIRED'
  | 'UNKNOWN';

export class PeopleError extends Error {
  constructor(
    public readonly code: PeopleErrorCode,
    message: string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PeopleError';
  }
}

export function statusFor(code: PeopleErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':            return 404;
    case 'FORBIDDEN':            return 403;
    case 'CONFLICT':             return 409;
    case 'DUPLICATE':            return 409;
    case 'INVALID_DATE_RANGE':   return 422;
    case 'VALIDATION':           return 422;
    case 'INACTIVE_EMPLOYEE':    return 422;
    case 'ALREADY_TERMINATED':   return 422;
    case 'PRECONDITION_REQUIRED':return 428;
    default:                     return 400;
  }
}

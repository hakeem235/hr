export type NotifErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'UNKNOWN';

export class NotifError extends Error {
  constructor(
    public readonly code: NotifErrorCode,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'NotifError';
  }
}

export function statusFor(code: NotifErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':  return 404;
    case 'VALIDATION': return 422;
    default:           return 400;
  }
}

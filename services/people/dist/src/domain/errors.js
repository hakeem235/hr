/**
 * Domain error class and HTTP-status mapping for /services/people.
 * Mirror of the leave service pattern (CLAUDE.md §12).
 */
export class PeopleError extends Error {
    code;
    field;
    details;
    constructor(code, message, field, details) {
        super(message);
        this.code = code;
        this.field = field;
        this.details = details;
        this.name = 'PeopleError';
    }
}
export function statusFor(code) {
    switch (code) {
        case 'NOT_FOUND': return 404;
        case 'FORBIDDEN': return 403;
        case 'CONFLICT': return 409;
        case 'DUPLICATE': return 409;
        case 'INVALID_DATE_RANGE': return 422;
        case 'VALIDATION': return 422;
        case 'INACTIVE_EMPLOYEE': return 422;
        case 'ALREADY_TERMINATED': return 422;
        case 'PRECONDITION_REQUIRED': return 428;
        default: return 400;
    }
}

export class LetterError extends Error {
    code;
    field;
    details;
    constructor(code, message, field, details) {
        super(message);
        this.code = code;
        this.field = field;
        this.details = details;
        this.name = 'LetterError';
    }
}
export function statusFor(code) {
    switch (code) {
        case 'NOT_FOUND': return 404;
        case 'FORBIDDEN': return 403;
        case 'CONFLICT': return 409;
        case 'INELIGIBLE': return 422;
        case 'POLICY_VIOLATION': return 422;
        case 'INVALID_STATE': return 422;
        case 'WORKFLOW_UNAVAILABLE': return 503;
        default: return 400;
    }
}

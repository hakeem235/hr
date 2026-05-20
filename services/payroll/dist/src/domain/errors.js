export class PayrollError extends Error {
    code;
    field;
    details;
    constructor(code, message, field, details) {
        super(message);
        this.code = code;
        this.field = field;
        this.details = details;
        this.name = 'PayrollError';
    }
}
export function statusFor(code) {
    switch (code) {
        case 'NOT_FOUND': return 404;
        case 'FORBIDDEN': return 403;
        case 'CONFLICT': return 409;
        case 'INVALID_STATE': return 422;
        case 'VALIDATION': return 422;
        default: return 400;
    }
}

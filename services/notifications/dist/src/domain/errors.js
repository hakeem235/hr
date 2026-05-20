export class NotifError extends Error {
    code;
    field;
    constructor(code, message, field) {
        super(message);
        this.code = code;
        this.field = field;
        this.name = 'NotifError';
    }
}
export function statusFor(code) {
    switch (code) {
        case 'NOT_FOUND': return 404;
        case 'VALIDATION': return 422;
        default: return 400;
    }
}

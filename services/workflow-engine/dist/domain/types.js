/**
 * Core types for the workflow engine (workflow-engine.md §2–3).
 * All step types, instance model, actor strategies, and events live here.
 */
/* ─── Engine error ───────────────────────────────────────────── */
export class EngineError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'EngineError';
    }
}

/**
 * Minimal JSONPath evaluator for workflow context expressions.
 * Supports: $.field, $.nested.field, $.field > 5, $.field === "value", etc.
 * Used for step conditions and actor resolution paths.
 */
/** Resolve a path like "$.requester" or "$.request.workingDays" from context */
export declare function resolvePath(path: string, ctx: Record<string, unknown>): unknown;
/** Evaluate a simple condition expression against context */
export declare function evaluateCondition(expr: string, ctx: Record<string, unknown>): boolean;

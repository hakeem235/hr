/**
 * Minimal JSONPath evaluator for workflow context expressions.
 * Supports: $.field, $.nested.field, $.field > 5, $.field === "value", etc.
 * Used for step conditions and actor resolution paths.
 */

/** Resolve a path like "$.requester" or "$.request.workingDays" from context */
export function resolvePath(path: string, ctx: Record<string, unknown>): unknown {
  if (!path.startsWith('$.')) return path; // literal value
  const parts = path.slice(2).split('.');
  let val: unknown = ctx;
  for (const part of parts) {
    if (val === null || val === undefined) return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

/** Evaluate a simple condition expression against context */
export function evaluateCondition(expr: string, ctx: Record<string, unknown>): boolean {
  // Match: <path> <op> <value>
  const match = expr.match(/^(\$\.\S+)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    // Bare path — truthy check
    const val = resolvePath(expr.trim(), ctx);
    return Boolean(val);
  }

  const [, pathStr, op, rawVal] = match;
  const left = resolvePath(pathStr, ctx);

  // Parse right-hand side
  let right: unknown;
  const trimmed = rawVal.trim();
  if (trimmed === 'true') right = true;
  else if (trimmed === 'false') right = false;
  else if (trimmed === 'null') right = null;
  else if (/^".*"$/.test(trimmed)) right = trimmed.slice(1, -1);
  else if (/^\d+(\.\d+)?$/.test(trimmed)) right = parseFloat(trimmed);
  else right = trimmed;

  switch (op) {
    case '===': case '==': return left === right;
    case '!==': case '!=': return left !== right;
    case '>':  return (left as number) > (right as number);
    case '>=': return (left as number) >= (right as number);
    case '<':  return (left as number) < (right as number);
    case '<=': return (left as number) <= (right as number);
    default: return false;
  }
}

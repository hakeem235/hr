/**
 * JSONPath-lite resolver for workflow context expressions like "$.requester".
 * Only supports simple dot-paths (sufficient for actor strategy resolution).
 * Full JSONPath not needed until dynamic branching conditions are implemented.
 */
export function resolveContextPath(
  path: string,
  context: Record<string, unknown>,
): unknown {
  if (!path.startsWith('$.')) return path;
  const parts = path.slice(2).split('.');
  let cur: unknown = context;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Evaluates a simple condition expression against context. */
export function evaluateCondition(
  condition: string,
  context: Record<string, unknown>,
): boolean {
  // Supports: "$.path.to.value > N" and "$.path.to.value == 'string'"
  const gtMatch = condition.match(/^(\$[\w.]+)\s*>\s*(\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const val = resolveContextPath(gtMatch[1], context);
    return Number(val) > Number(gtMatch[2]);
  }
  const eqMatch = condition.match(/^(\$[\w.]+)\s*==\s*'([^']*)'$/);
  if (eqMatch) {
    const val = resolveContextPath(eqMatch[1], context);
    return String(val) === eqMatch[2];
  }
  const eqNumMatch = condition.match(/^(\$[\w.]+)\s*==\s*(\d+(?:\.\d+)?)$/);
  if (eqNumMatch) {
    const val = resolveContextPath(eqNumMatch[1], context);
    return Number(val) === Number(eqNumMatch[2]);
  }
  // Unknown condition → do not skip
  return false;
}

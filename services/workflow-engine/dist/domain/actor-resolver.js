import { resolvePath } from './context.js';
import { EngineError } from './types.js';
const MAX_REPORTS_TO_DEPTH = 10;
/**
 * Resolve the actor for a step.
 * Returns the employee id who should act, after checking delegations.
 */
export async function resolveActor(spec, context, store) {
    let employeeId;
    switch (spec.strategy) {
        case 'named': {
            if (!spec.employeeId)
                throw new EngineError('CONFIG_ERROR', 'named strategy requires employeeId');
            employeeId = spec.employeeId;
            break;
        }
        case 'reports_to': {
            if (!spec.of)
                throw new EngineError('CONFIG_ERROR', 'reports_to strategy requires "of" path');
            const subjectId = resolvePath(spec.of, context);
            if (!subjectId)
                throw new EngineError('RESOLUTION_FAILED', `Could not resolve subject from path "${spec.of}"`);
            let depth = 0;
            let currentId = subjectId;
            while (depth < MAX_REPORTS_TO_DEPTH) {
                const manager = await store.findManager(currentId);
                if (!manager)
                    throw new EngineError('RESOLUTION_FAILED', `No manager found for ${currentId}`);
                if (manager.isActive) {
                    employeeId = manager.employeeId;
                    break;
                }
                // skip inactive managers, go up the chain
                currentId = manager.employeeId;
                depth++;
            }
            if (!employeeId)
                throw new EngineError('RESOLUTION_FAILED', 'Exhausted org hierarchy');
            break;
        }
        case 'role': {
            if (!spec.role)
                throw new EngineError('CONFIG_ERROR', 'role strategy requires "role"');
            const scopeEntityId = spec.scope
                ? resolvePath(spec.scope, context)
                : context.entityId;
            const candidates = await store.findByRole(spec.role, scopeEntityId);
            const active = candidates.filter((c) => c.isActive);
            if (active.length === 0) {
                throw new EngineError('RESOLUTION_FAILED', `No active employee with role "${spec.role}" in entity "${scopeEntityId}"`);
            }
            // Pick first — in production: load-balance or pick by queue depth
            employeeId = active[0].employeeId;
            break;
        }
        case 'dynamic': {
            if (!spec.of)
                throw new EngineError('CONFIG_ERROR', 'dynamic strategy requires "of" path');
            const resolved = resolvePath(spec.of, context);
            if (!resolved)
                throw new EngineError('RESOLUTION_FAILED', `Could not resolve dynamic actor from path "${spec.of}"`);
            employeeId = resolved;
            break;
        }
        default:
            throw new EngineError('CONFIG_ERROR', `Unknown actor strategy: ${spec.strategy}`);
    }
    // Delegation check — if the resolved actor has an active delegation, use delegate instead
    const delegation = await store.getActiveDelegation(employeeId);
    if (delegation) {
        const delegate = await store.findEmployee(delegation.toEmployeeId);
        if (delegate?.isActive)
            return delegation.toEmployeeId;
    }
    return employeeId;
}

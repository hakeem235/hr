/**
 * Actor resolution strategies (workflow-engine.md §4).
 *
 * Actors are resolved at step activation, not workflow start, so org-chart
 * changes mid-flight are respected. Every strategy is delegation-aware: active
 * delegations are checked first so an absent manager doesn't block the queue.
 */

import type { ActorStrategy, ActorResolver } from './types.js';
import { resolveContextPath } from './context.js';

export interface OrgRepo {
  getManagerOf(employeeId: string): Promise<string | null>;
  getEmployeesByRole(role: string, scopeEntityId: string): Promise<string[]>;
  getActiveDelegateFor(employeeId: string): Promise<string | null>;
}

export function createActorResolver(org: OrgRepo): ActorResolver {
  return {
    async resolve(
      strategy: ActorStrategy,
      context: Record<string, unknown>,
    ): Promise<string | null> {
      switch (strategy.strategy) {
        case 'reports_to': {
          const subjectId = resolveContextPath(strategy.of, context) as string;
          const managerId = await org.getManagerOf(subjectId);
          if (!managerId) return null;
          // Delegation-aware: if manager has an active delegate, use them
          const delegate = await org.getActiveDelegateFor(managerId);
          return delegate ?? managerId;
        }

        case 'role': {
          const scopeId = resolveContextPath(strategy.scope, context) as string;
          const candidates = await org.getEmployeesByRole(strategy.role, scopeId);
          if (candidates.length === 0) return null;
          // Check delegation for each candidate; return first available
          for (const c of candidates) {
            const delegate = await org.getActiveDelegateFor(c);
            if (delegate) return delegate;
          }
          return candidates[0];
        }

        case 'named': {
          const delegate = await org.getActiveDelegateFor(strategy.employeeId);
          return delegate ?? strategy.employeeId;
        }

        case 'dynamic': {
          const resolved = resolveContextPath(strategy.contextPath, context);
          if (typeof resolved !== 'string') return null;
          const delegate = await org.getActiveDelegateFor(resolved);
          return delegate ?? resolved;
        }
      }
    },
  };
}

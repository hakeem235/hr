/**
 * SagaRunner — the durable execution engine.
 *
 * Executes a saga's activities in sequence, persisting state after each step.
 * On failure it runs compensations in reverse for all completed activities.
 *
 * Maps to Temporal's execution model:
 *   - executeActivity  ↔  Temporal workflow.executeActivity()
 *   - retry logic      ↔  Temporal's RetryPolicy
 *   - compensation     ↔  Temporal Saga helper (reverse-cancel pattern)
 *   - state after step ↔  Temporal workflow history (event sourcing)
 */
import type { SagaInstance, SagaDef, SagaRepo, ActivityContext, ActivityExecution } from './types.js';

function now(): string {
  return new Date().toISOString().replace('Z', '+00:00');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class SagaRunner {
  constructor(
    private readonly repo: SagaRepo,
    private readonly ctx: ActivityContext,
  ) {}

  async execute(saga: SagaInstance, def: SagaDef): Promise<SagaInstance> {
    let current = saga;

    for (let i = current.currentActivityIndex; i < def.activities.length; i++) {
      const actDef = def.activities[i];
      const execRecord: ActivityExecution = {
        name: actDef.name,
        state: 'running',
        attempt: 1,
        input: { ...current.context },
        startedAt: now(),
      };

      // Ensure activity slot exists
      while (current.activities.length <= i) {
        current.activities.push({
          name: actDef.name,
          state: 'pending',
          attempt: 0,
          input: {},
        });
      }

      current.activities[i] = execRecord;
      current = await this.repo.update({ ...current });

      // Execute with retries
      let lastError: string | undefined;
      let output: Record<string, unknown> | undefined;

      for (let attempt = 1; attempt <= actDef.maxRetries + 1; attempt++) {
        try {
          output = await actDef.execute(current, this.ctx);
          break;
        } catch (e: any) {
          lastError = e?.message ?? String(e);
          if (attempt <= actDef.maxRetries) {
            const delayMs = Math.min(500 * Math.pow(2, attempt - 1), 5000);
            await sleep(delayMs);
            current.activities[i] = { ...execRecord, attempt, error: lastError };
          }
        }
      }

      if (output !== undefined) {
        // Activity succeeded — merge output into context
        current.context = { ...current.context, ...output };
        current.activities[i] = {
          ...execRecord,
          state: 'completed',
          output,
          completedAt: now(),
        };
        current.currentActivityIndex = i + 1;
        current = await this.repo.update({ ...current });
      } else {
        // Activity exhausted retries — begin compensation
        current.activities[i] = {
          ...execRecord,
          state: 'failed',
          error: lastError,
        };
        current.status = 'compensating';
        current.failureReason = `Activity "${actDef.name}" failed after ${actDef.maxRetries + 1} attempt(s): ${lastError}`;
        current = await this.repo.update({ ...current });

        current = await this.runCompensation(current, def, i - 1);
        return current;
      }
    }

    // All activities completed
    current.status = 'completed';
    current.completedAt = now();
    current = await this.repo.update({ ...current });
    return current;
  }

  private async runCompensation(
    saga: SagaInstance,
    def: SagaDef,
    fromIndex: number,
  ): Promise<SagaInstance> {
    let current = saga;

    for (let i = fromIndex; i >= 0; i--) {
      const actDef = def.activities[i];
      const exec = current.activities[i];
      if (exec?.state !== 'completed' || !actDef.compensate) continue;

      current.activities[i] = { ...exec, state: 'compensating' };
      current = await this.repo.update({ ...current });

      try {
        await actDef.compensate(current, exec.output ?? {}, this.ctx);
        current.activities[i] = { ...exec, state: 'compensated', compensatedAt: now() };
        current = await this.repo.update({ ...current });
      } catch (e: any) {
        // Compensation failure — mark as failed, stop. Manual intervention needed.
        current.status = 'failed';
        current.failureReason = `Compensation for "${actDef.name}" failed: ${e?.message ?? e}`;
        current.completedAt = now();
        return await this.repo.update({ ...current });
      }
    }

    current.status = 'compensated';
    current.completedAt = now();
    return await this.repo.update({ ...current });
  }
}

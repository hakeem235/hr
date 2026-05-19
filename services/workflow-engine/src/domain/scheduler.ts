/**
 * SLA breach scheduler.
 *
 * Polls active approval steps every `intervalMs` and calls escalateStep()
 * on any that have passed their slaDueAt.
 *
 * In production: replace the poll with a priority-queue / delayed-job system
 * (e.g. pg_cron, BullMQ, or a Temporal timer) so it scales beyond a single
 * process. The interface is identical — only the trigger mechanism changes.
 */
import type { WorkflowExecutor, EngineRepo } from './executor.js';
import { isSlaBreached } from './sla.js';

export interface SchedulerOptions {
  /** Poll interval in ms. Default: 60_000 (1 minute) */
  intervalMs?: number;
  /** Logger — defaults to console */
  log?: (msg: string) => void;
}

export class SlaScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private repo: EngineRepo,
    private executor: WorkflowExecutor,
    private opts: SchedulerOptions = {},
  ) {}

  start(): void {
    const interval = this.opts.intervalMs ?? 60_000;
    const log = this.opts.log ?? ((m: string) => console.log('[sla-scheduler]', m));

    log(`Starting — polling every ${interval}ms`);
    this.timer = setInterval(() => this.tick(log), interval);
    // Run immediately on start so we don't wait a full interval on boot
    this.tick(log);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(log: (m: string) => void): Promise<void> {
    if (this.running) return; // skip if previous tick is still in flight
    this.running = true;
    try {
      const pending = await this.repo.listPendingApprovals(undefined, 200);
      const breached = pending.filter(
        ({ step }) => step.slaDueAt && isSlaBreached(step.slaDueAt),
      );

      if (breached.length === 0) return;
      log(`Found ${breached.length} breached SLA(s) — escalating`);

      await Promise.allSettled(
        breached.map(({ instance, step }) =>
          this.executor.escalateStep(instance.id, step.stepId).catch((err: unknown) => {
            log(`Escalation failed for ${instance.id}/${step.stepId}: ${(err as Error).message}`);
          }),
        ),
      );
    } catch (err) {
      log(`Tick error: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

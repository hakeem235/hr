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
export interface SchedulerOptions {
    /** Poll interval in ms. Default: 60_000 (1 minute) */
    intervalMs?: number;
    /** Logger — defaults to console */
    log?: (msg: string) => void;
}
export declare class SlaScheduler {
    private repo;
    private executor;
    private opts;
    private timer;
    private running;
    constructor(repo: EngineRepo, executor: WorkflowExecutor, opts?: SchedulerOptions);
    start(): void;
    stop(): void;
    private tick;
}

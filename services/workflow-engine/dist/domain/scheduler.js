import { isSlaBreached } from './sla.js';
export class SlaScheduler {
    repo;
    executor;
    opts;
    timer = null;
    running = false;
    constructor(repo, executor, opts = {}) {
        this.repo = repo;
        this.executor = executor;
        this.opts = opts;
    }
    start() {
        const interval = this.opts.intervalMs ?? 60_000;
        const log = this.opts.log ?? ((m) => console.log('[sla-scheduler]', m));
        log(`Starting — polling every ${interval}ms`);
        this.timer = setInterval(() => this.tick(log), interval);
        // Run immediately on start so we don't wait a full interval on boot
        this.tick(log);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    async tick(log) {
        if (this.running)
            return; // skip if previous tick is still in flight
        this.running = true;
        try {
            const pending = await this.repo.listPendingApprovals(undefined, 200);
            const breached = pending.filter(({ step }) => step.slaDueAt && isSlaBreached(step.slaDueAt));
            if (breached.length === 0)
                return;
            log(`Found ${breached.length} breached SLA(s) — escalating`);
            await Promise.allSettled(breached.map(({ instance, step }) => this.executor.escalateStep(instance.id, step.stepId).catch((err) => {
                log(`Escalation failed for ${instance.id}/${step.stepId}: ${err.message}`);
            })));
        }
        catch (err) {
            log(`Tick error: ${err.message}`);
        }
        finally {
            this.running = false;
        }
    }
}

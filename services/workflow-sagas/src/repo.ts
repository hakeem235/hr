import type { SagaInstance, SagaRepo, SagaFilter } from './domain/types.js';

export class InMemorySagaRepo implements SagaRepo {
  private store = new Map<string, SagaInstance>();

  async findByIdempotencyKey(key: string): Promise<SagaInstance | null> {
    for (const s of this.store.values()) {
      if (s.idempotencyKey === key) return s;
    }
    return null;
  }

  async save(saga: SagaInstance): Promise<SagaInstance> {
    this.store.set(saga.id, saga);
    return saga;
  }

  async update(saga: SagaInstance): Promise<SagaInstance> {
    this.store.set(saga.id, saga);
    return saga;
  }

  async findById(id: string): Promise<SagaInstance | null> {
    return this.store.get(id) ?? null;
  }

  async list(filter: SagaFilter): Promise<{ items: SagaInstance[]; nextCursor: string | null }> {
    const limit = filter.limit ?? 20;
    let all = [...this.store.values()];

    if (filter.sagaName)   all = all.filter((s) => s.sagaName   === filter.sagaName);
    if (filter.employeeId) all = all.filter((s) => s.employeeId === filter.employeeId);
    if (filter.entityId)   all = all.filter((s) => s.entityId   === filter.entityId);
    if (filter.status)     all = all.filter((s) => s.status     === filter.status);

    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter.cursor) {
      const idx = all.findIndex((s) => s.id === filter.cursor);
      if (idx !== -1) all = all.slice(idx + 1);
    }

    const page = all.slice(0, limit);
    const nextCursor = all.length > limit ? page[page.length - 1].id : null;
    return { items: page, nextCursor };
  }
}

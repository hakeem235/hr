/**
 * HTTP layer for the leave module.
 * Thin: validates input, calls domain logic, maps errors → standard envelope.
 * All state transitions and workflow delegation happen in domain functions.
 */
import type { FastifyInstance } from 'fastify';
import { type LeaveRepo, type WorkflowClient } from '../domain/create-request.js';
import { type WorkingCalendar } from '../domain/working-days.js';
interface Deps {
    repo: LeaveRepo;
    wf: WorkflowClient;
    calendarFor(entityId: string): Promise<WorkingCalendar>;
}
export declare function registerLeaveRoutes(app: FastifyInstance, deps: Deps): void;
export {};

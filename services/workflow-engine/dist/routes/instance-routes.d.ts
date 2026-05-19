/**
 * HTTP routes for workflow instances.
 * The decision endpoint (§7 of spec) is the ONLY way to act on an approval.
 */
import type { FastifyInstance } from 'fastify';
import { WorkflowExecutor } from '../domain/executor.js';
export declare function registerInstanceRoutes(app: FastifyInstance, executor: WorkflowExecutor): void;

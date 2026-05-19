/**
 * CRUD routes for workflow definitions.
 * Definitions are versioned JSON — HR admins edit via these endpoints
 * (or the future visual builder). Soft-delete only; instances pin their version.
 */
import type { FastifyInstance } from 'fastify';
import type { EngineRepo } from '../domain/executor.js';
export declare function registerDefinitionRoutes(app: FastifyInstance, repo: EngineRepo): void;

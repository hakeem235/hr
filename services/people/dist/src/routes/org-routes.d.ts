/**
 * ActorStore HTTP API — consumed by the workflow engine's HTTP adapter.
 * These four endpoints implement the ActorStore contract from actor-resolver.ts.
 */
import type { FastifyInstance } from 'fastify';
import type { PeopleRepo } from '../domain/types.js';
export declare function registerOrgRoutes(app: FastifyInstance, repo: PeopleRepo): void;

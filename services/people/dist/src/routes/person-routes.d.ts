import type { FastifyInstance } from 'fastify';
import type { PeopleRepo } from '../domain/types.js';
export declare function registerPersonRoutes(app: FastifyInstance, repo: PeopleRepo): void;

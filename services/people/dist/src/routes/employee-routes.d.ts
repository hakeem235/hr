import type { FastifyInstance } from 'fastify';
import type { PeopleRepo } from '../domain/types.js';
export declare function registerEmployeeRoutes(app: FastifyInstance, repo: PeopleRepo): void;

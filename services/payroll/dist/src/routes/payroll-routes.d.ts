import type { FastifyInstance } from 'fastify';
import type { PayrollRepo } from '../domain/types.js';
export declare function registerPayrollRoutes(app: FastifyInstance, repo: PayrollRepo): void;

/**
 * HTTP layer for the letters module.
 * Thin: validates input, calls domain logic, maps errors → standard envelope.
 */
import type { FastifyInstance } from 'fastify';
import { type LetterRepo, type WorkflowClient } from '../domain/letter.js';
import type { PeopleClient } from '../people-client.js';
interface Deps {
    repo: LetterRepo;
    wf: WorkflowClient;
    people: PeopleClient;
    arabicFontPath?: string;
}
export declare function registerLetterRoutes(app: FastifyInstance, deps: Deps): void;
export {};

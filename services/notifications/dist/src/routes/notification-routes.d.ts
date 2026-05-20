import type { FastifyInstance } from 'fastify';
import type { NotifRepo, Channel } from '../domain/types.js';
import type { ChannelProvider } from '../domain/channels.js';
interface Deps {
    repo: NotifRepo;
    providers: Record<Channel, ChannelProvider>;
}
export declare function registerNotificationRoutes(app: FastifyInstance, deps: Deps): void;
export {};

import type { NotifRepo, SendInput, NotificationRecord, Channel } from './types.js';
import type { ChannelProvider } from './channels.js';
export declare const newId: (prefix: string) => string;
export declare function sendNotification(input: SendInput, repo: NotifRepo, providers: Record<Channel, ChannelProvider>, 
/** Contact map: channel → address/token. Passed by caller (from people service lookup). */
contacts?: Partial<Record<Channel, string>>): Promise<NotificationRecord>;
export declare function markRead(id: string, repo: NotifRepo): Promise<NotificationRecord>;
export declare function markAllRead(recipientId: string, repo: NotifRepo): Promise<number>;

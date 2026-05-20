import type { NotifType, Locale } from './templates.js';

export type { NotifType, Locale };

export type Channel = 'in_app' | 'email' | 'sms' | 'push';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'suppressed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface DeliveryRecord {
  channel: Channel;
  status: DeliveryStatus;
  attemptedAt?: string;
  error?: string;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;       // employee id
  entityId: string;
  type: NotifType;
  priority: Priority;
  /** Rendered title (recipient's locale, at delivery time). */
  title: string;
  /** Rendered body. */
  body: string;
  /** Raw template vars — preserved for re-render or audit. */
  vars: Record<string, string>;
  /** Source event that triggered this notification. */
  sourceEventType?: string;
  sourceEventId?: string;
  read: boolean;
  deliveries: DeliveryRecord[];
  createdAt: string;
}

export interface RecipientPreference {
  recipientId: string;
  locale: Locale;
  /** Channels the recipient has opted into (in_app always included). */
  channels: Channel[];
  /** Quiet hours — notifications suppressed in this window (local time HH:MM). */
  quietFrom?: string;
  quietUntil?: string;
}

export interface SendInput {
  recipientId: string;
  entityId: string;
  type: NotifType;
  priority?: Priority;
  vars: Record<string, string>;
  sourceEventType?: string;
  sourceEventId?: string;
}

export interface NotifFilter {
  recipientId?: string;
  entityId?: string;
  read?: boolean;
  type?: NotifType;
  cursor?: string;
  limit: number;
}

export interface NotifRepo {
  findById(id: string): Promise<NotificationRecord | null>;
  listNotifications(filter: NotifFilter): Promise<{ items: NotificationRecord[]; nextCursor?: string }>;
  save(rec: NotificationRecord): Promise<void>;
  markRead(id: string): Promise<NotificationRecord>;
  markAllRead(recipientId: string): Promise<number>;

  getPreference(recipientId: string): Promise<RecipientPreference | null>;
  savePreference(pref: RecipientPreference): Promise<void>;
}

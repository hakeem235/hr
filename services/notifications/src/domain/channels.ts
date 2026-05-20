/**
 * Channel delivery stubs.
 * Real providers (email: SES/Postmark, SMS: Unifonic/Msegat for KSA, push: FCM/APNs)
 * are open decisions (CLAUDE.md §14). Each stub logs the attempt and returns a
 * DeliveryRecord so the in-app notification log is always accurate.
 *
 * Replace each stub with a real provider client without touching the fan-out logic.
 */
import type { DeliveryRecord, Channel, NotificationRecord } from './types.js';

export interface ChannelProvider {
  channel: Channel;
  send(notification: NotificationRecord, recipientContact?: string): Promise<DeliveryRecord>;
}

/** In-app: always succeeds — the record is the delivery. */
export const inAppProvider: ChannelProvider = {
  channel: 'in_app',
  async send(notif) {
    return { channel: 'in_app', status: 'sent', attemptedAt: new Date().toISOString() };
  },
};

/** Email stub — replace body with nodemailer/SES call. */
export const emailProvider: ChannelProvider = {
  channel: 'email',
  async send(notif, address) {
    if (!address) return { channel: 'email', status: 'suppressed', attemptedAt: new Date().toISOString(), error: 'no email address' };
    console.log(`[email] → ${address}  subject="${notif.title}"`);
    // TODO: real provider
    return { channel: 'email', status: 'sent', attemptedAt: new Date().toISOString() };
  },
};

/** SMS stub — replace with Unifonic / Msegat (KSA) or Twilio. */
export const smsProvider: ChannelProvider = {
  channel: 'sms',
  async send(notif, phoneNumber) {
    if (!phoneNumber) return { channel: 'sms', status: 'suppressed', attemptedAt: new Date().toISOString(), error: 'no phone number' };
    console.log(`[sms] → ${phoneNumber}  "${notif.title}"`);
    // TODO: real provider
    return { channel: 'sms', status: 'sent', attemptedAt: new Date().toISOString() };
  },
};

/** Push stub — replace with FCM/APNs. */
export const pushProvider: ChannelProvider = {
  channel: 'push',
  async send(notif, deviceToken) {
    if (!deviceToken) return { channel: 'push', status: 'suppressed', attemptedAt: new Date().toISOString(), error: 'no device token' };
    console.log(`[push] → ${deviceToken}  "${notif.title}"`);
    // TODO: real provider
    return { channel: 'push', status: 'sent', attemptedAt: new Date().toISOString() };
  },
};

export const ALL_PROVIDERS: Record<Channel, ChannelProvider> = {
  in_app: inAppProvider,
  email:  emailProvider,
  sms:    smsProvider,
  push:   pushProvider,
};

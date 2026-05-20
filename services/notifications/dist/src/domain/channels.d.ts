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
export declare const inAppProvider: ChannelProvider;
/** Email stub — replace body with nodemailer/SES call. */
export declare const emailProvider: ChannelProvider;
/** SMS stub — replace with Unifonic / Msegat (KSA) or Twilio. */
export declare const smsProvider: ChannelProvider;
/** Push stub — replace with FCM/APNs. */
export declare const pushProvider: ChannelProvider;
export declare const ALL_PROVIDERS: Record<Channel, ChannelProvider>;

/**
 * Core fan-out logic.
 * 1. Resolve recipient preference (locale + opted-in channels)
 * 2. Render template with recipient's locale at delivery time (CLAUDE.md §8)
 * 3. Fan out to each opted-in channel via the provider registry
 * 4. Persist the notification record with all delivery results
 */
import { renderTemplate } from './templates.js';
import { NotifError } from './errors.js';
let _id = 0;
export const newId = (prefix) => `${prefix}_${(++_id).toString(16).padStart(6, '0')}`;
/** Default preference — in_app only, English, no quiet hours. */
const DEFAULT_PREF = {
    locale: 'en',
    channels: ['in_app'],
};
function isQuietHour(pref) {
    if (!pref.quietFrom || !pref.quietUntil)
        return false;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    // Simple range check (does not wrap midnight — good enough for a stub)
    return hhmm >= pref.quietFrom && hhmm < pref.quietUntil;
}
export async function sendNotification(input, repo, providers, 
/** Contact map: channel → address/token. Passed by caller (from people service lookup). */
contacts = {}) {
    if (!input.recipientId)
        throw new NotifError('VALIDATION', 'recipientId is required', 'recipientId');
    if (!input.type)
        throw new NotifError('VALIDATION', 'type is required', 'type');
    // 1. Resolve preferences
    const pref = await repo.getPreference(input.recipientId) ?? { recipientId: input.recipientId, ...DEFAULT_PREF };
    // 2. Render at delivery time using recipient locale (CLAUDE.md §8)
    const { title, body } = renderTemplate(input.type, input.vars, pref.locale);
    // 3. Determine channels — in_app always included; others from preference
    const channels = ['in_app', ...pref.channels.filter((c) => c !== 'in_app')];
    // Suppress non-in_app channels during quiet hours for low/normal priority
    const priority = input.priority ?? 'normal';
    const quietActive = isQuietHour(pref);
    const effectiveChannels = channels.filter((c) => {
        if (c === 'in_app')
            return true;
        if (quietActive && (priority === 'low' || priority === 'normal'))
            return false;
        return true;
    });
    // 4. Fan out
    const deliveries = await Promise.all(effectiveChannels.map((channel) => providers[channel]?.send({ id: 'pending', recipientId: input.recipientId, entityId: input.entityId, type: input.type, priority, title, body, vars: input.vars, read: false, deliveries: [], createdAt: '' }, contacts[channel]).catch((err) => ({
        channel,
        status: 'failed',
        attemptedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
    }))));
    // 5. Persist
    const rec = {
        id: newId('ntf'),
        recipientId: input.recipientId,
        entityId: input.entityId,
        type: input.type,
        priority,
        title,
        body,
        vars: input.vars,
        sourceEventType: input.sourceEventType,
        sourceEventId: input.sourceEventId,
        read: false,
        deliveries,
        createdAt: new Date().toISOString(),
    };
    await repo.save(rec);
    return rec;
}
export async function markRead(id, repo) {
    const rec = await repo.findById(id);
    if (!rec)
        throw new NotifError('NOT_FOUND', `Notification ${id} not found`);
    return repo.markRead(id);
}
export async function markAllRead(recipientId, repo) {
    return repo.markAllRead(recipientId);
}

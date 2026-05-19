/**
 * SLA calculation in business hours against the entity working calendar
 * (workflow-engine.md §5, CLAUDE.md §5).
 *
 * KSA work week is Sun–Thu (0–4). Ramadan/Hajj/Eid holiday clusters must be
 * loaded or every approval will appear falsely breached.
 *
 * Supports ISO 8601 duration: PT8H, PT24H, P1D, P2D.
 */

import type { SlaCalculator, WorkingCalendar } from './types.js';

export interface CalendarRepo {
  getCalendar(entityId: string): Promise<WorkingCalendar>;
}

/** Parse a limited subset of ISO 8601 durations → total hours. */
function parseDurationHours(iso: string): number {
  const match = iso.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/,
  );
  if (!match) throw new Error(`Unsupported ISO duration: ${iso}`);
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return days * 24 + hours + minutes / 60;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Given a start time and a duration, advance the clock by `hours` of business
 * time and return the wall-clock timestamp when the SLA would be due.
 *
 * Assumes business hours are 08:00–17:00 local (9 h/day). A full
 * implementation would read per-entity shift hours; this is a safe default.
 */
function addBusinessHours(
  fromMs: number,
  durationHours: number,
  calendar: WorkingCalendar,
): Date {
  const BUSINESS_START = 8;
  const BUSINESS_END = 17;
  const HOURS_PER_DAY = BUSINESS_END - BUSINESS_START;

  let remaining = durationHours;
  const cur = new Date(fromMs);

  // Snap to start of business day if currently outside hours
  const curHour = cur.getUTCHours();
  if (curHour < BUSINESS_START) {
    cur.setUTCHours(BUSINESS_START, 0, 0, 0);
  } else if (curHour >= BUSINESS_END) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    cur.setUTCHours(BUSINESS_START, 0, 0, 0);
  }

  while (remaining > 0) {
    const dow = cur.getUTCDay();
    const iso = toISODate(cur);
    const isWorkDay = calendar.workWeek.includes(dow) && !calendar.holidays.has(iso);

    if (!isWorkDay) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(BUSINESS_START, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(cur);
    endOfDay.setUTCHours(BUSINESS_END, 0, 0, 0);
    const hoursLeftToday = (endOfDay.getTime() - cur.getTime()) / 3_600_000;

    if (remaining <= hoursLeftToday) {
      cur.setTime(cur.getTime() + remaining * 3_600_000);
      remaining = 0;
    } else {
      remaining -= hoursLeftToday;
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(BUSINESS_START, 0, 0, 0);
    }
  }

  return cur;
}

export function createSlaCalculator(calRepo: CalendarRepo): SlaCalculator {
  return {
    async dueAt(
      from: string,
      isoDuration: string,
      businessHours: boolean,
      entityId: string,
    ): Promise<string> {
      const hours = parseDurationHours(isoDuration);
      const fromMs = new Date(from).getTime();

      if (!businessHours) {
        return new Date(fromMs + hours * 3_600_000).toISOString();
      }

      const calendar = await calRepo.getCalendar(entityId);
      return addBusinessHours(fromMs, hours, calendar).toISOString();
    },
  };
}

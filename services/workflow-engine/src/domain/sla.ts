/**
 * SLA calculation in business hours against an entity working calendar.
 * workflow-engine.md §5: KSA Sun–Thu; Ramadan/Eid clusters must be loaded.
 *
 * ISO 8601 durations supported: PT{n}H (hours), P{n}D (days), P{n}W (weeks).
 */

export interface WorkingCalendar {
  workWeek: number[];      // 0=Sun … 6=Sat
  holidays: Set<string>;   // ISO date strings 'YYYY-MM-DD'
  workdayStartHour: number; // e.g. 8
  workdayEndHour: number;   // e.g. 17
}

export const KSA_CALENDAR: WorkingCalendar = {
  workWeek: [0, 1, 2, 3, 4],   // Sun–Thu
  holidays: new Set(),
  workdayStartHour: 8,
  workdayEndHour: 17,
};

/** Parse ISO 8601 duration → total hours */
export function parseDurationHours(duration: string): number {
  // PT{n}H
  const hoursMatch = duration.match(/^PT(\d+(?:\.\d+)?)H$/);
  if (hoursMatch) return parseFloat(hoursMatch[1]);

  // P{n}D
  const daysMatch = duration.match(/^P(\d+)D$/);
  if (daysMatch) return parseInt(daysMatch[1]) * 8; // 8 working hours/day

  // P{n}W
  const weeksMatch = duration.match(/^P(\d+)W$/);
  if (weeksMatch) return parseInt(weeksMatch[1]) * 5 * 8; // 5 working days/week

  throw new Error(`Unsupported ISO 8601 duration: ${duration}`);
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWorkingDay(date: Date, cal: WorkingCalendar): boolean {
  return cal.workWeek.includes(date.getUTCDay()) && !cal.holidays.has(toISO(date));
}

/**
 * Add `hours` business hours to `from`, returning the due timestamp.
 * Advances day-by-day within working hours (workdayStart–workdayEnd).
 */
export function addBusinessHours(
  from: Date,
  hours: number,
  cal: WorkingCalendar,
): Date {
  const { workdayStartHour: start, workdayEndHour: end } = cal;
  const hoursPerDay = end - start;

  let remaining = hours;
  let cur = new Date(from);

  // Snap to next working day/hour if `from` is outside working hours
  if (!isWorkingDay(cur, cal) || cur.getUTCHours() >= end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    cur.setUTCHours(start, 0, 0, 0);
    while (!isWorkingDay(cur, cal)) {
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else if (cur.getUTCHours() < start) {
    cur.setUTCHours(start, 0, 0, 0);
  }

  while (remaining > 0) {
    if (!isWorkingDay(cur, cal)) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(start, 0, 0, 0);
      continue;
    }

    const hoursLeft = end - cur.getUTCHours() - cur.getUTCMinutes() / 60;
    if (remaining <= hoursLeft) {
      cur = new Date(cur.getTime() + remaining * 3600000);
      remaining = 0;
    } else {
      remaining -= hoursLeft;
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(start, 0, 0, 0);
    }
  }

  return cur;
}

/**
 * Calculate SLA due timestamp from a step's SLA spec.
 */
export function computeSlaDueAt(
  from: Date,
  duration: string,
  businessHours: boolean,
  cal: WorkingCalendar,
): string {
  if (!businessHours) {
    const hours = parseDurationHours(duration);
    return new Date(from.getTime() + hours * 3600000).toISOString();
  }
  const hours = parseDurationHours(duration);
  return addBusinessHours(from, hours, cal).toISOString();
}

/** Returns true if the SLA due-at has passed */
export function isSlaBreached(slaDueAt: string): boolean {
  return new Date(slaDueAt) < new Date();
}

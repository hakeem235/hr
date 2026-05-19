/**
 * SLA calculation in business hours against an entity working calendar.
 * workflow-engine.md §5: KSA Sun–Thu; Ramadan/Eid clusters must be loaded.
 *
 * ISO 8601 durations supported: PT{n}H (hours), P{n}D (days), P{n}W (weeks).
 */
export interface WorkingCalendar {
    workWeek: number[];
    holidays: Set<string>;
    workdayStartHour: number;
    workdayEndHour: number;
}
export declare const KSA_CALENDAR: WorkingCalendar;
/** Parse ISO 8601 duration → total hours */
export declare function parseDurationHours(duration: string): number;
/**
 * Add `hours` business hours to `from`, returning the due timestamp.
 * Advances day-by-day within working hours (workdayStart–workdayEnd).
 */
export declare function addBusinessHours(from: Date, hours: number, cal: WorkingCalendar): Date;
/**
 * Calculate SLA due timestamp from a step's SLA spec.
 */
export declare function computeSlaDueAt(from: Date, duration: string, businessHours: boolean, cal: WorkingCalendar): string;
/** Returns true if the SLA due-at has passed */
export declare function isSlaBreached(slaDueAt: string): boolean;

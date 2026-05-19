import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationHours, addBusinessHours, computeSlaDueAt, isSlaBreached, KSA_CALENDAR } from '../src/domain/sla.js';

test('parseDurationHours: PT8H → 8', () => {
  assert.equal(parseDurationHours('PT8H'), 8);
});
test('parseDurationHours: P1D → 8', () => {
  assert.equal(parseDurationHours('P1D'), 8);
});
test('parseDurationHours: P1W → 40', () => {
  assert.equal(parseDurationHours('P1W'), 40);
});
test('parseDurationHours: PT4H → 4', () => {
  assert.equal(parseDurationHours('PT4H'), 4);
});
test('parseDurationHours: unknown throws', () => {
  assert.throws(() => parseDurationHours('P1M'));
});

test('addBusinessHours: 8h from Monday 09:00 stays same day', () => {
  // 2026-03-15 is Sunday (KSA workday). 09:00 + 8h = 17:00 same day
  const from = new Date('2026-03-15T09:00:00Z');
  const due = addBusinessHours(from, 8, KSA_CALENDAR);
  assert.equal(due.toISOString().slice(0, 10), '2026-03-15');
  assert.equal(due.getUTCHours(), 17);
});

test('addBusinessHours: 8h from Sunday 14:00 spills to Monday', () => {
  // 2026-03-15 Sun 14:00 — 3h left today (14→17), then 5h next day (Mon 08→13)
  const from = new Date('2026-03-15T14:00:00Z');
  const due = addBusinessHours(from, 8, KSA_CALENDAR);
  assert.equal(due.toISOString().slice(0, 10), '2026-03-16'); // Monday
  assert.equal(due.getUTCHours(), 13);
});

test('addBusinessHours: skips Friday/Saturday (KSA)', () => {
  // 2026-03-19 is Thursday 16:00. 1h left today (16→17); then skip Fri(20)/Sat(21); Sun(22) 08:00 + 7h = 15:00
  const from = new Date('2026-03-19T16:00:00Z');
  const due = addBusinessHours(from, 8, KSA_CALENDAR);
  assert.equal(due.toISOString().slice(0, 10), '2026-03-22'); // Sunday
  assert.equal(due.getUTCHours(), 15);
});

test('addBusinessHours: skips holidays', () => {
  const cal = { ...KSA_CALENDAR, holidays: new Set(['2026-03-16']) };
  // Sun 15 Mar 14:00 + 8h → normally Mon 16 13:00, but Mon is holiday → Tue 17 13:00
  const from = new Date('2026-03-15T14:00:00Z');
  const due = addBusinessHours(from, 8, cal);
  assert.equal(due.toISOString().slice(0, 10), '2026-03-17');
});

test('computeSlaDueAt: non-business-hours adds wall-clock hours', () => {
  const from = new Date('2026-03-15T09:00:00Z');
  const due = computeSlaDueAt(from, 'PT8H', false, KSA_CALENDAR);
  assert.equal(new Date(due).toISOString(), '2026-03-15T17:00:00.000Z');
});

test('isSlaBreached: past date is breached', () => {
  assert.equal(isSlaBreached('2020-01-01T00:00:00Z'), true);
});
test('isSlaBreached: future date is not breached', () => {
  assert.equal(isSlaBreached('2099-01-01T00:00:00Z'), false);
});

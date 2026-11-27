import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRiyadhDate, formatRiyadhDateTime, formatRiyadhTime, riyadhIsoDate } from '../lib/dates.ts';

const beforeMidnight = '2026-12-31T20:59:59Z';
const afterMidnight = '2026-12-31T21:00:00Z';
const digits = value => value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660));

test('Gregorian day boundaries use Riyadh time', () => {
  assert.equal(riyadhIsoDate(new Date(beforeMidnight)), '2026-12-31');
  assert.equal(riyadhIsoDate(new Date(afterMidnight)), '2027-01-01');
  assert.match(digits(formatRiyadhDate(beforeMidnight)), /2026/);
  assert.match(digits(formatRiyadhDateTime(afterMidnight)), /2027/);
  assert.notEqual(formatRiyadhTime(beforeMidnight), formatRiyadhTime(afterMidnight));
});

test('date-only values keep their day and skip fabricated times', () => {
  assert.equal(formatRiyadhDate('2026-11-27'), formatRiyadhDate('2026-11-27T00:00:00+03:00'));
  assert.equal(formatRiyadhDateTime('2026-11-27'), formatRiyadhDate('2026-11-27'));
  assert.match(digits(formatRiyadhDate('2026-11-27')), /2026/);
  assert.equal(formatRiyadhDate(null), '—');
  assert.equal(formatRiyadhDateTime('invalid', 'غير محدد'), 'غير محدد');
});

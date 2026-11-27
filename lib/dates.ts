/** Calendar dates throughout the application are Gregorian. Timestamps are shown in Riyadh time. */
const zone = 'Asia/Riyadh';
const arabic = { calendar: 'gregory', timeZone: zone } as const;
const date = new Intl.DateTimeFormat('ar-SA', { ...arabic, dateStyle: 'medium' });
const dateTime = new Intl.DateTimeFormat('ar-SA', { ...arabic, dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('ar-SA', { ...arabic, timeStyle: 'medium' });
const iso = new Intl.DateTimeFormat('en-CA', {
  calendar: 'gregory', numberingSystem: 'latn', timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

type DateValue = Date | string | null | undefined;

function format(value: DateValue, formatter: Intl.DateTimeFormat, fallback: string) {
  if (!value) return fallback;
  const parsed = typeof value === 'string' ? new Date(dateOnly.test(value) ? `${value}T12:00:00+03:00` : value) : value;
  return Number.isFinite(parsed.getTime()) ? formatter.format(parsed) : fallback;
}

export const formatRiyadhDate = (value: DateValue, fallback = '—') => format(value, date, fallback);
export const formatRiyadhDateTime = (value: DateValue, fallback = '—') =>
  typeof value === 'string' && dateOnly.test(value) ? formatRiyadhDate(value, fallback) : format(value, dateTime, fallback);
export const formatRiyadhTime = (value: DateValue, fallback = '—') => format(value, time, fallback);

/** ISO date-only for inputs and comparisons. It is independent of the browser's locale and clock zone. */
export function riyadhIsoDate(value = new Date()) {
  const parts = iso.formatToParts(value);
  const field = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}

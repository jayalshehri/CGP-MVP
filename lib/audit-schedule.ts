import { readStrategyRows } from './strategy-read';
import { cycleStage, cycleStageLabels, scheduleState, todayRiyadh, type EvidenceRequest, type ReviewCycle } from './grc';

export type ScheduleControl = {
  id: number; control_code: string; title_ar: string; control_owner: string | null; control_owner_id: string | null;
  audit_frequency: string; last_audit_date: string | null; next_audit_date: string | null;
  frameworks: { code: string } | null;
};
export type ScheduleRow = { control: ScheduleControl; cycle?: ReviewCycle; request?: EvidenceRequest };
export type ScheduleScope = 'setup' | 'due' | 'open' | 'completed';
export type SetupFilter = 'all' | 'unowned' | 'unscheduled';

export function positiveId(value: string | null | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function describeStage(row: ScheduleRow) {
  if (row.cycle?.status === 'completed') return { key: 'completed', label: 'مكتملة' };
  if (!row.cycle) return !row.control.control_owner_id
    ? { key: 'unowned', label: 'مالك غير معيّن' }
    : { key: 'unscheduled', label: 'لم تُجدول دورة' };
  const stage = cycleStage(true, row.request?.status);
  return { key: stage, label: cycleStageLabels[stage] };
}

export const dueState = (row: ScheduleRow, days: number) =>
  scheduleState(row.cycle?.status === 'open' ? row.cycle.due_date : null, days);

export function closedThisMonth(cycle: ReviewCycle, today = todayRiyadh()) {
  if (cycle.status !== 'completed' || !cycle.completed_at) return false;
  const time = Date.parse(cycle.completed_at);
  const start = new Date(`${today.slice(0, 7)}-01T00:00:00+03:00`);
  const next = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = Date.parse(`${next.toISOString().slice(0, 10)}T00:00:00+03:00`);
  return time >= start.getTime() && time < end;
}

export async function readAuditPages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>,
  key: (row: T) => number | string,
) {
  const result = await readStrategyRows(query, key);
  if (result.error) throw new Error('تعذر تحميل القائمة كاملة. أعد تحميل الصفحة للمحاولة مرة أخرى.');
  return result.data;
}

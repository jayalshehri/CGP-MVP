import type { UserRole } from './auth';
import { controlHref, controlContext } from './control360';
import { isBusinessFramework } from './compliance-frameworks';
import { supabase } from './supabase';

export type QueueActor = { id: string; role: UserRole };
export type WorkRequest = {
 id: number; control_id: number; cycle_id: number; requirement: string; due_date: string; status: string;
 requested_from: string; reviewer_id: string; control_owner_id: string | null;
 control_code: string; control_title: string; framework_code: string;
};
type RequestRow = Omit<WorkRequest, 'control_owner_id' | 'control_code' | 'control_title' | 'framework_code'> & {
 controls: { id: number; control_code: string; title_ar: string; control_owner_id: string | null; frameworks: { code: string; is_active: boolean } };
 control_review_cycles: { id: number; status: string };
};
const pendingStatuses = ['open', 'submitted', 'changes_requested', 'rejected'];
const submissionStatuses = ['open', 'changes_requested', 'rejected'];

// Filter joined framework/cycle before pagination, under the caller's existing
// RLS. No title heuristic, privileged API, or global controls fetch is needed.
export async function loadWorkRequests(controlId?: number, frameworkCode?: string, personalOwnerId?: string): Promise<WorkRequest[]> {
 const result: WorkRequest[] = [];
 const size = 500;
 for (let offset = 0; ; offset += size) {
  let query = supabase.from('evidence_requests')
   .select('id,control_id,cycle_id,requirement,due_date,status,requested_from,reviewer_id,controls!inner(id,control_code,title_ar,control_owner_id,frameworks!inner(code,is_active)),control_review_cycles!inner(id,status)')
   .in('status', pendingStatuses)
   .eq('controls.frameworks.is_active', true)
   .neq('controls.frameworks.code', 'QA_SYNTH')
   .eq('control_review_cycles.status', 'open')
   .order('due_date').order('id').range(offset, offset + size - 1);
  if (controlId !== undefined) query = query.eq('control_id', controlId);
  if (frameworkCode) query = query.eq('controls.frameworks.code', frameworkCode);
  if (personalOwnerId) query = query.eq('controls.control_owner_id', personalOwnerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as RequestRow[];
  for (const row of rows) {
   // Defense in depth: authoritative framework metadata only. Test deep links
   // and test records remain in their existing modules, not the business queue.
   if (!row.controls?.frameworks?.is_active || !isBusinessFramework(row.controls.frameworks.code) || row.control_review_cycles?.status !== 'open') continue;
   result.push({ id: row.id, control_id: row.control_id, cycle_id: row.cycle_id, requirement: row.requirement, due_date: row.due_date, status: row.status, requested_from: row.requested_from, reviewer_id: row.reviewer_id, control_owner_id: row.controls.control_owner_id, control_code: row.controls.control_code, control_title: row.controls.title_ar, framework_code: row.controls.frameworks.code });
  }
  if (rows.length < size) break;
 }
 // Date-only ordering puts overdue first, then today's/nearest/later dates.
 // ID is only a deterministic tie-breaker, not a new workflow priority.
 return result.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
}

export function requestAction(request: WorkRequest, actor: QueueActor, context = ''): { label: string; href: string } | null {
 const team = actor.role === 'admin' || actor.role === 'cybersecurity_team';
 if (submissionStatuses.includes(request.status) && (team || (actor.role === 'control_owner' && request.control_owner_id === actor.id))) {
  const params = controlContext(new URLSearchParams(context));
  params.set('request', String(request.id));
  return { label: 'تقديم الدليل', href: `/controls/${request.control_id}/evidence/new?${params}` };
 }
 if (request.status === 'submitted' && team && request.reviewer_id === actor.id && request.requested_from !== actor.id) {
  // Navigate to the existing evidence workflow; its independent-review checks
  // still govern individual evidence decisions. This grants no new capability.
  return { label: 'مراجعة الدليل', href: controlHref(request.control_id, context, 'evidence') };
 }
 return null;
}

export function workQueueSummary(requests: WorkRequest[], actor: QueueActor, today: string) {
 const limit = new Date(`${today}T12:00:00+03:00`);
 limit.setUTCDate(limit.getUTCDate() + 30);
 const lastDay = limit.toISOString().slice(0, 10);
 const assigned = requests.filter(request => requestAction(request, actor) !== null &&
  (submissionStatuses.includes(request.status) ? request.requested_from === actor.id : request.reviewer_id === actor.id));
 return { required: assigned.length, overdue: assigned.filter(request => request.due_date < today).length, dueSoon: assigned.filter(request => request.due_date >= today && request.due_date <= lastDay).length };
}

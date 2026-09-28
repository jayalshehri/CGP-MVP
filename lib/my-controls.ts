import { supabase } from './supabase';
import type { UserRole } from './auth';
import type { SharedFinding, CorrectiveAction } from './findings';
import type { AssessmentItem } from './assessment';
import type { EvidenceRecord } from './grc';
import { loadWorkRequests, requestAction, type QueueActor, type WorkRequest } from './grc-work-queue';
import { controlHref, controlRegisterHref } from './control360';
import { assessmentItemHref, itemNeedsInput } from './assessment-journey';
import { isBusinessFramework } from './compliance-frameworks';
import { myControlsOrigin, myControlsFilters } from './my-controls-context';

export type PersonalControl = {
  id: number; control_code: string; title_ar: string; control_owner_id: string;
  implementation_status: string; evidence_status: string; due_date: string | null; next_audit_date: string | null;
  frameworks: { id?: number; code: string; name_ar: string; is_active: boolean };
};
export type PersonalItem = AssessmentItem & { cycle: { id: number; assessor_id: string | null; status: string; due_date: string | null; imported: boolean } };
export type PersonalData = { controls: PersonalControl[]; requests: WorkRequest[]; evidence: EvidenceRecord[]; findings: SharedFinding[]; actions: CorrectiveAction[]; items: PersonalItem[] };
export const isTeam = (role: UserRole) => role === 'admin' || role === 'cybersecurity_team';

// Caller RLS is always retained. Page before counting, explicitly scope every
// dependent read on the server, and bound IN lists; never a query per control.
async function pages<T>(query: (from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await query(from);
    if (result.error) throw new Error(result.error.message);
    const chunk = (result.data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < 500) return rows;
  }
}
async function batches<T>(ids: number[], query: (ids: number[], from: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const result: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) result.push(...await pages<T>(from => query(ids.slice(offset, offset + 200), from)));
  return result;
}
export async function loadMyControls(actor: QueueActor): Promise<PersonalData> {
  if (actor.role !== 'control_owner' && !isTeam(actor.role)) throw new Error('ضوابطي مخصصة لأصحاب العمل المسند، وليس لنطاق التدقيق.');
  const controls = (await pages<PersonalControl>(from => supabase.from('controls')
    .select('id,control_code,title_ar,control_owner_id,implementation_status,evidence_status,due_date,next_audit_date,frameworks!inner(id,code,name_ar,is_active)')
    .eq('control_owner_id', actor.id).eq('frameworks.is_active', true).neq('frameworks.code', 'QA_SYNTH')
    .order('id').range(from, from + 499)))
    .filter(control => control.control_owner_id === actor.id && control.frameworks.is_active && isBusinessFramework(control.frameworks.code));
  const ids = controls.map(control => control.id);
  if (!ids.length) return { controls, requests: [], evidence: [], findings: [], actions: [], items: [] };
  const [requests, evidence, findings, items] = await Promise.all([
    loadWorkRequests(undefined, undefined, actor.id),
    batches<EvidenceRecord>(ids, (chunk, from) => supabase.rpc('grc_evidence_register').select('id,control_id,source_control_id,link_id,is_current,status,valid_until').in('control_id', chunk).eq('is_current', true).order('id').order('link_id', { nullsFirst: true }).range(from, from + 499)),
    batches<SharedFinding>(ids, (chunk, from) => supabase.from('grc_findings').select('id,reference_code,control_id,framework_id,owner_id,status,due_date,verification_status,created_by').in('control_id', chunk).neq('status', 'closed').order('id').range(from, from + 499)),
    // Being a control owner or item owner is NOT assessor authorization.
    isTeam(actor.role) ? batches<PersonalItem>(ids, (chunk, from) => supabase.from('assessment_items')
      .select('id,cycle_id,control_id,control_code,compliance_status,notes,owner_id,expected_compliance_date,corrective_action,review_status,cycle:assessment_cycles!cycle_id!inner(id,assessor_id,status,due_date,imported)')
      .in('control_id', chunk).eq('cycle.assessor_id', actor.id)
      .in('cycle.status', ['draft', 'in_progress', 'evidence_collection']).order('id').range(from, from + 499)) : Promise.resolve([]),
  ]);
  const actions = await batches<CorrectiveAction>(findings.map(f => f.id), (chunk, from) => supabase.from('grc_corrective_actions')
    .select('id,finding_id,owner_id,status,due_date,verification_status').in('finding_id', chunk).eq('owner_id', actor.id).order('id').range(from, from + 499));
  const scoped = new Set(ids);
  return { controls, requests: requests.filter(r => scoped.has(r.control_id) && r.requested_from === actor.id), evidence, findings, actions, items };
}

export type PersonalAction = { label: string; href: string; due: string | null; kind: 'evidence' | 'assessment' | 'finding' | 'action' | 'periodic' | 'implementation' };
export type PersonalRow = { control: PersonalControl; actions: PersonalAction[]; next: PersonalAction | null; evidenceNeeded: boolean; evidenceLabel: string; assessmentNeeded: boolean; findingCount: number; actionCount: number; waiting: boolean; overdue: boolean; due: string | null };

const normalizeIdentifier = (value: string) => value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[‐-―−]/g, '-');
// Display label only. Imported title_ar sometimes appends the same control (or
// its parent) code. Remove only that identifiable decoration, never numbers in
// business text or unrelated regulatory references. Full text stays in Control 360.
export function myControlTitle(control: Pick<PersonalControl, 'title_ar' | 'control_code'>) {
  const title = control.title_ar.trim();
  const identifier = '[0-9٠-٩۰-۹]+(?:[-‐-―−][0-9٠-٩۰-۹]+)+';
  const suffix = title.match(new RegExp(`\\s+[-–—:|]\\s*(${identifier})\\s*$`));
  const prefix = title.match(new RegExp(`^(${identifier})\\s+[-–—:|]\\s+`));
  const decoration = suffix ?? prefix;
  if (!decoration) return title;
  const code = normalizeIdentifier(decoration[1]), ownCode = normalizeIdentifier(control.control_code);
  if (code !== ownCode && !ownCode.startsWith(code + '-')) return title;
  const concise = suffix ? title.slice(0, suffix.index).trim() : title.slice(prefix![0].length).trim();
  return concise || title;
}

// Same framework catalogue order (frameworks.id) and numeric canonical-code
// hierarchy used by ControlsCatalog; urgency remains a per-control action, not
// an implicit reordering of the official catalogue. Stable ID resolves ties.
export function compareMyControls(a: PersonalControl, b: PersonalControl) {
  return (a.frameworks.id ?? Number.MAX_SAFE_INTEGER) - (b.frameworks.id ?? Number.MAX_SAFE_INTEGER) ||
    a.frameworks.code.localeCompare(b.frameworks.code, 'en', { numeric: true }) ||
    normalizeIdentifier(a.control_code).localeCompare(normalizeIdentifier(b.control_code), 'en', { numeric: true }) || a.id - b.id;
}
export function deriveMyControls(data: PersonalData, actor: QueueActor, today: string, filters = ''): PersonalRow[] {
  const context = myControlsOrigin(filters);
  return data.controls.map(control => {
    const requests = data.requests.filter(r => r.control_id === control.id);
    const actions: PersonalAction[] = [];
    for (const request of requests) {
      // Review tasks stay in /review; here only the user's owner submission work.
      const action = request.requested_from === actor.id && request.status !== 'submitted' ? requestAction(request, actor, context) : null;
      if (action) actions.push({ ...action, label: 'استكمال مراجعة دورية — تقديم الدليل', kind: 'periodic', due: request.due_date });
    }
    const versions = data.evidence.filter(e => e.control_id === control.id && e.is_current);
    const waiting = requests.some(r => r.status === 'submitted') || versions.some(e => ['pending_review', 'under_review'].includes(e.status));
    // The register is the existing review-state source, not a new eligibility
    // validator. Shared accepted evidence is not relabelled or re-reviewed here.
    const evidenceNeeded = requests.some(r => r.requested_from === actor.id && ['open', 'rejected', 'changes_requested'].includes(r.status)) ||
      (!waiting && (control.evidence_status === 'not_uploaded' || versions.some(e => e.source_control_id === control.id && (['rejected', 'changes_requested'].includes(e.status) || (!!e.valid_until && e.valid_until < today)))));
    if (evidenceNeeded && !actions.some(a => a.kind === 'periodic')) actions.push({ label: 'تقديم دليل', kind: 'evidence', due: control.due_date, href: `/controls/${control.id}/evidence/new?${context}` });
    const items = data.items.filter(i => i.control_id === control.id && isTeam(actor.role) && i.cycle.assessor_id === actor.id && ['draft', 'in_progress', 'evidence_collection'].includes(i.cycle.status) && (itemNeedsInput(i) || i.review_status === 'changes_requested'));
    for (const item of items) {
      const href = assessmentItemHref(control.frameworks.code, item.cycle_id, item.id, context);
      if (href) actions.push({ label: 'استكمال التقييم', kind: 'assessment', due: item.cycle.due_date, href });
    }
    const findings = data.findings.filter(f => f.control_id === control.id && f.status !== 'closed');
    const owned = findings.filter(f => f.owner_id === actor.id && ['open', 'in_treatment'].includes(f.status));
    const openActions = data.actions.filter(a => a.owner_id === actor.id && a.status !== 'completed' && owned.some(f => f.id === a.finding_id));
    for (const finding of owned) {
      const href = `${controlRegisterHref('findings', control.frameworks.code, control.id, context)}&finding=${finding.id}`;
      const ownedActions = openActions.filter(a => a.finding_id === finding.id);
      if (ownedActions.length) for (const action of ownedActions) actions.push({ label: `استكمال إجراء تصحيحي #${action.id}`, kind: 'action', due: action.due_date, href });
      else actions.push({ label: 'معالجة ملاحظة', kind: 'finding', due: finding.due_date, href });
    }
    if (isTeam(actor.role) && ['not_started', 'in_progress'].includes(control.implementation_status)) actions.push({ label: 'استكمال حالة التنفيذ', kind: 'implementation', due: control.due_date, href: controlHref(control.id, context) });
    const overdueActions = actions.filter(a => a.due && a.due < today).sort((a, b) => a.due!.localeCompare(b.due!));
    // One unique earliest overdue action is explainably urgent. Ties or
    // multiple non-overdue needs never get a fabricated business priority.
    const urgent = overdueActions[0] && overdueActions.filter(a => a.due === overdueActions[0].due).length === 1 ? overdueActions[0] : null;
    const next = actions.length === 1 ? actions[0] : urgent;
    const dates = actions.map(a => a.due).filter((date): date is string => !!date).sort();
    return { control, actions, next, evidenceNeeded, evidenceLabel: evidenceNeeded ? 'تحتاج دليلًا / استكمالًا' : waiting ? 'بانتظار المراجعة' : 'لا يوجد طلب دليل يتطلب إجراءً', assessmentNeeded: items.length > 0, findingCount: findings.length, actionCount: openActions.length, waiting: waiting || findings.some(f => f.owner_id === actor.id && f.status === 'pending_verification'), overdue: overdueActions.length > 0, due: dates[0] ?? control.next_audit_date };
  }).sort((a, b) => compareMyControls(a.control, b.control));
}
export function filterMyControls(rows: PersonalRow[], raw: string) {
  const filters = myControlsFilters(raw);
  const normalize = (text: string) => text.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[‐-―−]/g, '-').toLowerCase();
  const q = normalize(filters.get('q') ?? '').trim();
  return rows.filter(row => (!filters.has('framework') || row.control.frameworks.code === filters.get('framework')) &&
    (!filters.has('status') || row.control.implementation_status === filters.get('status')) &&
    (!q || normalize(`${row.control.control_code} ${row.control.title_ar}`).includes(q)) &&
    (!filters.has('evidence') || row.evidenceNeeded) && (!filters.has('assessment') || row.assessmentNeeded) &&
    (!filters.has('findings') || row.findingCount > 0 || row.actionCount > 0) && (!filters.has('overdue') || row.overdue) && (!filters.has('attention') || row.actions.length > 0));
}
export function myControlsSummary(rows: PersonalRow[]) {
  return { total: rows.length, attention: rows.filter(r => r.actions.length > 0).length, overdue: rows.filter(r => r.overdue).length, evidence: rows.filter(r => r.evidenceNeeded).length, waiting: rows.filter(r => r.waiting).length };
}

import type { UserRole } from './auth';
import type { AssessmentCycle, AssessmentItem } from './assessment';
import type { SharedFinding, CorrectiveAction } from './findings';
import type { EvidenceRecord, ReviewCycle } from './grc';
import { assessmentItemHref, itemNeedsInput } from './assessment-journey';
import { isBusinessFramework } from './compliance-frameworks';
import { QA_CERTIFICATION_CONTROL } from './qa-review-certification';

export const workTypeLabels = {
  EVIDENCE_REVIEW: 'مراجعة دليل',
  ASSESSMENT_ITEM_REVIEW: 'مراجعة بند تقييم',
  ASSESSMENT_REVIEW_COMPLETION: 'إنهاء مراجعة دورة',
  ASSESSMENT_APPROVAL: 'اعتماد دورة تقييم',
  CORRECTIVE_ACTION_VERIFICATION: 'تحقق إجراء تصحيحي مشترك',
  FINDING_VERIFICATION: 'تحقق ملاحظة مشتركة',
  FINDING_CLOSURE: 'إغلاق ملاحظة مشتركة',
  PERIODIC_REVIEW_FOLLOWUP: 'متابعة مراجعة دورية',
} as const;
export type WorkType = keyof typeof workTypeLabels;
export type Responsibility = 'assigned' | 'independent_team';
export const responsibilityLabels = { assigned: 'مسند إليّ', independent_team: 'متاح للفريق المستقل' };
export type ReviewActor = { id: string; role: UserRole };
export type ReviewFramework = { id: number; code: string; is_active: boolean };
export type ReviewControl = { id: number; framework_id: number; control_code: string; title_ar: string };
export type ReviewCycleRecord = AssessmentCycle;
export type ReviewMapping = { source_id: number; target_id: number; validation_status: string };
export type ReadSource = 'frameworks' | 'controls' | 'evidence' | 'cycles' | 'items' | 'itemLinks' | 'mappings' | 'findings' | 'actions' | 'periodic';
export type ReviewSnapshot = {
  frameworks: ReviewFramework[]; controls: ReviewControl[]; evidence: EvidenceRecord[];
  cycles: ReviewCycleRecord[]; items: AssessmentItem[]; itemLinks: { item_id: number; evidence_id: number }[];
  mappings: ReviewMapping[]; findings: SharedFinding[]; actions: CorrectiveAction[]; periodic: ReviewCycle[];
  errors: Partial<Record<ReadSource, string>>;
};
export type ReviewWorkItem = {
  key: string; type: WorkType; sourceId: number;
  sourceModel: 'evidence' | 'assessment_items' | 'assessment_cycles' | 'grc_findings' | 'grc_corrective_actions' | 'control_review_cycles';
  framework: string | null; controlId: number | null; controlCode: string | null;
  itemId: number | null; cycleId: number | null; title: string; state: string;
  responsibility: Responsibility; assignee: string | null; dueDate: string | null;
  sourceRoute: string; returnContext: string; actionLabel: string; reason: string;
};
export type CategoryResult = { type: WorkType; status: 'ready' | 'unavailable'; error: string | null; items: ReviewWorkItem[] };
export const isReviewTeam = (role: UserRole) => role === 'admin' || role === 'cybersecurity_team';
const dependencies: Record<WorkType, ReadSource[]> = {
  EVIDENCE_REVIEW: ['frameworks', 'controls', 'evidence', 'periodic'],
  ASSESSMENT_ITEM_REVIEW: ['frameworks', 'controls', 'cycles', 'items'],
  ASSESSMENT_REVIEW_COMPLETION: ['frameworks', 'controls', 'cycles', 'items', 'itemLinks', 'evidence', 'mappings'],
  ASSESSMENT_APPROVAL: ['frameworks', 'controls', 'cycles', 'items', 'itemLinks', 'evidence', 'mappings'],
  CORRECTIVE_ACTION_VERIFICATION: ['frameworks', 'controls', 'findings', 'actions', 'evidence', 'mappings'],
  FINDING_VERIFICATION: ['frameworks', 'controls', 'findings', 'actions', 'evidence', 'mappings'],
  FINDING_CLOSURE: ['frameworks', 'controls', 'findings', 'actions', 'evidence', 'mappings'],
  PERIODIC_REVIEW_FOLLOWUP: ['frameworks', 'controls', 'periodic'],
};

// A bounded, internal-only return URL. Never accept arbitrary redirect URLs.
export function reviewFilters(raw: string) {
  const params = new URLSearchParams(raw), result = new URLSearchParams();
  for (const key of ['type', 'framework', 'responsibility', 'state', 'due', 'page']) {
    const value = params.get(key);
    if (!value || value.length > 100) continue;
    if (key === 'type' && !(value in workTypeLabels)) continue;
    if (key === 'responsibility' && !['assigned', 'independent_team'].includes(value)) continue;
    if (key === 'due' && !['overdue', 'today', 'upcoming', 'undated'].includes(value)) continue;
    if (key === 'framework' && !/^[A-Z][A-Z0-9_]{1,31}$/.test(value)) continue;
    if (key === 'page' && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) continue;
    result.set(key, value);
  }
  return result;
}
export function reviewReturnHref(raw: string) {
  const params = reviewFilters(raw).toString();
  return `/review${params ? '?' + params : ''}`;
}
export function reviewWorkHref(item: ReviewWorkItem, raw = '') {
  const [path, query = ''] = item.sourceRoute.split('?'), params = new URLSearchParams(query);
  params.set('from', 'review');
  params.set('review_context', reviewFilters(raw).toString());
  return `${path}?${params}`;
}

// Read projection only, never a replacement for the RPC's locked revalidation.
// Each row retains its authoritative source identity/state; no persisted task state.
export function buildReviewWorkQueue(snapshot: ReviewSnapshot, actor: ReviewActor, today: string, certificationMode = false): CategoryResult[] {
  const categories: CategoryResult[] = (Object.keys(workTypeLabels) as WorkType[]).map(type => {
    const error = dependencies[type].find(source => snapshot.errors[source]);
    return { type, status: error ? 'unavailable' : 'ready', error: error ? snapshot.errors[error]! : null, items: [] };
  });
  if (!isReviewTeam(actor.role)) return categories.map(category => ({ ...category, status: 'unavailable', error: 'هذا الدور ليس مخولًا بأعمال المراجعة والقرار.', items: [] }));
  const catalog = new Map(snapshot.frameworks.map(f => [f.id, f]));
  const controls = new Map(snapshot.controls.map(c => [c.id, c]));
  const framework = (id: number | null) => id === null ? null : catalog.get(id);
  const activeFramework = (id: number) => { const f = framework(id); return !!f?.is_active && (certificationMode ? f.code === 'QA_SYNTH' : isBusinessFramework(f.code)); };
  const activeControl = (id: number | null) => id !== null && !!controls.get(id) && activeFramework(controls.get(id)!.framework_id) &&
    (!certificationMode || controls.get(id)!.control_code === QA_CERTIFICATION_CONTROL);
  const controlContext = (id: number | null) => {
    const c = id === null ? null : controls.get(id);
    return { framework: c ? framework(c.framework_id)?.code ?? null : null, controlId: id, controlCode: c?.control_code ?? null };
  };
  const evidence = new Map<number, EvidenceRecord[]>();
  for (const version of snapshot.evidence) evidence.set(version.id, [...(evidence.get(version.id) ?? []), version]);
  const approvedMappings = new Set(snapshot.mappings.filter(m => m.validation_status === 'approved').flatMap(m => [`${m.source_id}:${m.target_id}`, `${m.target_id}:${m.source_id}`]));
  // Mirrors the existing version/review/mapping predicate using caller-visible
  // register rows. Null evidence is allowed only where the existing command allows it.
  const validEvidence = (id: number | null, controlId: number | null, verifier: string | null) => id === null || (activeControl(controlId) && (evidence.get(id) ?? []).some(e =>
    e.control_id === controlId && e.is_current && !!e.uploaded_by && e.uploaded_by !== verifier &&
    (!e.valid_until || e.valid_until >= today) && ['accepted', 'approved'].includes(e.status) &&
    activeControl(e.source_control_id) && (e.source_control_id === controlId || approvedMappings.has(`${e.source_control_id}:${controlId}`))));
  const add = (item: ReviewWorkItem) => { const category = categories.find(c => c.type === item.type)!; if (category.status === 'ready') category.items.push(item); };
  const base = (type: WorkType, id: number, title: string, state: string, controlId: number | null, assignee: string | null, dueDate: string | null): ReviewWorkItem => ({
    key: `${type}:${id}`, type, sourceId: id, sourceModel: 'grc_findings', ...controlContext(controlId),
    itemId: null, cycleId: null, title, state, assignee, dueDate,
    responsibility: assignee ? 'assigned' : 'independent_team',
    sourceRoute: '', returnContext: 'review', actionLabel: '', reason: '',
  });
  for (const e of snapshot.evidence) {
    if (!activeControl(e.control_id) || !e.is_current || !['pending_review', 'under_review'].includes(e.status) || !e.uploaded_by || e.uploaded_by === actor.id || (e.assigned_reviewer && e.assigned_reviewer !== actor.id)) continue;
    // Shared review also obeys the assigned reviewer on every open target cycle.
    if (e.link_id && snapshot.periodic.some(c => c.control_id === e.control_id && c.status === 'open' && c.reviewer_id !== actor.id)) continue;
    const item = base('EVIDENCE_REVIEW', e.id, e.evidence_name || e.file_name || `دليل #${e.id}`, e.status, e.control_id, e.assigned_reviewer, null);
    item.key += `:${e.link_id ?? 'direct'}`;
    item.sourceModel = 'evidence';
    item.sourceRoute = certificationMode ? '/review/qa-certification' : `/review?evidence=${e.id}${e.link_id ? `&link=${e.link_id}` : ''}`;
    item.actionLabel = 'فتح مراجعة الدليل';
    item.reason = e.assigned_reviewer ? 'أنت المراجع المكلّف، ولست مقدم الدليل.' : 'دليل غير مسند؛ متاح لمراجع مستقل مخول.';
    add(item);
  }
  if (certificationMode) return categories.map(category => category.type === 'EVIDENCE_REVIEW'
    ? category : { ...category, status: 'ready', error: null, items: [] });
  const cycleItems = new Map<number, AssessmentItem[]>();
  for (const item of snapshot.items) cycleItems.set(item.cycle_id, [...(cycleItems.get(item.cycle_id) ?? []), item]);
  const links = new Map<number, number[]>();
  for (const link of snapshot.itemLinks) links.set(link.item_id, [...(links.get(link.item_id) ?? []), link.evidence_id]);
  for (const cycle of snapshot.cycles) {
    if (!activeFramework(cycle.framework_id)) continue;
    const code = framework(cycle.framework_id)!.code;
    const scoring = (cycleItems.get(cycle.id) ?? []).filter(i => i.is_scoring);
    const cycleRoute = assessmentItemHref(code, cycle.id, null, 'from=review');
    if (!cycleRoute) continue;
    for (const item of cycleItems.get(cycle.id) ?? []) {
      if (cycle.status !== 'under_review' || cycle.reviewer_id !== actor.id || cycle.assessor_id === actor.id || !activeControl(item.control_id) || item.review_status === 'accepted') continue;
      const work = base('ASSESSMENT_ITEM_REVIEW', item.id, item.title_ar, item.review_status, item.control_id, cycle.reviewer_id, cycle.due_date);
      work.sourceModel = 'assessment_items'; work.cycleId = cycle.id; work.itemId = item.id;
      work.sourceRoute = assessmentItemHref(code, cycle.id, item.id, 'from=review')!;
      work.actionLabel = 'مراجعة البند'; work.reason = `أنت مراجع دورة #${cycle.id} المستقل عن المقيم.`; add(work);
    }
    const ready = scoring.length > 0 && scoring.every(i => !itemNeedsInput(i) && i.review_status === 'accepted' &&
      (!['implemented', 'partially_implemented'].includes(i.compliance_status ?? '') || (links.get(i.id) ?? []).some(id => validEvidence(id, i.control_id, cycle.reviewer_id))));
    const type = cycle.status === 'under_review' && cycle.reviewer_id === actor.id && cycle.assessor_id !== actor.id ? 'ASSESSMENT_REVIEW_COMPLETION' :
      cycle.status === 'completed' && cycle.approver_id === actor.id && cycle.assessor_id !== actor.id ? 'ASSESSMENT_APPROVAL' : null;
    if (!type || !ready) continue;
    const work = base(type, cycle.id, `دورة #${cycle.id} — ${cycle.scope_name}`, cycle.status, null, actor.id, cycle.due_date);
    work.framework = code; work.cycleId = cycle.id; work.sourceModel = 'assessment_cycles'; work.sourceRoute = cycleRoute;
    work.actionLabel = type === 'ASSESSMENT_APPROVAL' ? 'فتح قرار الاعتماد' : 'إنهاء مراجعة الدورة';
    work.reason = type === 'ASSESSMENT_APPROVAL' ? 'أنت المعتمد المكلّف؛ مراجعة البنود مكتملة.' : 'أنت المراجع المكلّف؛ البنود جاهزة لإنهاء المراجعة.'; add(work);
  }
  const findingActions = new Map<number, CorrectiveAction[]>();
  for (const action of snapshot.actions) findingActions.set(action.finding_id, [...(findingActions.get(action.finding_id) ?? []), action]);
  // ONLY grc_findings. Legacy assessment_findings are deliberately not loaded,
  // merged or inferred from item outcomes (see findings compatibility contract).
  for (const finding of snapshot.findings) {
    if (finding.status !== 'pending_verification' || finding.source_type === 'internal_audit' ||
      (finding.framework_id !== null && !activeFramework(finding.framework_id)) || (finding.control_id !== null && !activeControl(finding.control_id))) continue;
    const actions = findingActions.get(finding.id) ?? [];
    const route = new URLSearchParams({ finding: String(finding.id) });
    const code = finding.framework_id !== null ? framework(finding.framework_id)?.code : null;
    if (code) route.set('framework', code);
    const findingBase = (type: WorkType, id: number, title: string, state: string, assignee: string | null, due: string | null) => {
      const work = base(type, id, title, state, finding.control_id, assignee, due);
      work.framework = code ?? work.framework; work.itemId = finding.assessment_item_id; work.cycleId = finding.assessment_cycle_id;
      work.sourceRoute = `/findings?${route}`; return work;
    };
    for (const action of actions) {
      if (action.status !== 'completed' || action.verification_status !== 'pending' || action.owner_id === actor.id || action.completed_by === actor.id || finding.created_by === actor.id) continue;
      const work = findingBase('CORRECTIVE_ACTION_VERIFICATION', action.id, `${finding.reference_code} — ${action.title}`, action.verification_status, null, action.due_date);
      work.sourceModel = 'grc_corrective_actions'; work.sourceRoute += `&action=${action.id}`;
      work.actionLabel = 'فتح تحقق الإجراء'; work.reason = validEvidence(action.verification_evidence_id, finding.control_id, actor.id) ? 'إجراء مكتمل؛ أنت مخول بالتحقق ومستقل عن المنشئ والمالك والمنفذ.' : 'دليل الإجراء يحتاج استكمالًا؛ القرار المستقل داخل مساحة الإجراء.'; add(work);
    }
    const independent = finding.created_by !== actor.id && finding.owner_id !== actor.id && !actions.some(a => a.owner_id === actor.id || a.completed_by === actor.id);
    const actionsAccepted = actions.every(a => a.status === 'completed' && a.verification_status === 'accepted');
    if (finding.verification_status === 'pending' && independent && actionsAccepted) {
      const work = findingBase('FINDING_VERIFICATION', finding.id, `${finding.reference_code} — ${finding.title}`, finding.verification_status, null, finding.due_date);
      work.actionLabel = 'فتح تحقق الملاحظة'; work.reason = 'الإجراءات مقبولة؛ متاح لفريق تحقق مستقل، وليس تكليفًا شخصيًا.'; add(work);
    }
    if (finding.verification_status === 'accepted' && finding.verified_by === actor.id && actionsAccepted &&
      validEvidence(finding.verification_evidence_id, finding.control_id, actor.id) && actions.every(a => validEvidence(a.verification_evidence_id, finding.control_id, actor.id))) {
      const work = findingBase('FINDING_CLOSURE', finding.id, `${finding.reference_code} — ${finding.title}`, finding.verification_status, finding.verified_by, finding.due_date);
      work.actionLabel = 'فتح قرار الإغلاق'; work.reason = 'أنت المتحقق المسجل؛ الإغلاق يتطلب قرارًا صريحًا منفصلًا.'; add(work);
    }
  }
  for (const cycle of snapshot.periodic) {
    if (cycle.status !== 'open' || !cycle.due_date || cycle.due_date > today || cycle.reviewer_id !== actor.id || cycle.owner_id === actor.id || !activeControl(cycle.control_id)) continue;
    const work = base('PERIODIC_REVIEW_FOLLOWUP', cycle.id, `مراجعة دورية #${cycle.id}`, cycle.status, cycle.control_id, cycle.reviewer_id, cycle.due_date);
    work.sourceModel = 'control_review_cycles'; work.cycleId = cycle.id;
    work.sourceRoute = `/controls/${cycle.control_id}?tab=overview&review_cycle=${cycle.id}`;
    work.actionLabel = 'متابعة المراجعة الدورية'; work.reason = 'أنت مراجع الدورة المستحقة؛ استكمال الطلبات والقرار داخل Control 360.'; add(work);
  }
  return categories;
}

export function sortReviewWork(items: ReviewWorkItem[], today: string) {
  return [...items].sort((a, b) => Number(!!b.dueDate && b.dueDate < today) - Number(!!a.dueDate && a.dueDate < today) ||
    (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || a.type.localeCompare(b.type) || a.sourceId - b.sourceId || a.key.localeCompare(b.key));
}
export function filterReviewWork(items: ReviewWorkItem[], raw: string, today: string) {
  const params = reviewFilters(raw);
  return items.filter(item => (!params.has('type') || params.get('type') === item.type) &&
    (!params.has('framework') || params.get('framework') === item.framework) &&
    (!params.has('responsibility') || params.get('responsibility') === item.responsibility) &&
    (!params.has('state') || params.get('state') === item.state) &&
    (!params.has('due') || (params.get('due') === 'undated' ? !item.dueDate : !!item.dueDate &&
      (params.get('due') === 'overdue' ? item.dueDate < today : params.get('due') === 'today' ? item.dueDate === today : item.dueDate > today))));
}
export function reviewWorkPage(items: ReviewWorkItem[], page: number, pageSize = 15) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize)), current = Math.max(1, Math.min(Number.isSafeInteger(page) ? page : 1, pages));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pages };
}
export function reviewWorkSummary(categories: CategoryResult[], today: string) {
  const count = (types: WorkType[]) => types.some(type => categories.find(c => c.type === type)?.status !== 'ready') ? null :
    categories.filter(c => types.includes(c.type)).reduce((total, c) => total + c.items.length, 0);
  return {
    review: count(['EVIDENCE_REVIEW', 'ASSESSMENT_ITEM_REVIEW', 'ASSESSMENT_REVIEW_COMPLETION']),
    approval: count(['ASSESSMENT_APPROVAL']),
    verification: count(['CORRECTIVE_ACTION_VERIFICATION', 'FINDING_VERIFICATION']),
    closure: count(['FINDING_CLOSURE']),
    overdue: categories.some(c => c.status !== 'ready') ? null : categories.flatMap(c => c.items).filter(i => i.dueDate && i.dueDate < today).length,
  };
}

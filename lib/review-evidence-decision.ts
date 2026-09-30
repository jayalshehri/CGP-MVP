import { requireProfile } from './auth';
import { supabase } from './supabase';
import { todayRiyadh, type EvidenceRecord } from './grc';
import { isReviewTeam, type ReviewActor, type ReviewWorkItem } from './review-work-queue';
import { canOfferInlineEvidence } from './review-decision-safety';
import { loadReviewEvidenceContext, type ReviewEvidenceControl } from './review-work-queue-read';
import { QA_CERTIFICATION_CONTROL } from './qa-review-certification';

export const evidenceDecisionLabels = { accepted: 'قبول الدليل', changes_requested: 'طلب استكمال', rejected: 'رفض الدليل' } as const;
export type EvidenceDecision = keyof typeof evidenceDecisionLabels;
export type DecisionFailureKind = 'authorization' | 'sod' | 'stale' | 'validation' | 'network' | 'backend';
export type DecisionFailure = { kind: DecisionFailureKind; message: string; refresh: boolean };
export type EvidenceReviewMaterial = { record: EvidenceRecord; control: ReviewEvidenceControl };
export type DecisionResult = { ok: true } | { ok: false; failure: DecisionFailure };
export type EvidenceDecisionDependencies = {
  actor: () => Promise<ReviewActor>;
  material: (id: number) => Promise<EvidenceReviewMaterial | null>;
  execute: (id: number, decision: EvidenceDecision, reason: string) => Promise<{ error: unknown }>;
  today: () => string;
};
const failureMessages: Record<DecisionFailureKind, string> = {
  authorization: 'لم يعد القرار متاحًا لك وفق الصلاحيات أو التكليف. افتح السجل أو حدّث القائمة.',
  sod: 'لا يمكنك مراجعة دليل قدمته بنفسك، حتى بصلاحية الإدارة. يلزم مراجع مستقل.',
  stale: 'تغير الدليل أو الإصدار أو التكليف منذ عرضه. لم يُحفظ قرار جديد؛ حدّث السياق ثم راجعه من جديد.',
  validation: 'أكمل القرار وسببه والاطلاع على الإصدار المعروض. لا يمكن قبول دليل منتهي الصلاحية.',
  network: 'تعذر تأكيد القرار بسبب الاتصال. افتح السجل وحدّثه قبل أي إعادة؛ لن نحاول تلقائيًا.',
  backend: 'لم يؤكد النظام حفظ القرار. افتح السجل وحدّثه قبل أي إعادة؛ لا تعرض القائمة هذا القرار كنجاح.',
};
export function decisionFailure(kind: DecisionFailureKind): DecisionFailure {
  return { kind, message: failureMessages[kind], refresh: kind !== 'validation' };
}
export function sanitizeDecisionError(error: unknown): DecisionFailure {
  if (error && typeof error === 'object' && 'kind' in error && Object.hasOwn(failureMessages, String(error.kind))) return decisionFailure(error.kind as DecisionFailureKind);
  const value = error && typeof error === 'object' ? error as { code?: string; message?: string } : {};
  const message = value.message ?? (error instanceof Error ? error.message : '');
  if (value.code === '40001' || value.code === '409' || /no longer pending|not found|refresh the page/i.test(message)) return decisionFailure('stale');
  if (/self.review|separation of duties|own evidence/i.test(message)) return decisionFailure('sod');
  if (value.code === '42501' || value.code === 'PGRST301' || value.code === 'PGRST302') return decisionFailure('authorization');
  if (value.code === '22023' || /reason required|expired|invalid decision/i.test(message)) return decisionFailure('validation');
  if (/fetch|network|timeout|connection|failed to reach/i.test(message) || value.code?.startsWith('08') || value.code === '57014') return decisionFailure('network');
  return decisionFailure('backend');
}
export function evidenceMaterialFingerprint({ record: e, control: c }: EvidenceReviewMaterial) {
  return JSON.stringify([e.id, e.control_id, e.source_control_id, e.link_id, e.evidence_group, e.version_number,
    e.file_path, e.file_name, e.evidence_name, e.description, e.uploaded_at, e.uploaded_by, e.is_current,
    e.status, e.assigned_reviewer, e.valid_until, c.id, c.framework_id, c.control_code, c.title_ar,
    c.description_ar, c.frameworks.code, c.frameworks.version, c.frameworks.is_active]);
}
export function materialFailure(material: EvidenceReviewMaterial, actor: ReviewActor, certificationMode = false): DecisionFailure | null {
  const { record: e, control: c } = material;
  if (!isReviewTeam(actor.role)) return decisionFailure('authorization');
  if (e.uploaded_by === actor.id) return decisionFailure('sod');
  if (!e.uploaded_by || (e.assigned_reviewer && e.assigned_reviewer !== actor.id)) return decisionFailure('authorization');
  if (!e.is_current || !['pending_review', 'under_review'].includes(e.status)) return decisionFailure('stale');
  const permittedFramework = certificationMode
    ? c.frameworks.code === 'QA_SYNTH' && c.control_code === QA_CERTIFICATION_CONTROL
    : c.frameworks.code !== 'QA_SYNTH';
  if (e.link_id !== null || e.source_control_id !== e.control_id || c.id !== e.control_id || !c.frameworks.is_active || !permittedFramework || !e.file_path || !e.file_name || !c.title_ar) return decisionFailure('validation');
  return null;
}
const defaultDependencies: EvidenceDecisionDependencies = {
  actor: async () => { const { user, profile } = await requireProfile(['admin', 'cybersecurity_team']); return { id: user.id, role: profile.role }; },
  material: async id => {
    const context = await loadReviewEvidenceContext(id, null);
    if (context.rows.length !== 1) return null;
    const record = context.rows[0], control = context.controls.find(c => c.id === record.control_id);
    return control ? { record, control } : null;
  },
  // Exact existing audited command. No claim, direct write, or replacement RPC.
  execute: async (id, decision, reason) => supabase.rpc('cgp_review_evidence', { p_evidence_id: id, p_decision: decision, p_notes: reason }),
  today: todayRiyadh,
};
function certificationDependencies(certificationMode: boolean): EvidenceDecisionDependencies {
  if (!certificationMode) return defaultDependencies;
  return { ...defaultDependencies, material: async id => {
    const context = await loadReviewEvidenceContext(id, null, true);
    if (context.rows.length !== 1) return null;
    const record = context.rows[0], control = context.controls.find(c => c.id === record.control_id);
    return control ? { record, control } : null;
  } };
}
export async function loadInlineEvidenceMaterial(work: ReviewWorkItem, actor: ReviewActor, deps = defaultDependencies, certificationMode = false) {
  if (!canOfferInlineEvidence(work, actor.role)) throw decisionFailure('authorization');
  let freshActor: ReviewActor;
  try { freshActor = await deps.actor(); } catch (error) { const failure = sanitizeDecisionError(error); throw failure.kind === 'backend' ? decisionFailure('authorization') : failure; }
  if (freshActor.id !== actor.id || !isReviewTeam(freshActor.role)) throw decisionFailure('authorization');
  const material = await (certificationMode && deps === defaultDependencies ? certificationDependencies(true) : deps).material(work.sourceId);
  if (!material || material.record.control_id !== work.controlId || material.record.id !== work.sourceId || material.control.frameworks.code !== work.framework || material.record.status !== work.state || material.record.assigned_reviewer !== work.assignee) throw decisionFailure('stale');
  const invalid = materialFailure(material, freshActor, certificationMode);
  if (invalid) throw invalid;
  return material;
}
export async function submitInlineEvidenceDecision(expected: EvidenceReviewMaterial, actor: ReviewActor, decision: EvidenceDecision, reason: string, inspected: boolean, deps = defaultDependencies, certificationMode = false): Promise<DecisionResult> {
  if (!Object.hasOwn(evidenceDecisionLabels, decision) || !reason.trim() || !inspected) return { ok: false, failure: decisionFailure('validation') };
  const invalid = materialFailure(expected, actor, certificationMode);
  if (invalid) return { ok: false, failure: invalid };
  let freshActor: ReviewActor;
  try { freshActor = await deps.actor(); } catch (error) { const failure = sanitizeDecisionError(error); return { ok: false, failure: failure.kind === 'backend' ? decisionFailure('authorization') : failure }; }
  if (freshActor.id !== actor.id || !isReviewTeam(freshActor.role)) return { ok: false, failure: decisionFailure('authorization') };
  try {
    const current = await (certificationMode && deps === defaultDependencies ? certificationDependencies(true) : deps).material(expected.record.id);
    if (!current || evidenceMaterialFingerprint(current) !== evidenceMaterialFingerprint(expected)) return { ok: false, failure: decisionFailure('stale') };
    const currentFailure = materialFailure(current, freshActor, certificationMode);
    if (currentFailure) return { ok: false, failure: currentFailure };
    if (decision === 'accepted' && current.record.valid_until && current.record.valid_until < deps.today()) return { ok: false, failure: decisionFailure('validation') };
    // The RPC locks/rechecks pending/currentness; the trigger rechecks active
    // role, assignment, independence, reason and expiry. Never auto-retry.
    const result = await deps.execute(current.record.id, decision, reason.trim());
    return result.error ? { ok: false, failure: sanitizeDecisionError(result.error) } : { ok: true };
  } catch (error) { return { ok: false, failure: sanitizeDecisionError(error) }; }
}

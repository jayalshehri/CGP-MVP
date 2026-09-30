import { supabase } from './supabase';
import { cycleColumns } from './assessment';
import type { AssessmentItem } from './assessment';
import type { SharedFinding, CorrectiveAction } from './findings';
import type { EvidenceRecord, ReviewCycle } from './grc';
import { isReviewTeam, type ReadSource, type ReviewActor, type ReviewControl, type ReviewCycleRecord, type ReviewFramework, type ReviewMapping, type ReviewPerson, type ReviewSnapshot } from './review-work-queue';
import { QA_CERTIFICATION_CONTROL } from './qa-review-certification';

type ReadResult = { data: unknown; error: unknown; count?: number | null };
// Exact count detects silent truncation even when the server row cap is below
// the requested page size. Advance by actual rows, never by an assumed cap.
export async function readReviewPages<T>(query: (from: number, to: number) => PromiseLike<ReadResult>): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (;;) {
    const result = await query(rows.length, rows.length + 499);
    if (result.error) throw result.error;
    if (result.count == null || !Number.isSafeInteger(result.count) || result.count < 0 || !Array.isArray(result.data)) throw new Error('لم يتوفر إجمالي القراءة؛ لا يمكن إثبات اكتمال القائمة.');
    if (expected !== null && expected !== result.count) throw new Error('تغيرت القائمة أثناء القراءة؛ أعد تحميلها.');
    expected = result.count;
    if (!result.data.length && rows.length < result.count) throw new Error('قراءة غير مكتملة؛ أعد تحميل القائمة.');
    rows.push(...result.data as T[]);
    if (rows.length >= result.count) return rows;
  }
}
export async function readReviewBatches<T>(ids: number[], query: (ids: number[], from: number, to: number) => PromiseLike<ReadResult>) {
  const rows: T[] = [], unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 200) {
    rows.push(...await readReviewPages<T>((from, to) => query(unique.slice(offset, offset + 200), from, to)));
  }
  return rows;
}
const emptySnapshot = (): ReviewSnapshot => ({ frameworks: [], controls: [], evidence: [], cycles: [], items: [], itemLinks: [], mappings: [], findings: [], actions: [], periodic: [], people: [], errors: {} });
const itemColumns = 'id,cycle_id,control_id,control_code,title_ar,description_ar,domain_ar,subdomain_code,is_scoring,compliance_status,notes,owner_id,expected_compliance_date,corrective_action,review_status,revision';
const sourceLabels: Record<ReadSource, string> = { frameworks: 'الأطر', controls: 'الضوابط', evidence: 'سجل الأدلة', cycles: 'دورات التقييم', items: 'بنود التقييم', itemLinks: 'ارتباطات أدلة التقييم', mappings: 'المواءمات المعتمدة', findings: 'الملاحظات المشتركة', actions: 'الإجراءات التصحيحية', periodic: 'المراجعات الدورية', people: 'أسماء المسؤولين' };
export type ReviewEvidenceControl = ReviewControl & { description_ar: string | null; frameworks: ReviewFramework & { name_ar: string; version: string } };
export async function loadReviewWorkSnapshot(actor: ReviewActor): Promise<ReviewSnapshot> {
  // No queries for excluded roles. UI checks do not broaden the /review gate.
  const snapshot = emptySnapshot();
  if (!isReviewTeam(actor.role)) throw new Error('المراجعة والقرارات متاحة للفريق المخول فقط.');
  async function capture<T>(source: ReadSource, query: () => Promise<T[]>) {
    try { return await query(); } catch { snapshot.errors[source] = `تعذر تحميل ${sourceLabels[source]} ضمن صلاحياتك؛ مؤشرات الفئات المرتبطة غير متاحة.`; return []; }
  }
  const [frameworks, controls, evidence, cycles, mappings, findings, periodic, people] = await Promise.all([
    capture('frameworks', () => readReviewPages<ReviewFramework>((from, to) => supabase.from('frameworks').select('id,code,is_active', { count: 'exact' }).order('id').range(from, to))),
    capture('controls', () => readReviewPages<ReviewControl>((from, to) => supabase.from('controls').select('id,framework_id,control_code,title_ar', { count: 'exact' }).order('id').range(from, to))),
    capture('evidence', () => readReviewPages<EvidenceRecord>((from, to) => supabase.rpc('grc_evidence_register', {}, { count: 'exact' }).select('*').eq('is_current', true).order('id').order('control_id').order('link_id', { nullsFirst: true }).range(from, to))),
    capture('cycles', () => readReviewPages<ReviewCycleRecord>((from, to) => supabase.from('assessment_cycles').select(cycleColumns, { count: 'exact' })
      .in('status', ['under_review', 'completed']).or(`reviewer_id.eq.${actor.id},approver_id.eq.${actor.id}`).order('id').range(from, to))),
    capture('mappings', () => readReviewPages<ReviewMapping>((from, to) => supabase.rpc('cgp_crosswalk', {}, { count: 'exact' }).select('id,source_id,target_id,validation_status').eq('validation_status', 'approved').order('id').range(from, to))),
    capture('findings', () => readReviewPages<SharedFinding>((from, to) => supabase.from('grc_findings').select('*', { count: 'exact' }).eq('status', 'pending_verification').order('id').range(from, to))),
    capture('periodic', () => readReviewPages<ReviewCycle>((from, to) => supabase.from('control_review_cycles').select('id,control_id,owner_id,reviewer_id,due_date,status,frequency,completed_at,notes', { count: 'exact' }).eq('status', 'open').order('id').range(from, to))),
    capture('people', () => readReviewPages<ReviewPerson>((from, to) => supabase.from('profiles').select('user_id,display_name', { count: 'exact' }).eq('is_active', true).order('user_id').range(from, to))),
  ]);
  Object.assign(snapshot, { frameworks, controls, evidence, cycles, mappings, findings, periodic, people });
  const [items, actions] = await Promise.all([
    capture('items', () => readReviewBatches<AssessmentItem>(cycles.map(c => c.id), (ids, from, to) => supabase.from('assessment_items').select(itemColumns, { count: 'exact' }).in('cycle_id', ids).order('id').range(from, to))),
    capture('actions', () => readReviewBatches<CorrectiveAction>(findings.map(f => f.id), (ids, from, to) => supabase.from('grc_corrective_actions').select('*', { count: 'exact' }).in('finding_id', ids).order('id').range(from, to))),
  ]);
  snapshot.items = items; snapshot.actions = actions;
  snapshot.itemLinks = await capture('itemLinks', () => readReviewBatches<{ item_id: number; evidence_id: number }>(items.filter(i => i.is_scoring).map(i => i.id),
    (ids, from, to) => supabase.from('assessment_item_evidence').select('item_id,evidence_id', { count: 'exact' }).in('item_id', ids).order('item_id').order('evidence_id').range(from, to)));
  return snapshot;
}

// Both the record workspace and context-verified inline dialog use the same
// authorized register. Mutation handlers remain in the existing audited RPC.
export async function loadReviewEvidenceContext(id: number | null, linkId: number | null, certificationMode = false) {
  const rows = await readReviewPages<EvidenceRecord>((from, to) => {
    let query = supabase.rpc('grc_evidence_register', {}, { count: 'exact' }).select('*').order('id').order('control_id').order('link_id', { nullsFirst: true });
    if (id !== null) query = query.eq('id', id);
    if (id !== null) query = linkId === null ? query.is('link_id', null) : query.eq('link_id', linkId);
    return query.range(from, to);
  });
  const controls = await readReviewBatches<ReviewEvidenceControl>(rows.map(e => e.control_id), (ids, from, to) => supabase.from('controls')
    .select('id,framework_id,control_code,title_ar,description_ar,frameworks!inner(id,code,name_ar,version,is_active)', { count: 'exact' }).in('id', ids).order('id').range(from, to));
  const allowed = new Set(controls.filter(c => c.frameworks.is_active && (certificationMode
    ? c.frameworks.code === 'QA_SYNTH' && c.control_code === QA_CERTIFICATION_CONTROL
    : c.frameworks.code !== 'QA_SYNTH')).map(c => c.id));
  return { rows: rows.filter(e => allowed.has(e.control_id)), controls };
}

// Evidence decisions can affect assessment/finding readiness as well as the
// evidence category. Refresh the shared input, then rebuild dependent projections.
// No per-row reads and no unrelated assessment/finding reloads.
export async function refreshReviewEvidenceSnapshot(previous: ReviewSnapshot, actor: ReviewActor): Promise<ReviewSnapshot> {
  if (!isReviewTeam(actor.role)) throw new Error('Reviewer role required');
  const next = { ...previous, errors: { ...previous.errors } };
  try {
    next.evidence = await readReviewPages<EvidenceRecord>((from, to) => supabase.rpc('grc_evidence_register', {}, { count: 'exact' }).select('*')
      .eq('is_current', true).order('id').order('control_id').order('link_id', { nullsFirst: true }).range(from, to));
    delete next.errors.evidence;
  } catch { next.evidence = []; next.errors.evidence = 'تعذر تحديث الأدلة؛ المؤشرات المرتبطة غير متاحة. افتح السجل قبل أي إعادة للقرار.'; }
  return next;
}

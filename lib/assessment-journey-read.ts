import { supabase } from './supabase';
import { cycleColumns, type AssessmentCycle, type AssessmentFinding, type AssessmentItem } from './assessment';
import { loadEligibleFrameworkEvidence } from './framework-evidence';

export type ItemEvidenceLink = { item_id: number; evidence_id: number };
export type ItemFindingSummary = { id: number; assessment_item_id: number; status: string };
export type LinkedEvidence = { id: number; file_name: string; evidence_name: string | null; version_number: number; is_current: boolean; status: string; valid_until: string | null };
async function pages<T>(query: (from: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await query(from);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []) as T[]);
    if ((result.data ?? []).length < 500) return rows;
  }
}
export function loadFrameworkCycles(frameworkId: number) {
  return pages<AssessmentCycle>(from => supabase.from('assessment_cycles').select(cycleColumns)
    .eq('framework_id', frameworkId).order('id', { ascending: false }).range(from, from + 499));
}
export async function loadAssessmentCycle(cycleId: number) {
  const [items, sharedFindings] = await Promise.all([
    pages<AssessmentItem>(from => supabase.from('assessment_items').select('*').eq('cycle_id', cycleId).order('id').range(from, from + 499)),
    pages<ItemFindingSummary>(from => supabase.from('grc_findings').select('id,assessment_item_id,status').eq('assessment_cycle_id', cycleId).order('id').range(from, from + 499)),
  ]);
  const links: ItemEvidenceLink[] = [], findings: AssessmentFinding[] = [];
  for (let offset = 0; offset < items.length; offset += 200) {
    const ids = items.slice(offset, offset + 200).map(item => item.id);
    const [l, f] = await Promise.all([
      pages<ItemEvidenceLink>(from => supabase.from('assessment_item_evidence').select('item_id,evidence_id').in('item_id', ids).order('item_id').order('evidence_id').range(from, from + 499)),
      pages<AssessmentFinding>(from => supabase.from('assessment_findings').select('*').in('item_id', ids).order('id').range(from, from + 499)),
    ]);
    links.push(...l); findings.push(...f);
  }
  return { items, links, findings, sharedFindings };
}
export async function loadAssessmentItemContext(code: string, controlId: number, evidenceIds: number[]) {
  const [eligible, control, linked] = await Promise.all([
    loadEligibleFrameworkEvidence(code, controlId),
    supabase.from('controls').select('id,official_text_ar').eq('id', controlId).single(),
    evidenceIds.length ? supabase.from('evidence').select('id,file_name,evidence_name,version_number,is_current,status,valid_until').in('id', evidenceIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (control.error || linked.error) throw control.error || linked.error;
  return { eligible, officialText: control.data?.official_text_ar as string | null, linked: (linked.data ?? []) as LinkedEvidence[] };
}
export type ReviewAssessmentItem = { id: number; cycle_id: number; control_code: string; title_ar: string; review_status: string; cycle: { scope_name: string; framework: { code: string } } };
export async function loadAssessmentReviewQueue(actor: string) {
  // Only assigned, live review cycles. No snapshots or global item register.
  return pages<ReviewAssessmentItem>(from => supabase.from('assessment_items')
    .select('id,cycle_id,control_code,title_ar,review_status,cycle:assessment_cycles!cycle_id!inner(scope_name,status,reviewer_id,framework:frameworks!framework_id(code))')
    .eq('cycle.status', 'under_review').eq('cycle.reviewer_id', actor).order('id').range(from, from + 499));
}

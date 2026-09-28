import type { AssessmentCycle, AssessmentItem } from './assessment';
import { assessmentHrefFor } from './compliance-frameworks';
import { myControlsFilters } from './my-controls-context';

// Presentation/context only. Validation and all transitions remain in the RPC.
export const journeyKeys = ['cycle', 'item', 'q', 'domain', 'result', 'review', 'evidence', 'attention', 'page', 'from'] as const;
export function assessmentContext(raw: string) {
  const source = new URLSearchParams(raw), safe = new URLSearchParams();
  for (const key of journeyKeys) {
    const value = source.get(key);
    if (!value) continue;
    if (['cycle', 'item', 'page'].includes(key) && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)) continue;
    if (key === 'from' && !['review', 'my-controls'].includes(value)) continue;
    safe.set(key, value.slice(0, 300));
  }
  if (safe.get('from') === 'my-controls') safe.set('my_context', myControlsFilters(source.get('my_context') ?? '').toString());
  return safe;
}
export function assessmentItemHref(code: string, cycle: number, item: number | null, context = '') {
  const route = assessmentHrefFor(code);
  if (!route) return null;
  const params = assessmentContext(context);
  params.set('cycle', String(cycle));
  if (item) params.set('item', String(item)); else params.delete('item');
  return `${route}?${params}`;
}
export function itemNeedsInput(item: AssessmentItem) {
  return !item.compliance_status || !item.notes?.trim() ||
    (['partially_implemented', 'not_implemented'].includes(item.compliance_status) &&
      (!item.owner_id || !item.expected_compliance_date || !item.corrective_action?.trim()));
}
export function filterAssessmentItems(items: AssessmentItem[], params: URLSearchParams, evidenceCounts: Map<number, number>, openFindingItems: Set<number>) {
  const q = (params.get('q') ?? '').trim().toLocaleLowerCase();
  return items.filter(item =>
    (!q || `${item.control_code} ${item.title_ar} ${item.description_ar ?? ''}`.toLocaleLowerCase().includes(q)) &&
    (!params.get('domain') || item.domain_ar === params.get('domain')) &&
    (!params.get('result') || (params.get('result') === 'unassessed' ? !item.compliance_status : item.compliance_status === params.get('result'))) &&
    (!params.get('review') || item.review_status === params.get('review')) &&
    (!params.get('evidence') || (params.get('evidence') === 'linked' ? (evidenceCounts.get(item.id) ?? 0) > 0 : (evidenceCounts.get(item.id) ?? 0) === 0)) &&
    (!params.get('attention') || (params.get('attention') === 'findings' ? openFindingItems.has(item.id) : itemNeedsInput(item) || item.review_status === 'changes_requested')));
}
export function cycleActions(cycle: AssessmentCycle, actor: string, role: string): [string, string][] {
  if (!['admin', 'cybersecurity_team'].includes(role)) return [];
  const actions: Record<string, [string, string][]> = {
    draft: [['start', 'بدء التقييم']],
    in_progress: [['submit', 'إرسال للمراجعة'], ['collect', 'جمع الأدلة']],
    evidence_collection: [['submit', 'إرسال للمراجعة']],
    under_review: [['complete', 'إكمال المراجعة'], ['return', 'إعادة للاستكمال']],
    completed: [['approve', 'اعتماد النسخة'], ['return', 'إعادة للمراجعة والاستكمال']],
    approved: [['close', 'إغلاق الدورة'], ['reassess', 'إنشاء إعادة تقييم']],
    closed: [['reassess', 'إنشاء إعادة تقييم']],
  };
  return (actions[cycle.status] ?? []).filter(([action]) => action === 'reassess' ||
    (['start', 'collect', 'submit'].includes(action) ? actor === cycle.assessor_id :
      ['return', 'complete'].includes(action) ? actor === cycle.reviewer_id : actor === cycle.approver_id));
}

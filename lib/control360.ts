import type { UserRole } from './auth';

export const controlTabs = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'official', label: 'المتطلب الرسمي' },
  { key: 'evidence', label: 'الأدلة' },
  { key: 'assessment', label: 'التقييم' },
  { key: 'findings', label: 'الملاحظات والإجراءات' },
  { key: 'activity', label: 'النشاط' },
] as const;
export type ControlTab = typeof controlTabs[number]['key'];
export const positiveId = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// Preserve only the existing controls-list context, never an arbitrary return URL.
export function controlContext(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of ['domain', 'view', 'scope', 'status', 'assignment', 'q', 'from']) {
    const value = params.get(key);
    if (!value) continue;
    if (key === 'from' && value !== 'workspace') continue;
    if (key === 'view' && value !== 'followup') continue;
    if (key === 'scope' && !['provider', 'tenant'].includes(value)) continue;
    if (key === 'assignment' && !['assigned', 'unassigned'].includes(value)) continue;
    if (key === 'status' && !['implemented', 'in_progress', 'not_started', 'not_applicable'].includes(value)) continue;
    result.set(key, value);
  }
  return result;
}
export function controlHref(id: number, context: string, tab: ControlTab = 'overview'): string {
  const params = controlContext(new URLSearchParams(context));
  params.set('tab', tab);
  return `/controls/${id}?${params}`;
}
export function controlRegisterHref(register: 'evidence' | 'findings', framework: string, id: number, context: string): string {
  return `/${register}?${new URLSearchParams({ framework, control: String(id), from: 'control', return_context: controlContext(new URLSearchParams(context)).toString() })}`;
}
export function controlNextAction(role: UserRole | null, archived: boolean, assigned: boolean, evidenceStatus: string, eligibleCount: number | null): 'assign' | 'upload' | null {
  if (archived) return null;
  if (!assigned && (role === 'admin' || role === 'cybersecurity_team')) return 'assign';
  if (eligibleCount === 0 && evidenceStatus === 'not_uploaded' && ['admin', 'cybersecurity_team', 'control_owner'].includes(role ?? '')) return 'upload';
  return null;
}

export type ControlAuditEvent = {
  id: number; entity_type: string; action: string; actor_name: string | null; occurred_at: string;
  previous_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};
export function controlEventLabel(event: ControlAuditEvent): string {
  if (event.entity_type === 'controls' && event.action === 'update') {
    const changed = (key: string) => JSON.stringify(event.previous_data?.[key]) !== JSON.stringify(event.new_data?.[key]);
    const labels = [];
    if (changed('control_owner_id') || changed('control_owner')) labels.push('تغيير مالك الضابط');
    if (changed('implementation_status')) labels.push('تغيير حالة التطبيق');
    if (changed('due_date')) labels.push('تغيير موعد الاستحقاق');
    return labels.join(' · ') || 'تحديث بيانات الضابط';
  }
  const entities: Record<string, string> = {
    controls: 'الضابط', evidence: 'دليل', evidence_reviews: 'قرار مراجعة دليل',
    evidence_control_links: 'ربط دليل مشترك', evidence_control_link_reviews: 'قرار دليل مشترك',
    assessment_items: 'بند تقييم', assessment_item_evidence: 'أدلة بند تقييم',
    assessment_findings: 'فجوة تقييم سابقة', control_review_cycles: 'دورة مراجعة دورية',
    evidence_requests: 'طلب دليل', control_assessments: 'قرار مراجعة دورية',
    grc_findings: 'ملاحظة', grc_corrective_actions: 'إجراء تصحيحي',
    cybersecurity_requirement_controls: 'ربط متطلب بالضابط',
  };
  const actions: Record<string, string> = { insert: 'تسجيل', update: 'تحديث', delete: 'إزالة', close: 'إغلاق', approve: 'اعتماد' };
  return `${actions[event.action] ?? 'حدث'} ${entities[event.entity_type] ?? 'مرتبط بالضابط'}`;
}

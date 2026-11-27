import { formatRiyadhDateTime } from './dates';
import { positiveId } from './audit-schedule';
import { evidenceReviewHref } from './evidence-review';

export type AuditEvent = {
  id: number; control_id: number | null; entity_type: string; entity_id: string; action: string;
  actor_name: string | null; actor_id: string | null; occurred_at: string;
  previous_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
};
export type AuditControl = { id: number; control_code: string; title_ar: string };
export const entities:Record<string,string>={assessment_cycles:"دورة تقييم إطار",assessment_items:"نتيجة تقييم",assessment_item_evidence:"أدلة التقييم",assessment_findings:"فجوة ومعالجة",control_framework_links:"مواءمة الضوابط",controls:'الضابط',evidence:'الدليل',evidence_reviews:'قرار الدليل',evidence_control_links:'ربط دليل',evidence_control_link_reviews:'قرار دليل مشترك',control_review_cycles:'دورة المراجعة',evidence_requests:'طلب دليل',control_assessments:'تقييم الضابط',cybersecurity_projects:'مشروع سيبراني',cybersecurity_requirements:'متطلب سيبراني',cybersecurity_project_requirements:'ربط مشروع بمتطلب',portfolio_import_batches:"دفعة استيراد",portfolio_import_projects:"مشروع مستورد",portfolio_mapping_reviews:"مراجعة ربط",cybersecurity_requirement_controls:'ربط متطلب بضابط'};
export const actions:Record<string,string>={insert:'إنشاء',update:'تعديل',delete:'حذف',start:'بدء التقييم',collect:'جمع الأدلة',submit:'إرسال للمراجعة',return:'إعادة للاستكمال',complete:'إكمال المراجعة',approve:'اعتماد',close:'إغلاق'};
export const fields:Record<string,string>={control_code:'رمز الضابط',evidence_name:'اسم الدليل',file_name:'اسم الملف',completed_at:'وقت الإغلاق',frequency:'التكرار',cycle_id:'رقم الدورة',request_id:'رقم الطلب',actor_id:'المستخدم',status:'الحالة',implementation_status:'حالة التطبيق',verification_status:'حالة التحقق',evidence_status:'حالة الدليل',control_owner_id:'معرف المالك',control_owner:'مالك الضابط',due_date:'موعد الاستحقاق',next_audit_date:'المراجعة القادمة',last_audit_date:'آخر مراجعة',review_notes:'سبب القرار',notes:'الملاحظات',result:'نتيجة التقييم',rationale:'مبرر التقييم',is_current:'الإصدار الحالي',reviewer_id:'المراجع',assigned_reviewer:'المراجع المكلف',valid_until:'الصلاحية',requirement:'المطلوب',evidence_ids:'الأدلة الداعمة',project_code:'رمز المشروع',requirement_code:'رمز المتطلب',name_ar:'الاسم',title_ar:'العنوان',initiative_type:'نوع العمل',coverage_type:'نوع التغطية',mapping_confidence:'جودة الربط',mapping_status:'حالة الربط',superseded_at:'تاريخ الاستبدال',superseded_reason:'سبب الاستبدال',supersedes_mapping_id:'الربط السابق',project_id:'المشروع',requirement_id:'المتطلب',control_id:'الضابط',planned_year:'السنة',planned_quarter:'الربع',priority:'الأولوية',executive_owner:'المالك التنفيذي',progress_percent:'نسبة الإنجاز',portfolio_priority:'الأولوية (P1/P2/P3)',execution_year:'سنة التنفيذ',work_type:'نوع العمل (المحفظة)',executive_owner_code:'المالك التنفيذي (الجهة)',executive_owner_other:'المالك التنفيذي (أخرى)',duration_value:'مدة المشروع',duration_unit:'وحدة المدة',archived_at:'تاريخ الأرشفة',archived_by:'من نفّذ الأرشفة',archive_reason:'سبب الأرشفة'};

export function changed(row: AuditEvent) {
  return Object.keys({ ...row.previous_data, ...row.new_data })
    .filter(key => JSON.stringify(row.previous_data?.[key]) !== JSON.stringify(row.new_data?.[key]));
}

const statuses: Record<string, string> = {
  open: 'مفتوحة', submitted: 'مقدّم للمراجعة', pending_review: 'بانتظار المراجعة', under_review: 'قيد المراجعة',
  changes_requested: 'يحتاج استكمالًا', accepted: 'مقبول', rejected: 'مرفوض', completed: 'مكتملة',
  implemented: 'مطبق كليًا', in_progress: 'مطبق جزئيًا', not_implemented: 'غير مطبق', not_applicable: 'غير منطبق',
  cancelled: 'ملغى', verified: 'تم التحقق', not_uploaded: 'لم يرفع',
};
export function showValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/(?:_at|_date|_until|^coverage_(?:start|end))$/.test(key) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text))
    return formatRiyadhDateTime(text, text);
  return /status$|^(result|action)$/.test(key) ? statuses[text] ?? text : text;
}

export function fieldValue(row: AuditEvent, ...keys: string[]) {
  for (const key of keys) {
    for (const record of [row.new_data, row.previous_data]) {
      const v = record?.[key];
      if (typeof v === 'number' || (typeof v === 'string' && v.trim())) return String(v);
    }
  }
  return '';
}

export function eventReference(row: AuditEvent, control?: AuditControl) {
  const kind = row.entity_type;
  const savedCode = fieldValue(row, 'control_code', 'project_code', 'requirement_code');
  const savedTitle = fieldValue(row, 'name_ar', 'title_ar', 'evidence_name', 'file_name', 'title', 'name');
  const code = savedCode || (kind === 'controls' ? control?.control_code : '') || `#${row.entity_id}`;
  const title = savedTitle || (kind === 'controls' ? control?.title_ar : '') || '';
  const context = kind !== 'controls' && row.control_id ? control?.control_code ?? `#${row.control_id}` : '';
  return { code, title, context };
}

export function eventLink(row: AuditEvent, full: boolean) {
  const id = positiveId(row.entity_id);
  const controlId = row.control_id ?? (row.entity_type === 'controls' ? id : null);
  if (row.action !== 'delete') {
    if (row.entity_type === 'cybersecurity_projects' && id) return { href: `/roadmap/${id}`, label: 'فتح المشروع' };
    if (full && row.entity_type === 'evidence' && id)
      return { href: evidenceReviewHref({ id, link_id: null }), label: 'فتح الدليل' };
    if (full && row.entity_type === 'evidence_reviews') {
      const evidenceId = positiveId(fieldValue(row, 'evidence_id'));
      if (evidenceId) return { href: evidenceReviewHref({ id: evidenceId, link_id: null }), label: 'فتح الدليل' };
    }
    if (row.entity_type === 'evidence_requests' && controlId && id)
      return { href: `/controls/${controlId}?auditRequest=${id}#audit-request-${id}`, label: 'فتح طلب الدليل' };
    if (row.entity_type === 'control_review_cycles' && controlId && id)
      return { href: `/controls/${controlId}?auditCycle=${id}#audit-cycle-${id}`, label: 'فتح دورة المراجعة' };
  }
  if (controlId && (row.entity_type !== 'controls' || row.action !== 'delete'))
    return { href: `/controls/${controlId}`, label: 'فتح الضابط المرتبط' };
  return null;
}

export const escapeAuditLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

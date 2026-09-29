import type { UserRole } from './auth';
import { isReviewTeam, type ReviewWorkItem, type WorkType } from './review-work-queue';

export type DecisionSafety = 'INLINE_SAFE' | 'OPEN_RECORD_REQUIRED' | 'NO_MUTATION';
// Application presentation policy only. Backend permissions/transitions remain authoritative.
export const decisionSafetyMatrix: Record<WorkType, { classification: DecisionSafety; reason: string }> = {
  EVIDENCE_REVIEW: { classification: 'INLINE_SAFE', reason: 'للدليل المباشر فقط، بعد عرض الملف والإصدار والسياق والسبب وإعادة القراءة؛ المشترك يتطلب فتح السجل.' },
  ASSESSMENT_ITEM_REVIEW: { classification: 'OPEN_RECORD_REQUIRED', reason: 'يتطلب المتطلب الرسمي والنتيجة والمبرر والأدلة ومراجعة البند، لا ملخص الصف.' },
  ASSESSMENT_REVIEW_COMPLETION: { classification: 'OPEN_RECORD_REQUIRED', reason: 'يلزم فحص بنود الدورة ونطاقها وجاهزية الأدلة قبل الإكمال.' },
  ASSESSMENT_APPROVAL: { classification: 'OPEN_RECORD_REQUIRED', reason: 'قرار عالي الأثر ينشئ النسخة المعتمدة؛ يحتاج النطاق وجميع النتائج وسببًا وموعد إعادة تقييم.' },
  CORRECTIVE_ACTION_VERIFICATION: { classification: 'OPEN_RECORD_REQUIRED', reason: 'يلزم الاطلاع على تنفيذ الإجراء والدليل والاستقلالية داخل الملاحظة.' },
  FINDING_VERIFICATION: { classification: 'OPEN_RECORD_REQUIRED', reason: 'يتطلب فحص الملاحظة وجميع الإجراءات والأدلة؛ مستقل عن إكمال الإجراء.' },
  FINDING_CLOSURE: { classification: 'OPEN_RECORD_REQUIRED', reason: 'إغلاق صريح منفصل بواسطة المتحقق المسجل بعد إعادة فحص الأدلة والإجراءات.' },
  PERIODIC_REVIEW_FOLLOWUP: { classification: 'NO_MUTATION', reason: 'متابعة وتنقل فقط؛ قرار المراجعة الدورية داخل Control 360.' },
};
export function canOfferInlineEvidence(item: ReviewWorkItem, role: UserRole) {
  return isReviewTeam(role) && item.type === 'EVIDENCE_REVIEW' && item.sourceModel === 'evidence' &&
    item.key === `EVIDENCE_REVIEW:${item.sourceId}:direct` && item.controlId !== null &&
    ['pending_review', 'under_review'].includes(item.state);
}

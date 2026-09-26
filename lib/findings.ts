export type FindingSource = 'assessment' | 'internal_audit' | 'risk' | 'vulnerability';
export type FindingStatus = 'open' | 'in_treatment' | 'pending_verification' | 'closed';
export type ActionStatus = 'open' | 'in_progress' | 'completed';
export type VerificationStatus = 'not_submitted' | 'pending' | 'accepted' | 'rejected';

export type SharedFinding = {
  id: number;
  reference_code: string;
  source_type: FindingSource;
  source_record_id: number;
  assessment_item_id: number | null;
  assessment_cycle_id: number | null;
  control_id: number | null;
  framework_id: number | null;
  title: string;
  description: string;
  severity: 'unclassified' | 'low' | 'medium' | 'high' | 'critical';
  owner_id: string | null;
  status: FindingStatus;
  due_date: string | null;
  identified_date: string;
  verification_status: VerificationStatus;
  verification_evidence_id: number | null;
  verification_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  closure_reason: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  revision: number;
};

export type CorrectiveAction = {
  id: number;
  finding_id: number;
  title: string;
  description: string;
  owner_id: string;
  due_date: string | null;
  status: ActionStatus;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
  verification_status: VerificationStatus;
  verification_evidence_id: number | null;
  verification_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  reference_note: string | null;
  revision: number;
};

export const sourceLabels: Record<FindingSource, string> = {
  assessment: 'تقييم الالتزام',
  internal_audit: 'تدقيق داخلي — الربط محجوز',
  risk: 'سجل المخاطر',
  vulnerability: 'سجل الثغرات',
};
export const findingStatusLabels: Record<FindingStatus, string> = {
  open: 'مفتوحة',
  in_treatment: 'قيد المعالجة',
  pending_verification: 'بانتظار التحقق',
  closed: 'مغلقة',
};
export const actionStatusLabels: Record<ActionStatus, string> = {
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل — بانتظار التحقق',
};
export const severityLabels: Record<SharedFinding['severity'], string> = {
  unclassified: 'غير مصنفة',
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة',
};

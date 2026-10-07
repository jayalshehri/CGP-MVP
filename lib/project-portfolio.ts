export const priorityLabels = { P1: "P1 — السنة الأولى", P2: "P2 — السنة الثانية", P3: "P3 — السنة الثالثة" } as const;
export const executionYearLabels = { 1: "السنة الأولى", 2: "السنة الثانية", 3: "السنة الثالثة" } as const;
export const workTypeLabels = {
  technical_project: "مشروع تقني", managed_service: "خدمة مُدارة",
  framework_agreement: "اتفاقية إطارية", internal_program: "برنامج داخلي",
  policy_governance: "سياسة وحوكمة", assessment: "تقييم",
  technical_change: "تغيير تقني / تهيئة", ongoing_activity: "نشاط مستمر",
} as const;
export const ownerLabels = { it: "IT", cybersecurity: "Cybersecurity", dmo: "DMO", other: "أخرى" } as const; // Display labels; stored values stay it|cybersecurity|dmo|other.
export const durationLabels = { day: "يوم", week: "أسبوع", month: "شهر", year: "سنة" } as const;
export const statusLabels = { planned: "مخطط", in_progress: "قيد التنفيذ", completed: "مكتمل", on_hold: "متوقف" } as const;
export type Priority = keyof typeof priorityLabels;
export type WorkType = keyof typeof workTypeLabels;
export type ExecutiveOwner = keyof typeof ownerLabels;
export type DurationUnit = keyof typeof durationLabels;
export type ProjectStatus = keyof typeof statusLabels;
export type MappingMatchStatus = "exact_match" | "legacy_mapping" | "needs_review";
export type MappingReviewStatus = "pending" | "approved" | "rejected";
export const mappingCompletenessLabels = {
  verified: "مراجع الربط مكتملة التحقق", partially_mapped: "ربط جزئي — مراجع بانتظار المراجعة",
  mapping_pending: "الربط بانتظار المراجعة", source_error: "خطأ في مرجع المصدر",
} as const;
export type MappingCompleteness = keyof typeof mappingCompletenessLabels;

// Legacy priority/owner/initiative_type are deliberately absent. These nullable
// fields have no inferred defaults and do not rewrite historical classifications.
export type PortfolioProject = {
  id: number; project_code: string; name_ar: string; description_ar: string | null;
  portfolio_priority: Priority | null; execution_year: 1 | 2 | 3 | null;
  work_type: WorkType | null; executive_owner_code: ExecutiveOwner | null;
  executive_owner_other: string | null; duration_value: number | null;
  duration_unit: DurationUnit | null; status: ProjectStatus; progress_percent: number;
  archived_at: string | null; archived_by: string | null; archive_reason: string | null;
  import_staging_id: string | null;
  mapping_reference_count: number; mapping_exact_count: number; mapping_source_error_count: number;
  mapping_completeness: MappingCompleteness;
};
export type PortfolioImportBatch = {
  id: string; source_filename: string; source_sha256: string;
  status: "staging" | "validated" | "cancelled"; created_by: string; created_at: string;
};
export type PortfolioStagedProject = {
  id: string; batch_id: string; source_sheet: string; source_row: number;
  source_project_name: string; status: "planned"; priority: Priority; execution_year: 1 | 2 | 3;
  duration_value: number | null; duration_unit: DurationUnit | null;
  work_type: WorkType | null; executive_owner_code: ExecutiveOwner | null;
  executive_owner_other: string | null; source_payload: Record<string, unknown>;
};
export type PortfolioMappingReview = {
  id: string; staged_project_id: string; source_reference: string;
  source_framework: string | null; source_control_code: string | null;
  target_type: "control" | "requirement"; requirement_id: number | null;
  source_requirement_code: string | null; control_id: number | null; match_status: MappingMatchStatus; review_status: MappingReviewStatus;
  decision_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  source_error: boolean;
};
export type PortfolioForm = {
  project_code: string; name_ar: string; description_ar: string;
  portfolio_priority: Priority | ""; work_type: WorkType | "";
  executive_owner_code: ExecutiveOwner | ""; executive_owner_other: string;
  duration_value: string; duration_unit: DurationUnit | "";
  status: ProjectStatus; progress_percent: string;
};
export const emptyPortfolioForm: PortfolioForm = {
  project_code: "", name_ar: "", description_ar: "", portfolio_priority: "",
  work_type: "", executive_owner_code: "", executive_owner_other: "",
  duration_value: "", duration_unit: "", status: "planned", progress_percent: "0",
};
export function executionYear(priority: Priority | "" | null): 1 | 2 | 3 | null {
  return priority === "P1" ? 1 : priority === "P2" ? 2 : priority === "P3" ? 3 : null;
}
export function formatDuration(value: number | null, unit: DurationUnit | null): string {
  if (value === null || !unit) return "غير محددة";
  const label = value >= 3 && value <= 10 && Number.isInteger(value)
    ? { day: "أيام", week: "أسابيع", month: "أشهر", year: "سنوات" }[unit]
    : durationLabels[unit];
  return `${value} ${label}`;
}
export function portfolioPayload(form: PortfolioForm, creating: boolean) {
  if (!form.name_ar.trim() || !form.project_code.trim()) throw new Error("اسم المشروع ورمزه مطلوبان.");
  if (creating && !form.portfolio_priority) throw new Error("اختر أولوية المشروع.");
  if (form.portfolio_priority && !(form.portfolio_priority in priorityLabels)) throw new Error("الأولوية غير صالحة.");
  if (form.work_type && !(form.work_type in workTypeLabels)) throw new Error("نوع العمل غير صالح.");
  if (form.executive_owner_code && !(form.executive_owner_code in ownerLabels)) throw new Error("الجهة المالكة غير صالحة.");
  if (!(form.status in statusLabels)) throw new Error("حالة المشروع غير صالحة.");
  const duration = form.duration_value === "" ? null : Number(form.duration_value);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw new Error("المدة يجب أن تكون رقمًا موجبًا.");
  if ((duration === null) !== !form.duration_unit || (creating && duration === null)) throw new Error("أدخل قيمة المدة ووحدتها معًا.");
  if (form.duration_unit && !(form.duration_unit in durationLabels)) throw new Error("وحدة المدة غير صالحة.");
  if (form.executive_owner_code === "other" && !form.executive_owner_other.trim()) throw new Error("اسم الجهة/المالك التنفيذي مطلوب عند اختيار «أخرى».");
  const progress = Number(form.progress_percent);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error("نسبة الإنجاز يجب أن تكون بين 0 و100.");
  return {
    project_code: form.project_code, name_ar: form.name_ar, // Preserve exact source names.
    description_ar: form.description_ar || null, portfolio_priority: form.portfolio_priority || null,
    work_type: form.work_type || null, executive_owner_code: form.executive_owner_code || null,
    executive_owner_other: form.executive_owner_code === "other" ? form.executive_owner_other.trim() : null,
    duration_value: duration, duration_unit: form.duration_unit || null,
    status: creating ? "planned" : form.status, progress_percent: progress,
    // execution_year, archival/provenance, and deprecated fields are never writable here.
  };
}
export type PortfolioFilters = {
  query: string; archive: "active" | "archived" | "all";
  priority: string; year: string; workType: string; owner: string; status: string;
  durationUnit: string; durationMin: string; durationMax: string;
  mappingCompleteness: string;
};
export const defaultPortfolioFilters: PortfolioFilters = {
  query: "", archive: "active", priority: "all", year: "all", workType: "all", owner: "all",
  status: "all", durationUnit: "all", durationMin: "", durationMax: "",
  mappingCompleteness: "all",
};
export function matchesPortfolioFilters(project: PortfolioProject, filters: PortfolioFilters) {
  const match = (value: string | number | null, filter: string) => filter === "all" || (filter === "unset" ? value === null : String(value) === filter);
  return `${project.project_code} ${project.name_ar}`.toLocaleLowerCase("ar").includes(filters.query.trim().toLocaleLowerCase("ar"))
    && (filters.archive === "all" || (filters.archive === "archived") === Boolean(project.archived_at))
    && match(project.portfolio_priority, filters.priority) && match(project.execution_year, filters.year)
    && match(project.work_type, filters.workType) && match(project.executive_owner_code, filters.owner)
    && match(project.status, filters.status) && match(project.duration_unit, filters.durationUnit)
    && match(project.mapping_completeness ?? "mapping_pending", filters.mappingCompleteness)
    && (!filters.durationMin || (project.duration_value !== null && project.duration_value >= Number(filters.durationMin)))
    && (!filters.durationMax || (project.duration_value !== null && project.duration_value <= Number(filters.durationMax)));
}

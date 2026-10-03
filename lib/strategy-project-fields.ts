// Existing project fields only. No defaults derived from dates, status or progress.
export type ProjectForm = {
  project_code: string;
  name_ar: string;
  initiative_type: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  priority: "high" | "medium" | "low";
  planned_year: number;
  planned_quarter: string;
  executive_owner: string;
  planned_start_date: string;
  target_end_date: string;
  forecast_end_date: string;
  actual_start_date: string;
  actual_end_date: string;
  progress_percent: number;
  description_ar: string;
  target_outcome: string;
};

type ProjectFormRecord = {
  [K in keyof ProjectForm]: ProjectForm[K] | null;
};

export function projectToForm(project: ProjectFormRecord): ProjectForm {
  return {
    project_code: project.project_code ?? "",
    name_ar: project.name_ar ?? "",
    initiative_type: project.initiative_type ?? "",
    status: project.status ?? "planned",
    priority: project.priority ?? "medium",
    planned_year: project.planned_year ?? 2027,
    planned_quarter: project.planned_quarter ?? "",
    executive_owner: project.executive_owner ?? "",
    planned_start_date: project.planned_start_date ?? "",
    target_end_date: project.target_end_date ?? "",
    forecast_end_date: project.forecast_end_date ?? "",
    actual_start_date: project.actual_start_date ?? "",
    actual_end_date: project.actual_end_date ?? "",
    progress_percent: Number(project.progress_percent) || 0,
    description_ar: project.description_ar ?? "",
    target_outcome: project.target_outcome ?? "",
  };
}

const nullableFields = new Set<keyof ProjectForm>([
  "executive_owner", "planned_start_date", "target_end_date", "forecast_end_date",
  "actual_start_date", "actual_end_date", "description_ar", "target_outcome",
]);

// Omitted means unchanged; null means the operator explicitly cleared a field.
// Compare against the initial UI representation, not a null-coerced DB payload:
// untouched null, empty and legacy values are never sent back in an update.
export function projectWriteFields(form: ProjectForm, original?: ProjectFormRecord) {
  const initial = original ? projectToForm(original) : null;
  const payload: Partial<Record<keyof ProjectForm, string | number | null>> = {};
  for (const key of Object.keys(form) as (keyof ProjectForm)[]) {
    if (initial && form[key] === initial[key]) continue;
    payload[key] = nullableFields.has(key) && form[key] === "" ? null : form[key];
  }
  return payload;
}

export const projectDateLabels = {
  planned_start_date: "تاريخ البدء المخطط",
  actual_start_date: "تاريخ البدء الفعلي",
  target_end_date: "تاريخ الانتهاء المستهدف",
  forecast_end_date: "تاريخ الانتهاء المتوقع",
  actual_end_date: "تاريخ الانتهاء الفعلي",
} as const;

export type PlanningInformation = {
  executive_owner: string | null;
  target_outcome: string | null;
  target_end_date: string | null;
  forecast_end_date: string | null;
};

// Descriptive absence, not a score or a new minimum-data contract.
// Callers must pass only successfully loaded records.
export function missingPlanningInformation(project: PlanningInformation) {
  return {
    owner: !project.executive_owner?.trim(),
    outcome: !project.target_outcome?.trim(),
    target: !project.target_end_date,
    forecast: !project.forecast_end_date,
  };
}

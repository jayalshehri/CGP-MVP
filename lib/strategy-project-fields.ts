import { emptyPortfolioForm, portfolioPayload, type PortfolioForm, type PortfolioProject } from "@/lib/project-portfolio";

// Register form = the canonical QA portfolio form (lib/project-portfolio.ts)
// plus the S1-D optional target outcome. Quarter, legacy priority/type/owner
// text and project dates are deprecated and never written from this form.
export type ProjectForm = PortfolioForm & { target_outcome: string };

type ProjectFormRecord = Pick<PortfolioProject,
  "project_code" | "name_ar" | "description_ar" | "portfolio_priority" | "work_type" | "executive_owner_code"
  | "executive_owner_other" | "duration_value" | "duration_unit" | "status" | "progress_percent"
> & { target_outcome?: string | null };

export const emptyProjectForm: ProjectForm = { ...emptyPortfolioForm, target_outcome: "" };

export function projectToForm(project: ProjectFormRecord): ProjectForm {
  return {
    project_code: project.project_code ?? "",
    name_ar: project.name_ar ?? "",
    description_ar: project.description_ar ?? "",
    portfolio_priority: project.portfolio_priority ?? "",
    work_type: project.work_type ?? "",
    executive_owner_code: project.executive_owner_code ?? "",
    executive_owner_other: project.executive_owner_other ?? "",
    duration_value: project.duration_value == null ? "" : String(Number(project.duration_value)),
    duration_unit: project.duration_unit ?? "",
    status: project.status ?? "planned",
    progress_percent: String(Number(project.progress_percent) || 0),
    target_outcome: project.target_outcome ?? "",
  };
}

// Validation and normalization come from the canonical portfolioPayload.
// Creation sends the full payload. An edit sends only fields whose normalized
// value differs from the loaded record, so untouched values are never written
// back; database CHECKs still evaluate the complete row. execution_year,
// archive and import provenance are never part of the payload.
export function projectWriteFields(form: ProjectForm, original?: ProjectFormRecord) {
  const payload: Record<string, string | number | null> = {
    ...portfolioPayload(form, !original),
    target_outcome: form.target_outcome === "" ? null : form.target_outcome,
  };
  if (!original) return payload;
  const before: Record<string, string | number | null> = {
    ...portfolioPayload(projectToForm(original), false),
    target_outcome: original.target_outcome ?? null,
  };
  // The project code is set at creation only and never sent on edit.
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => key !== "project_code" && value !== before[key]));
}

export type PlanningInformation = Pick<PortfolioProject, "portfolio_priority" | "executive_owner_code" | "duration_value" | "duration_unit"> & {
  target_outcome: string | null;
};

// Descriptive absence, not a score or a new minimum-data contract.
// Callers must pass only successfully loaded records.
export function missingPlanningInformation(project: PlanningInformation) {
  return {
    priority: !project.portfolio_priority,
    owner: !project.executive_owner_code,
    duration: !(Number(project.duration_value) > 0 && project.duration_unit),
    outcome: !project.target_outcome?.trim(),
  };
}

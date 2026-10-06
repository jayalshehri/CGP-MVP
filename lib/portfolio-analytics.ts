// Read-side helpers for roadmap, analysis and executive views. Built only on the
// canonical QA portfolio model in lib/project-portfolio.ts; no labels or values
// are redefined here. Quarter and project dates are not portfolio inputs.
import {
  executionYear, formatDuration, ownerLabels, statusLabels, workTypeLabels,
  type PortfolioProject, type Priority,
} from "@/lib/project-portfolio";

export type PortfolioFields = Pick<PortfolioProject,
  "portfolio_priority" | "work_type" | "executive_owner_code" | "executive_owner_other" | "duration_value" | "duration_unit"
> & { execution_year?: PortfolioProject["execution_year"]; archived_at?: string | null };

export const executionYears = [1, 2, 3] as const;
export const executionYearText: Record<1 | 2 | 3, string> = { 1: "السنة الأولى", 2: "السنة الثانية", 3: "السنة الثالثة" };
export const workTypeText = workTypeLabels;
export const projectStatusText = statusLabels;

export const executionYearFor = (priority: string | null | undefined) =>
  executionYear(priority === "P1" || priority === "P2" || priority === "P3" ? priority as Priority : null);
export const isArchived = (project: Pick<PortfolioFields, "archived_at">) => Boolean(project.archived_at);
/** No P1/P2/P3 recorded (e.g. historical projects). Never inferred from legacy priority. */
export const isLegacyProject = (project: Pick<PortfolioFields, "portfolio_priority">) => !project.portfolio_priority;

export function executiveOwnerLabel(project: Pick<PortfolioFields, "executive_owner_code" | "executive_owner_other">): string | null {
  if (!project.executive_owner_code) return null;
  return project.executive_owner_code === "other"
    ? project.executive_owner_other?.trim() || ownerLabels.other
    : ownerLabels[project.executive_owner_code] ?? project.executive_owner_code;
}

export function durationLabel(project: Pick<PortfolioFields, "duration_value" | "duration_unit">): string | null {
  const value = project.duration_value === null ? null : Number(project.duration_value);
  return value === null || !Number.isFinite(value) || value <= 0 || !project.duration_unit ? null : formatDuration(value, project.duration_unit);
}

export function executionYearLabel(project: Pick<PortfolioFields, "portfolio_priority">): string | null {
  const year = executionYearFor(project.portfolio_priority);
  return year ? executionYearText[year] : null;
}

export type PortfolioDimension = "priority" | "execution_year" | "work_type" | "executive_owner" | "status";
type Analysable = PortfolioFields & { status: string };

export function dimensionValue(project: Analysable, dimension: PortfolioDimension): string {
  switch (dimension) {
    case "priority": return project.portfolio_priority ?? "";
    case "execution_year": return String(executionYearFor(project.portfolio_priority) ?? "");
    case "work_type": return project.work_type ?? "";
    case "executive_owner": return project.executive_owner_code ?? "";
    case "status": return project.status;
  }
}

export function matchesPortfolioFilters(project: Analysable, filters: Partial<Record<PortfolioDimension, string>>) {
  return (Object.entries(filters) as [PortfolioDimension, string][])
    .every(([dimension, value]) => !value || value === "all" || dimensionValue(project, dimension) === value);
}

export const dimensionOptions: Record<PortfolioDimension, Record<string, string>> = {
  priority: { P1: "P1", P2: "P2", P3: "P3" },
  execution_year: { 1: executionYearText[1], 2: executionYearText[2], 3: executionYearText[3] },
  work_type: workTypeLabels,
  executive_owner: ownerLabels,
  status: statusLabels,
};

export const dimensionText: Record<PortfolioDimension, string> = {
  priority: "الأولوية",
  execution_year: "سنة التنفيذ",
  work_type: "نوع العمل",
  executive_owner: "الجهة المالكة",
  status: "الحالة",
};

/** Counts per known option plus "unset" (not yet classified). */
export function portfolioBreakdown(projects: readonly Analysable[], dimension: PortfolioDimension) {
  const options = dimensionOptions[dimension];
  const rows = Object.entries(options).map(([value, label]) => ({
    value, label, count: projects.filter(project => dimensionValue(project, dimension) === value).length,
  }));
  return { rows, unset: projects.filter(project => !Object.hasOwn(options, dimensionValue(project, dimension))).length };
}

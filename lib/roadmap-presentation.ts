// Presentation rules shared by the register, roadmap and analysis views.
// Pure and dependency-free: they decide what is worth showing, never change data
// or approved portfolio calculations.
export type PresentableProject = {
  status: string; progress_percent: number | string;
  portfolio_priority: string | null; executive_owner_code: string | null; executive_owner_other?: string | null;
  duration_value: number | string | null; duration_unit: string | null;
  work_type?: string | null; archived_at?: string | null; target_outcome?: string | null;
  import_staging_id?: string | null; mapping_completeness?: string | null;
};

/** Progress carries information only once work has started or been recorded. */
export const showProgress = (project: Pick<PresentableProject, "status" | "progress_percent">) =>
  project.status !== "planned" || Number(project.progress_percent) > 0;

/** Status on a roadmap card only when it differs from the default plan state. */
export const showCardStatus = (project: Pick<PresentableProject, "status">) => project.status !== "planned";

export function durationUnits(projects: readonly Pick<PresentableProject, "duration_unit">[]): string[] {
  return [...new Set(projects.map((project) => project.duration_unit).filter((unit): unit is string => Boolean(unit)))];
}

/** The unit filter only helps when units differ (or a unit filter is already applied). */
export const showDurationUnitFilter = (projects: readonly Pick<PresentableProject, "duration_unit">[], current = "all") =>
  durationUnits(projects).length > 1 || current !== "all";

export type MissingField = "priority" | "owner" | "duration" | "outcome";
export const missingFieldLabels: Record<MissingField, string> = {
  priority: "بلا أولوية", owner: "بلا جهة مالكة", duration: "بلا مدة", outcome: "بلا نتيجة مستهدفة",
};
export function missingData(project: PresentableProject): MissingField[] {
  const missing: MissingField[] = [];
  if (!project.portfolio_priority) missing.push("priority");
  if (!project.executive_owner_code) missing.push("owner");
  if (project.duration_value === null || project.duration_value === "" || !project.duration_unit) missing.push("duration");
  if (!project.target_outcome?.trim()) missing.push("outcome");
  return missing;
}

export const mappingKeys = ["verified", "partially_mapped", "mapping_pending", "source_error"] as const;
export type MappingKey = typeof mappingKeys[number];
export function mappingDistribution(projects: readonly Pick<PresentableProject, "mapping_completeness">[]): Record<MappingKey, number> {
  const counts: Record<MappingKey, number> = { verified: 0, partially_mapped: 0, mapping_pending: 0, source_error: 0 };
  for (const project of projects) {
    const key = (project.mapping_completeness ?? "mapping_pending") as MappingKey;
    if (Object.hasOwn(counts, key)) counts[key]++;
  }
  return counts;
}

/** Non-zero categories, largest first; "unset" counts projects without a value. */
export function categoryMix<T extends string>(projects: readonly { [key: string]: unknown }[], field: string, keys: readonly T[]) {
  const rows = keys.map((key) => ({ key, count: projects.filter((project) => project[field] === key).length }))
    .filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
  return { rows, unset: projects.filter((project) => !project[field]).length, total: projects.length };
}

// Planned portfolio load: the sum of recorded project durations in months, per
// owner and execution year. It describes the plan, not people or capacity, and
// infers nothing about FTE or utilisation. Day/week durations are not converted;
// they are counted as projects with an unmeasured duration.
export const loadOwners = ["cybersecurity", "it", "dmo", "other"] as const;
export type LoadOwner = typeof loadOwners[number] | "unset";
export type LoadCell = { projects: number; months: number; unmeasured: number };
const yearOf = (priority: string | null) => priority === "P1" ? 1 : priority === "P2" ? 2 : priority === "P3" ? 3 : null;
const monthsOf = (project: Pick<PresentableProject, "duration_value" | "duration_unit">) => {
  const value = Number(project.duration_value);
  if (project.duration_value === null || !Number.isFinite(value) || value <= 0) return null;
  return project.duration_unit === "month" ? value : project.duration_unit === "year" ? value * 12 : null;
};
export function plannedLoadMatrix(projects: readonly PresentableProject[]) {
  const empty = (): LoadCell => ({ projects: 0, months: 0, unmeasured: 0 });
  const owners: LoadOwner[] = [...loadOwners, "unset"];
  const cells = new Map<string, LoadCell>();
  const years = [1, 2, 3] as const;
  const totals = { 1: empty(), 2: empty(), 3: empty() } as Record<1 | 2 | 3, LoadCell>;
  let unscheduled = 0;
  for (const project of projects) {
    const year = yearOf(project.portfolio_priority);
    if (!year) { unscheduled++; continue; }
    const owner: LoadOwner = (loadOwners as readonly string[]).includes(project.executive_owner_code ?? "") ? project.executive_owner_code as LoadOwner : "unset";
    const key = `${owner}:${year}`;
    const cell = cells.get(key) ?? empty();
    const months = monthsOf(project);
    for (const target of [cell, totals[year]]) {
      target.projects++;
      if (months === null) target.unmeasured++; else target.months += months;
    }
    cells.set(key, cell);
  }
  const rows = owners
    .map((owner) => ({ owner, cells: years.map((year) => cells.get(`${owner}:${year}`) ?? empty()) }))
    .filter((row) => row.owner !== "unset" || row.cells.some((cell) => cell.projects > 0))
    .map((row) => ({ ...row, total: row.cells.reduce((sum, cell) => ({ projects: sum.projects + cell.projects, months: sum.months + cell.months, unmeasured: sum.unmeasured + cell.unmeasured }), empty()) }));
  return { rows, totals: years.map((year) => totals[year]), unscheduled };
}

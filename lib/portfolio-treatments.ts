// Gap-treatment metrics for a portfolio scope. Analysis and the executive summary
// both go through these helpers so the same scope always yields the same numbers;
// treatments of projects outside the scope (e.g. archived) are never counted.
export type ScopedTreatment = { project_id: number; priority: "high" | "medium" | "low" };

/** High-priority treatments recorded on the given (scoped) projects. */
export function scopedHighTreatments<T extends ScopedTreatment>(treatments: readonly T[], projects: readonly { id: number }[]): T[] {
  const ids = new Set(projects.map((project) => project.id));
  return treatments.filter((item) => item.priority === "high" && ids.has(item.project_id));
}

/** Scoped projects that carry a high treatment but have no direct control link. */
export function highTreatmentProjectsWithoutDirectLinks(
  treatments: readonly ScopedTreatment[],
  links: readonly { project_id: number }[],
  projects: readonly { id: number }[],
): Set<number> {
  const linked = new Set(links.map((link) => link.project_id));
  return new Set(scopedHighTreatments(treatments, projects).map((item) => item.project_id).filter((id) => !linked.has(id)));
}

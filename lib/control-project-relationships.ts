// Projects related to one control, from both sources: requirement-derived
// (project -> requirement -> control) and direct project -> control links.
// One row per project; the sources stay labelled and are never inferred from
// each other. Active projects come first; archived ones stay as history.
type One<T> = T | T[] | null;
export type ControlRelationshipProject = { project_code: string; name_ar: string; archived_at: string | null };
export type ControlRequirementLink = {
  requirement_id: number; coverage_type: string; mapping_confidence: string;
  cybersecurity_requirements: One<{ requirement_code: string; title_ar: string }>;
};
export type ControlProjectRequirementLink = { requirement_id: number; project_id: number; cybersecurity_projects: One<ControlRelationshipProject> };
export type ControlDirectLink = { project_id: number; cybersecurity_projects: One<ControlRelationshipProject> };
export type RelationshipSource = "requirement" | "direct";
export type ControlProjectRow = {
  project_id: number; project_code: string; name_ar: string; archived: boolean;
  sources: RelationshipSource[];
  requirements: { requirement_id: number; requirement_code: string | null; title_ar: string | null; coverage_type: string; mapping_confidence: string }[];
};

const single = <T,>(value: One<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export function controlProjectRelationships(
  requirementLinks: readonly ControlRequirementLink[],
  projectRequirementLinks: readonly ControlProjectRequirementLink[],
  directLinks: readonly ControlDirectLink[],
): { projects: ControlProjectRow[]; requirementsWithoutProject: ControlRequirementLink[] } {
  const rows = new Map<number, ControlProjectRow>();
  // Projects hidden by RLS come back without the joined row and are skipped.
  const rowFor = (projectId: number, project: ControlRelationshipProject | null) => {
    if (!project) return null;
    let row = rows.get(projectId);
    if (!row) {
      row = { project_id: projectId, project_code: project.project_code, name_ar: project.name_ar, archived: Boolean(project.archived_at), sources: [], requirements: [] };
      rows.set(projectId, row);
    }
    return row;
  };
  const requirementsWithoutProject: ControlRequirementLink[] = [];
  for (const link of requirementLinks) {
    const requirement = single(link.cybersecurity_requirements);
    let visible = 0;
    for (const edge of projectRequirementLinks) {
      if (edge.requirement_id !== link.requirement_id) continue;
      const row = rowFor(edge.project_id, single(edge.cybersecurity_projects));
      if (!row) continue;
      visible++;
      if (!row.sources.includes("requirement")) row.sources.push("requirement");
      if (!row.requirements.some((item) => item.requirement_id === link.requirement_id)) {
        row.requirements.push({ requirement_id: link.requirement_id, requirement_code: requirement?.requirement_code ?? null, title_ar: requirement?.title_ar ?? null, coverage_type: link.coverage_type, mapping_confidence: link.mapping_confidence });
      }
    }
    if (!visible) requirementsWithoutProject.push(link);
  }
  for (const link of directLinks) {
    const row = rowFor(link.project_id, single(link.cybersecurity_projects));
    if (row && !row.sources.includes("direct")) row.sources.push("direct");
  }
  const order: RelationshipSource[] = ["direct", "requirement"];
  const projects = [...rows.values()]
    .map((row) => ({ ...row, sources: order.filter((source) => row.sources.includes(source)) }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.project_code.localeCompare(b.project_code, "en"));
  return { projects, requirementsWithoutProject };
}

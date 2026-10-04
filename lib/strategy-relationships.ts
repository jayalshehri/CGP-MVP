// Scoped, read-only relationship projection. Inputs must be COMPLETE reads within
// the caller's RLS scope; null denotes an unavailable source, never zero rows.
export type ProjectRequirementEdge = { project_id: number; requirement_id: number; coverage_type: string };
export type RequirementControlEdge = { requirement_id: number; control_id: number; coverage_type: string; mapping_confidence: string; evidence_status?: string; verification_status?: string };
export type LegacyControlEdge = { project_id: number; control_id: number };

export type CanonicalPath = {
  project_id: number;
  requirement_id: number;
  control_id: number;
  project_coverage_type: string;
  mapping_coverage_type: string;
  mapping_confidence: string;
  evidence_status?: string;
  verification_status?: string;
};
export type RelationshipCounts = {
  projects: number;
  requirements: number;
  projectRequirementLinks: number;
  controls: number;
  requirementControlLinks: number;
  paths: number;
  projectControlPairs: number;
};

const pair = (a: number, b: number) => `${a}:${b}`;
const triple = (a: number, b: number, c: number) => `${a}:${b}:${c}`;

export function canonicalRelationships(
  visibleProjectIds: readonly number[],
  projectRequirements: readonly ProjectRequirementEdge[],
  requirementControls: readonly RequirementControlEdge[],
): { counts: RelationshipCounts; paths: CanonicalPath[]; byProject: Map<number, RelationshipCounts> } {
  const projects = new Set(visibleProjectIds);
  const pr = new Map<string, ProjectRequirementEdge>();
  for (const edge of projectRequirements) if (projects.has(edge.project_id)) pr.set(pair(edge.project_id, edge.requirement_id), edge);
  const requirements = new Set(Array.from(pr.values(), edge => edge.requirement_id));
  const rc = new Map<string, RequirementControlEdge>();
  for (const edge of requirementControls) if (requirements.has(edge.requirement_id)) rc.set(pair(edge.requirement_id, edge.control_id), edge);
  const byRequirement = new Map<number, RequirementControlEdge[]>();
  for (const edge of rc.values()) byRequirement.set(edge.requirement_id, [...(byRequirement.get(edge.requirement_id) ?? []), edge]);
  const paths = new Map<string, CanonicalPath>();
  for (const edge of pr.values()) for (const mapping of byRequirement.get(edge.requirement_id) ?? []) {
    paths.set(triple(edge.project_id, edge.requirement_id, mapping.control_id), {
      project_id: edge.project_id,
      requirement_id: edge.requirement_id,
      control_id: mapping.control_id,
      project_coverage_type: edge.coverage_type,
      mapping_coverage_type: mapping.coverage_type,
      mapping_confidence: mapping.mapping_confidence,
      evidence_status: mapping.evidence_status,
      verification_status: mapping.verification_status,
    });
  }
  const sortedPaths = Array.from(paths.values()).sort((a, b) => a.project_id - b.project_id || a.requirement_id - b.requirement_id || a.control_id - b.control_id);
  const count = (projectId?: number): RelationshipCounts => {
    const prRows = Array.from(pr.values()).filter(edge => projectId === undefined || edge.project_id === projectId);
    const requirementIds = new Set(prRows.map(edge => edge.requirement_id));
    const rcRows = Array.from(rc.values()).filter(edge => requirementIds.has(edge.requirement_id));
    const scopedPaths = sortedPaths.filter(path => projectId === undefined || path.project_id === projectId);
    return {
      projects: projectId === undefined ? projects.size : Number(projects.has(projectId)),
      requirements: requirementIds.size,
      projectRequirementLinks: prRows.length,
      controls: new Set(rcRows.map(edge => edge.control_id)).size,
      requirementControlLinks: rcRows.length,
      paths: scopedPaths.length,
      projectControlPairs: new Set(scopedPaths.map(path => pair(path.project_id, path.control_id))).size,
    };
  };
  return { counts: count(), paths: sortedPaths, byProject: new Map(Array.from(projects, id => [id, count(id)])) };
}

export function legacyRelationships(
  visibleProjectIds: readonly number[],
  legacy: readonly LegacyControlEdge[] | null,
  modernPaths: readonly CanonicalPath[] | null,
): { links: number; controls: number; overlap: number | null } | null {
  if (legacy === null) return null;
  const projects = new Set(visibleProjectIds);
  const pairs = new Set(legacy.filter(edge => projects.has(edge.project_id)).map(edge => pair(edge.project_id, edge.control_id)));
  const modernPairs = modernPaths === null ? null : new Set(modernPaths.map(path => pair(path.project_id, path.control_id)));
  return {
    links: pairs.size,
    controls: new Set(Array.from(pairs, key => Number(key.split(':')[1]))).size,
    overlap: modernPairs === null ? null : Array.from(pairs).filter(key => modernPairs.has(key)).length,
  };
}

export function mappingMultiplicity(rows: readonly Pick<RequirementControlEdge, 'control_id' | 'coverage_type' | 'mapping_confidence'>[]) {
  const byControl = new Map<number, { coverage: Set<string>; confidence: Set<string> }>();
  for (const row of rows) {
    const item = byControl.get(row.control_id) ?? { coverage: new Set<string>(), confidence: new Set<string>() };
    item.coverage.add(row.coverage_type);
    item.confidence.add(row.mapping_confidence);
    byControl.set(row.control_id, item);
  }
  return byControl;
}

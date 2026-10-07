import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import { canonicalRelationships, type ProjectRequirementEdge, type RelationshipCounts, type RequirementControlEdge } from "@/lib/strategy-relationships";

export type CanonicalEdges = { projectRequirements: ProjectRequirementEdge[]; requirementControls: RequirementControlEdge[] };

// Never publish a plausible partial total: all three authorized sources must
// complete before any modern relationship aggregate can be computed.
// The edges are scope-free; callers count them for the projects they display.
export async function readCanonicalEdges(): Promise<CanonicalEdges | null> {
  try {
  const [pr, rc, activeControls] = await Promise.all([
    readStrategyRows((from, to) => supabase.from("cybersecurity_project_requirements")
      .select("project_id,requirement_id,coverage_type,cybersecurity_requirements(id)", { count: "exact" })
      .order("project_id").order("requirement_id").range(from, to), row => `${row.project_id}:${row.requirement_id}`),
    readStrategyRows((from, to) => supabase.from("cybersecurity_requirement_controls")
      .select("requirement_id,control_id,coverage_type,mapping_confidence", { count: "exact" })
      .eq("mapping_status", "active").order("requirement_id").order("control_id").range(from, to), row => `${row.requirement_id}:${row.control_id}`),
    readStrategyRows((from, to) => supabase.from("controls")
      .select("id,frameworks!inner(is_active)", { count: "exact" })
      .eq("frameworks.is_active", true).order("id").range(from, to), row => row.id),
  ]);
  if ([pr, rc, activeControls].some(read => read.status !== "COMPLETE") || pr.data.some(row => !row.cybersecurity_requirements)) return null;
  const activeIds = new Set(activeControls.data.map(row => row.id));
  return { projectRequirements: pr.data, requirementControls: rc.data.filter(row => activeIds.has(row.control_id)) };
  } catch {
    return null;
  }
}

export async function readCanonicalPortfolio(visibleProjectIds: readonly number[]): Promise<RelationshipCounts | null> {
  const edges = await readCanonicalEdges();
  return edges ? canonicalRelationships(visibleProjectIds, edges.projectRequirements, edges.requirementControls).counts : null;
}

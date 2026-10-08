// Self-contained (no imports): loaded directly by offline formula tests.
export type PortfolioStatus = "planned" | "in_progress" | "on_hold" | "completed";

export type PortfolioProjectCore = {
  id: number;
  portfolio_priority: string | null;
  executive_owner_code: string | null;
  duration_value: number | string | null;
  duration_unit: string | null;
  status: PortfolioStatus;
  progress_percent: number;
  target_outcome: string | null;
  recommended_technologies: string | null;
};

export type PlanningReadinessItem = {
  key: "owner" | "outcome" | "priority" | "duration" | "controlLink";
  label: string;
  complete: boolean;
};

// Portfolio model planning elements. Quarter and project dates are no longer
// planning inputs: execution year follows the priority, scale is the duration.
export function planningReadinessItems(
  project: PortfolioProjectCore,
  linkedControls: number,
): PlanningReadinessItem[] {
  return [
    { key: "priority", label: "الأولوية", complete: Boolean(project.portfolio_priority) },
    { key: "owner", label: "المالك التنفيذي", complete: Boolean(project.executive_owner_code) },
    { key: "duration", label: "مدة المشروع", complete: Number(project.duration_value) > 0 && ["day", "week", "month", "year"].includes(project.duration_unit ?? "") },
    { key: "outcome", label: "الناتج المستهدف", complete: Boolean(project.target_outcome?.trim()) },
    { key: "controlLink", label: "رابط مباشر مسجّل بضابط", complete: linkedControls > 0 },
  ];
}

export function planningReadiness(
  project: PortfolioProjectCore,
  linkedControls: number,
): number {
  const items = planningReadinessItems(project, linkedControls);
  return Math.round((items.filter((item) => item.complete).length / items.length) * 100);
}

export function averageProgress(projects: Array<Pick<PortfolioProjectCore, "progress_percent">>): number {
  if (!projects.length) return 0;
  return Math.round(
    projects.reduce((total, project) => total + Number(project.progress_percent || 0), 0) /
      projects.length,
  );
}

// --- Requirement layer rollups (Program -> Project -> Requirement -> Control) ---
// Compliance is never stored here: every number below is derived at read time
// from controls.evidence_status/verification_status. A project's progress or
// completion never implies a control is compliant.

export type CoverageType = "full" | "partial" | "supporting";
export type MappingConfidence = "confirmed" | "probable";

export type RequirementControlLink = {
  requirement_id: number;
  control_id: number;
  coverage_type: CoverageType;
  mapping_confidence: MappingConfidence;
  evidence_status: string;
  verification_status: string;
};

export type ProjectRequirementRow = { requirement_id: number; coverage_type: CoverageType; project_id?: number };

export type RequirementRollup = {
  requirementsCount: number;
  linkedControlsCount: number;
  full: number;
  partial: number;
  supporting: number;
  readyForVerification: number;
  verified: number;
  complianceContributionPercent: number | null;
  confirmedMappings: number;
  probableMappings: number;
  requirementsWithoutMapping: number;
};

const isVerified = (verificationStatus: string) => verificationStatus === "verified";
const isReadyForVerification = (evidenceStatus: string, verificationStatus: string) =>
  evidenceStatus === "accepted" && verificationStatus !== "verified";

export function requirementRollup(
  projectRequirements: ProjectRequirementRow[],
  requirementControlLinks: RequirementControlLink[],
): RequirementRollup {
  const uniqueControls = new Map<number, RequirementControlLink>();
  for (const link of requirementControlLinks) uniqueControls.set(link.control_id, link);
  const verified = Array.from(uniqueControls.values()).filter((link) => isVerified(link.verification_status)).length;
  // A requirement with zero linked controls ("Needs Control Mapping" / Unresolved) is
  // derived live from the junction table, never a stored/guessed status — it is excluded
  // from Verified/Contribution/Coverage below simply because it contributes no controls,
  // but it still counts toward requirementsCount.
  const requirementIdsWithLinks = new Set(requirementControlLinks.map((link) => link.requirement_id));
  const requirementsWithoutMapping = new Set(projectRequirements.filter(
    (item) => !requirementIdsWithLinks.has(item.requirement_id),
  ).map(item => item.requirement_id)).size;
  return {
    requirementsCount: new Set(projectRequirements.map(item => item.requirement_id)).size,
    linkedControlsCount: uniqueControls.size,
    full: projectRequirements.filter((item) => item.coverage_type === "full").length,
    partial: projectRequirements.filter((item) => item.coverage_type === "partial").length,
    supporting: projectRequirements.filter((item) => item.coverage_type === "supporting").length,
    readyForVerification: Array.from(uniqueControls.values()).filter((link) => isReadyForVerification(link.evidence_status, link.verification_status)).length,
    verified,
    complianceContributionPercent: uniqueControls.size ? Math.round((verified / uniqueControls.size) * 100) : null,
    confirmedMappings: requirementControlLinks.filter((link) => link.mapping_confidence === "confirmed").length,
    probableMappings: requirementControlLinks.filter((link) => link.mapping_confidence === "probable").length,
    requirementsWithoutMapping,
  };
}

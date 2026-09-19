export type PortfolioStatus = "planned" | "in_progress" | "on_hold" | "completed";

export type PortfolioProjectCore = {
  id: number;
  status: PortfolioStatus;
  progress_percent: number;
  executive_owner: string | null;
  target_outcome: string | null;
  target_end_date: string | null;
  recommended_technologies: string | null;
};

export type PlanningReadinessItem = {
  key: "owner" | "outcome" | "targetDate" | "technology" | "controlLink";
  label: string;
  complete: boolean;
};

export function getRiyadhDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function planningReadinessItems(
  project: PortfolioProjectCore,
  linkedControls: number,
): PlanningReadinessItem[] {
  return [
    { key: "owner", label: "مالك المشروع", complete: Boolean(project.executive_owner?.trim()) },
    { key: "outcome", label: "الناتج المستهدف", complete: Boolean(project.target_outcome?.trim()) },
    { key: "targetDate", label: "التاريخ المستهدف", complete: Boolean(project.target_end_date) },
    { key: "technology", label: "المعالجة أو التقنية", complete: Boolean(project.recommended_technologies?.trim()) },
    { key: "controlLink", label: "رابط ضابط فعلي", complete: linkedControls > 0 },
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

export function isDelayed(
  project: Pick<PortfolioProjectCore, "target_end_date" | "status">,
  asOf = getRiyadhDate(),
): boolean {
  return Boolean(
    project.target_end_date &&
      project.target_end_date < asOf &&
      project.status !== "completed",
  );
}

export function hasMeasurableSchedule(
  projects: Array<Pick<PortfolioProjectCore, "target_end_date">>,
): boolean {
  return projects.some((project) => Boolean(project.target_end_date));
}

export function scheduleMetric(
  projects: Array<Pick<PortfolioProjectCore, "target_end_date" | "status">>,
  asOf = getRiyadhDate(),
): { value: number | null; missingDates: number } {
  const dated = projects.filter((project) => Boolean(project.target_end_date));
  return {
    value: dated.length ? dated.filter((project) => isDelayed(project, asOf)).length : null,
    missingDates: projects.length - dated.length,
  };
}

// --- Requirement layer rollups (Program -> Project -> Requirement -> Control) ---
// Compliance is never stored here: every number below is derived at read time
// from controls.evidence_status/verification_status. A project's progress or
// completion never implies a control is compliant.

export type CoverageType = "full" | "partial" | "supporting";

export type RequirementControlLink = {
  requirement_id: number;
  control_id: number;
  coverage_type: CoverageType;
  evidence_status: string;
  verification_status: string;
};

export type RequirementRollup = {
  requirementsCount: number;
  linkedControlsCount: number;
  full: number;
  partial: number;
  supporting: number;
  readyForVerification: number;
  verified: number;
  complianceContributionPercent: number | null;
};

const isVerified = (verificationStatus: string) => verificationStatus === "verified";
const isReadyForVerification = (evidenceStatus: string, verificationStatus: string) =>
  evidenceStatus === "accepted" && verificationStatus !== "verified";

export function requirementRollup(
  projectRequirementCoverage: CoverageType[],
  requirementControlLinks: RequirementControlLink[],
): RequirementRollup {
  const uniqueControlIds = new Set(requirementControlLinks.map((link) => link.control_id));
  const uniqueLinks = Array.from(uniqueControlIds).map(
    (controlId) => requirementControlLinks.find((link) => link.control_id === controlId)!,
  );
  const verified = uniqueLinks.filter((link) => isVerified(link.verification_status)).length;
  return {
    requirementsCount: projectRequirementCoverage.length,
    linkedControlsCount: uniqueControlIds.size,
    full: projectRequirementCoverage.filter((coverage) => coverage === "full").length,
    partial: projectRequirementCoverage.filter((coverage) => coverage === "partial").length,
    supporting: projectRequirementCoverage.filter((coverage) => coverage === "supporting").length,
    readyForVerification: uniqueLinks.filter((link) => isReadyForVerification(link.evidence_status, link.verification_status)).length,
    verified,
    complianceContributionPercent: uniqueLinks.length ? Math.round((verified / uniqueLinks.length) * 100) : null,
  };
}

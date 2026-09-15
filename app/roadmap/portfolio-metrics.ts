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

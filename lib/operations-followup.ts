import { EVIDENCE_PRESENT, isApplicable, isImplemented } from "./compliance";

type Control = {
  implementation_status: string | null;
  evidence_status: string | null;
  control_owner_id: string | null;
  due_date: string | null;
};

type Risk = {
  risk_status: string;
  residual_score: number;
  action_due_date: string | null;
};

export const taskFilters = ["all", "pending", "overdue", "evidence", "unassigned", "done", "progress", "due"] as const;
export type TaskFilter = typeof taskFilters[number];
const inProgress = new Set(["in_progress", "partially_implemented", "pending_review", "under_review"]);

export function parseTaskFilter(value: string | null): TaskFilter {
  return taskFilters.find(filter => filter === value) ?? "pending";
}

export function isOperationalControl(control: Control) {
  return isApplicable(control.implementation_status);
}

export function matchesTaskFilter(control: Control, filter: TaskFilter, today: string) {
  if (!isOperationalControl(control)) return false;
  const implemented = isImplemented(control.implementation_status);
  switch (filter) {
    case "all": return true;
    case "pending": return !implemented;
    case "done": return implemented;
    case "overdue": return !implemented && Boolean(control.due_date && control.due_date < today);
    case "evidence": {
      const evidence = (control.evidence_status ?? "").toLowerCase();
      return !EVIDENCE_PRESENT.has(evidence) && evidence !== "submitted";
    }
    case "unassigned": return !control.control_owner_id;
    case "progress": return inProgress.has((control.implementation_status ?? "").toLowerCase());
    case "due": return !implemented && !control.due_date;
  }
}

export function compareOperationalDueDates(a: string | null, b: string | null) {
  return a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);
}

export function riskNeedsAction(risk: Risk) {
  return risk.risk_status === "open" || risk.risk_status === "treatment_in_progress";
}

export function isRiskTreatmentOverdue(risk: Risk, today: string) {
  return riskNeedsAction(risk) && Boolean(risk.action_due_date && risk.action_due_date < today);
}

export function isCriticalOperationalRisk(risk: Risk) {
  return riskNeedsAction(risk) && risk.residual_score >= 17;
}

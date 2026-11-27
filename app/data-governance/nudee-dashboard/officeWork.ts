import { matchesWorkFilter, officeWeek } from "../nudee/queues";
import { evidenceLink } from "../nudee-indicator/routes";

export type WorkItem = {
  id: number; evidence_name: string; domain_name: string;
  task?: { status: string; due_date: string | null; assignee_id: string | null; updated_at: string };
  owner: string;
};
export type Scope = { view: string; domain?: string; from?: string; to?: string; status?: string };
export const labels: Record<string,string> = {
  submitted: "أدلة بانتظار المراجعة", overdue: "تكليفات متأخرة", action: "تكليفات بانتظار الرفع أو التعديل",
  changes_requested: "أدلة معادة للتعديل", approved: "أدلة معتمدة", unassigned: "متطلبات بلا مالك",
  review: "أدلة بانتظار قراري", all: "المتطلبات",
};
export function workLink(scope: Scope) {
  const query: Record<string,string> = {layout:"list"};
  for (const [key,value] of Object.entries(scope)) if (value) query[key] = value;
  return evidenceLink(query);
}
export function findWork(items: WorkItem[], scope: Scope, today: string, userId: string) {
  return items.filter(r => (!scope.domain || r.domain_name === scope.domain)
    && matchesWorkFilter(r.task,scope.view,today,userId,scope.status,scope.from,scope.to)).sort((a,b) => {
      const review = scope.view === "review" || scope.view === "submitted";
      const date = (r: WorkItem) => (review ? r.task?.updated_at : r.task?.due_date) || "9999";
      return date(a).localeCompare(date(b)) || a.id - b.id;
    });
}
export function weeklyDue(today: string): Scope {
  return {view:"action", from:today, to:officeWeek(today).end};
}
export function recordLink(r: WorkItem) {
  return evidenceLink({domain:r.domain_name,layout:"list",open:r.id});
}

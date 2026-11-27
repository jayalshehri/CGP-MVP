type Task = { status: string; assignee_id?: string | null; due_date: string | null };

export function isOverdue(task: Task | undefined, today: string) {
  return !!task?.due_date && task.due_date < today && needsEvidence(task);
}

export function needsEvidence(task: Task | undefined) {
  return task?.status === "assigned" || task?.status === "changes_requested";
}

export function canReview(task: Task | undefined, userId: string | null) {
  return !!userId && !!task?.assignee_id && task.status === "submitted" && task.assignee_id !== userId;
}

export function inView(task: Task | undefined, view: string, today: string, userId: string | null) {
  switch (view) {
    case "all": return true;
    case "action": return needsEvidence(task);
    case "review": return canReview(task, userId);
    case "overdue": return isOverdue(task, today);
    default: return (task?.status || "unassigned") === view;
  }
}

/** Sunday through Saturday, using a Riyadh calendar date supplied by the caller. */
export function officeWeek(today: string) {
  const start = new Date(today + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function withinDueDates(task: Task | undefined, from: string, to: string) {
  if (!from && !to) return true;
  const due = task?.due_date;
  return !!due && (!from || due >= from) && (!to || due <= to);
}

export function matchesWorkFilter(task: Task | undefined, view: string, today: string, userId: string | null,
  status = "", from = "", to = "") {
  return inView(task, view, today, userId)
    && (!status || (task?.status || "unassigned") === status)
    && withinDueDates(task, from, to);
}

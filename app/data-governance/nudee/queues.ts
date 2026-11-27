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

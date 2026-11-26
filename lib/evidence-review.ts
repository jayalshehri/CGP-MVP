import type { EvidenceRecord } from "./grc";

export type ReviewScope = "pending" | "mine" | "returned" | "history";
export type ReviewDecision = "accepted" | "changes_requested" | "rejected";
type Ref = { id: number; link_id: number | null };
export type ReviewTarget = { id: number; linkId: number | null | undefined };

export const reviewDecisions: ReadonlyArray<{ value: ReviewDecision; label: string }> = [
  { value: "accepted", label: "قبول الدليل" },
  { value: "changes_requested", label: "طلب استكمال" },
  { value: "rejected", label: "رفض الدليل" },
];

export const evidenceReviewKey = (row: Ref) => `${row.id}-${row.link_id ?? "source"}`;
export const evidenceReviewHref = (row: Ref) => `/review#evidence-${evidenceReviewKey(row)}`;

export function parseReviewTarget(hash: string): ReviewTarget | null {
  const match = /^#evidence-(\d+)(?:-(source|\d+))?$/.exec(hash);
  if (!match) return null;
  const id = Number(match[1]);
  const linkId = match[2] === undefined ? undefined : match[2] === "source" ? null : Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0 || (typeof linkId === "number" && (!Number.isSafeInteger(linkId) || linkId <= 0))) return null;
  return { id, linkId };
}

export function matchesReviewTarget(row: Ref, target: ReviewTarget) {
  return row.id === target.id && (target.linkId === undefined || target.linkId === row.link_id);
}

export const awaitingReview = (row: EvidenceRecord) =>
  row.is_current && (row.status === "pending_review" || row.status === "under_review");

export function inReviewScope(row: EvidenceRecord, scope: ReviewScope, reviewer: string) {
  if (scope === "pending") return awaitingReview(row);
  if (scope === "mine") return awaitingReview(row) && row.assigned_reviewer === reviewer;
  if (scope === "returned") return row.is_current && row.status === "changes_requested";
  return !awaitingReview(row) && (!!row.reviewed_at || ["accepted", "changes_requested", "rejected"].includes(row.status));
}

export function reviewRestriction(row: EvidenceRecord, reviewer: string) {
  if (!awaitingReview(row)) return "هذا الدليل ليس بانتظار قرار.";
  if (!reviewer) return "يلزم تسجيل الدخول بحساب مراجع مخوّل.";
  if (row.uploaded_by === reviewer) return "لا يمكن لمقدّم الدليل اتخاذ قرار على دليله.";
  if (row.assigned_reviewer && row.assigned_reviewer !== reviewer) return "قرار هذا الدليل متاح للمراجع المسند إليه.";
  return "";
}

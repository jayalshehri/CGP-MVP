const labels: Record<string, string> = {
  implemented: "مطبق", compliant: "ممتثل", in_progress: "قيد التنفيذ", not_started: "لم يبدأ", not_implemented: "غير مطبق", not_applicable: "غير منطبق",
  accepted: "مقبول", rejected: "مرفوض", pending_review: "بانتظار المراجعة", under_review: "قيد المراجعة", not_uploaded: "لم يرفع", uploaded: "مرفوع",
  verified: "تم التحقق", not_verified: "غير متحقق", failed: "لم يجتز", approved: "معتمد",
};
export function statusText(status: string) { return labels[status.trim().toLowerCase()] || status || "غير محدد"; }
export default function StatusBadge({ status }: { status: string }) {
  const value = status.trim().toLowerCase();
  const tone = ["rejected", "failed"].includes(value) ? "danger" : ["implemented", "compliant", "accepted", "approved", "verified"].includes(value) ? "success" : ["pending_review", "under_review", "uploaded"].includes(value) ? "info" : value === "in_progress" ? "warning" : "neutral";
  return <span className={`cgp-status cgp-status-${tone}`}><span aria-hidden="true">●</span>{statusText(status)}</span>;
}

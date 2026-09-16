const labels: Record<string, string> = {
  implemented: "مطبق كليًا", compliant: "مطبق كليًا", in_progress: "مطبق جزئيًا", not_started: "غير مطبق", not_implemented: "غير مطبق", not_applicable: "لا ينطبق",
  expired: "منتهي الصلاحية", changes_requested: "يحتاج استكمالًا", accepted: "مقبول", rejected: "مرفوض", pending_review: "بانتظار المراجعة", under_review: "قيد المراجعة", not_uploaded: "لم يرفع", uploaded: "مرفوع",
  verified: "تم التحقق", not_verified: "غير متحقق", failed: "لم يجتز", approved: "معتمد",
};
export function statusText(status: string) { return labels[status.trim().toLowerCase()] || status || "غير محدد"; }
export default function StatusBadge({ status }: { status: string }) {
  const value = status.trim().toLowerCase();
  const tone = ["rejected", "failed", "expired"].includes(value) ? "danger" : ["implemented", "compliant", "accepted", "approved", "verified"].includes(value) ? "success" : ["pending_review", "under_review", "uploaded"].includes(value) ? "info" : ["in_progress","changes_requested"].includes(value) ? "warning" : "neutral";
  return <span className={`cgp-status cgp-status-${tone}`}><span aria-hidden="true">●</span>{statusText(status)}</span>;
}

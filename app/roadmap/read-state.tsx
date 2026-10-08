import type { ReactNode } from "react";
import { combinedStatus, type ReadStatus } from "@/lib/strategy-read";

export function ReadNotice({ statuses }: { statuses: ReadStatus[] }) {
  const status = combinedStatus(...statuses);
  if (status === "COMPLETE") return null;
  return <p className="roadmap-alert" role="status" data-read-status={status}>{status === "PARTIAL"
    ? "قراءة جزئية: بعض الأجزاء غير متاحة. النتائج الظاهرة تخص المصادر المكتملة ضمن صلاحياتك فقط."
    : "غير متاح — تعذر تحميل البيانات ضمن صلاحياتك الحالية."}</p>;
}

export function ReadSection({ available, children }: { available: boolean; children: ReactNode }) {
  return available ? children : <p className="metric-unavailable" role="status">غير متاح — تعذر تحميل هذا الجزء.</p>;
}

import { missingPlanningInformation, type PlanningInformation } from "@/lib/strategy-project-fields";
import type { ReadStatus } from "@/lib/strategy-read";
import { ReadSection } from "./read-state";

export function PlanningInformationSummary({ projects, status }: { projects: PlanningInformation[]; status: ReadStatus }) {
  // Do not interpret a failed/partial project snapshot as missing business fields.
  const missing = status === "COMPLETE" ? projects.map(missingPlanningInformation) : [];
  return <section className="portfolio-card planning-information" aria-labelledby="planning-information-title">
    <header><div><span>البيانات المسجلة</span><h2 id="planning-information-title">معلومات التخطيط غير المقدّمة</h2></div></header>
    <ReadSection available={status === "COMPLETE"}>
      {projects.length === 0 ? <p>لا توجد مشاريع ضمن النطاق المقروء.</p> : <dl className="project-facts">
        <div><dt>دون مالك مسجل نصيًا</dt><dd>{missing.filter(item => item.owner).length}</dd></div>
        <div><dt>دون نتيجة مستهدفة</dt><dd>{missing.filter(item => item.outcome).length}</dd></div>
        <div><dt>دون تاريخ انتهاء مستهدف</dt><dd>{missing.filter(item => item.target).length}</dd></div>
        <div><dt>دون تاريخ انتهاء متوقع — اختياري</dt><dd>{missing.filter(item => item.forecast).length}</dd></div>
      </dl>}
      <p className="detail-hint">وصف للحقول غير المقدّمة، وليس درجة جودة أو متطلبات إلزامية جديدة. المالك المسجل نصيًا لا يثبت إسنادًا لحساب مستخدم. التقنية اختيارية بحسب نوع العمل، ولا يلزم تسجيلها لكل مشروع.</p>
    </ReadSection>
  </section>;
}

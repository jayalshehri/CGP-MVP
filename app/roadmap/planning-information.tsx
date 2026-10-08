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
        <div><dt>دون أولوية (P1/P2/P3)</dt><dd>{missing.filter(item => item.priority).length}</dd></div>
        <div><dt>دون مالك تنفيذي</dt><dd>{missing.filter(item => item.owner).length}</dd></div>
        <div><dt>دون مدة مشروع</dt><dd>{missing.filter(item => item.duration).length}</dd></div>
        <div><dt>دون نتيجة مستهدفة</dt><dd>{missing.filter(item => item.outcome).length}</dd></div>
      </dl>}
      <p className="detail-hint">وصف للحقول غير المقدّمة، وليس درجة جودة. المشاريع المسجلة بالنموذج السابق تظهر هنا دون أولوية أو مالك أو مدة حتى تُستكمل يدويًا؛ لا تُشتق هذه القيم تلقائيًا.</p>
    </ReadSection>
  </section>;
}

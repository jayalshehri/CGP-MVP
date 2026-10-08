// Management-attention rules for a portfolio scope, shared by the analysis view
// (count) and the executive summary (list) so both always agree.
import { projectCount } from "./arabic-count";
import { highTreatmentProjectsWithoutDirectLinks, type ScopedTreatment } from "./portfolio-treatments";

export type Attention = { key: string; title: string; detail: string; count: number; level: "decision" | "risk" | "data" };
type AttentionProject = { id: number; status: string; portfolio_priority: string | null; duration_value: number | string | null; duration_unit: string | null };

const hasDuration = (project: AttentionProject) => {
  const value = Number(project.duration_value);
  return project.duration_value !== null && Number.isFinite(value) && value > 0 && Boolean(project.duration_unit);
};

export function managementAttention(
  scope: readonly AttentionProject[],
  links: readonly { project_id: number }[],
  treatments: readonly ScopedTreatment[],
  ready: { links: boolean; treatments: boolean },
): Attention[] {
  const unprioritized = scope.filter((project) => !project.portfolio_priority);
  const p1WithoutDuration = scope.filter((project) => project.portfolio_priority === "P1" && !hasDuration(project));
  const stopped = scope.filter((project) => project.status === "on_hold");
  // Same scope as every other metric: projects outside it never raise alerts.
  const highWithoutLinks = highTreatmentProjectsWithoutDirectLinks(treatments, links, scope);
  const attention: Attention[] = [];
  if (unprioritized.length) attention.push({ key: "baseline", title: "اعتماد أولويات المشاريع", detail: `${projectCount(unprioritized.length)} مسجلًا بالنموذج السابق بلا أولوية P1/P2/P3، ولذلك لا يظهر في سنوات التنفيذ.`, count: unprioritized.length, level: "decision" });
  if (p1WithoutDuration.length) attention.push({ key: "duration", title: "استكمال مدد مشاريع السنة الأولى", detail: `${projectCount(p1WithoutDuration.length)} بأولوية P1 بلا مدة مسجلة.`, count: p1WithoutDuration.length, level: "data" });
  if (stopped.length) attention.push({ key: "stopped", title: "حسم المشاريع المتوقفة", detail: `${projectCount(stopped.length)} متوقفًا يحتاج قرار استئناف أو إعادة تخطيط.`, count: stopped.length, level: "decision" });
  if (ready.links && ready.treatments && highWithoutLinks.size) attention.push({ key: "mapping", title: "استكمال مواءمة المعالجات والضوابط", detail: `${projectCount(highWithoutLinks.size)} لديه معالجة عالية بلا رابط مباشر مسجّل بضابط.`, count: highWithoutLinks.size, level: "data" });
  return attention;
}

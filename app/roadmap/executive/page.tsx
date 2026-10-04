"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { projectHref } from "@/lib/strategy-navigation";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { readCanonicalPortfolio } from "@/lib/strategy-portfolio-read";
import type { RelationshipCounts } from "@/lib/strategy-relationships";
import { ReadNotice, ReadSection } from "../read-state";
import { averageProgress, getRiyadhDate, isDelayed } from "../portfolio-metrics";
import "../roadmap.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  planned_year: number;
  planned_quarter: string;
  priority: "high" | "medium" | "low";
  status: "planned" | "in_progress" | "on_hold" | "completed";
  progress_percent: number;
  target_outcome: string | null;
  target_end_date: string | null;
};
type LinkRow = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };
type Attention = { key: string; title: string; detail: string; count: number; level: "decision" | "risk" | "data" };

const priorityText = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

export default function ExecutiveRoadmapPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modern, setModern] = useState<RelationshipCounts | null>(null);
  const [reads, setReads] = useState<{ projects: ReadStatus; links: ReadStatus; treatments: ReadStatus }>({ projects: "UNAVAILABLE", links: "UNAVAILABLE", treatments: "UNAVAILABLE" });
  const projectsReady = reads.projects === "COMPLETE";
  const linksReady = projectsReady && reads.links === "COMPLETE";
  const treatmentsReady = reads.treatments === "COMPLETE";
  const exportReady = projectsReady && linksReady && treatmentsReady;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await requireProfile();
        const [projectResult, linkResult, treatmentResult, activeControlResult] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,planned_year,planned_quarter,priority,status,progress_percent,target_outcome,target_end_date", { count: "exact" }).order("planned_year").order("planned_quarter").order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_gap_treatments").select("id,project_id,priority", { count: "exact" }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
        ]);
        const modernResult = projectResult.status === "COMPLETE" ? await readCanonicalPortfolio(projectResult.data.map(row => row.id)) : null;
        if (active) {
          setReads({ projects: projectResult.status, links: linkResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" ? "COMPLETE" : "UNAVAILABLE", treatments: treatmentResult.status });
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          const visibleProjects = new Set(projectResult.data.map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => visibleProjects.has(row.project_id) && activeIds.has(row.control_id)) as LinkRow[]);
          setModern(modernResult);
          setTreatments((treatmentResult.data ?? []) as Treatment[]);
        }
      } catch (cause) {
        if (!active) return;
        const detail = cause instanceof Error ? cause.message : "تعذر تحميل العرض التنفيذي.";
        if (detail.includes("تسجيل الدخول")) {
          router.replace("/login");
          return;
        }
        setError("غير متاح — تعذر تحميل هذا الجزء.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const data = useMemo(() => {
    const linksByProject = new Map<number, number>();
    links.forEach((link) => linksByProject.set(link.project_id, (linksByProject.get(link.project_id) ?? 0) + 1));
    const years = [2027, 2028, 2029].map((year) => {
      const items = projects.filter((project) => project.planned_year === year);
      return { year, items, high: items.filter((project) => project.priority === "high").length, progress: averageProgress(items) };
    });
    const missingHighPriorityDates = projects.filter((project) => project.priority === "high" && !project.target_end_date);
    const delayedHighPriority = projects.filter((project) => project.priority === "high" && isDelayed(project));
    const stopped = projects.filter((project) => project.status === "on_hold");
    const highTreatmentsWithoutControlLinks = new Set(
      treatments
        .filter((item) => item.priority === "high" && (linksByProject.get(item.project_id) ?? 0) === 0)
        .map((item) => item.project_id),
    );
    const attention: Attention[] = [];
    if (missingHighPriorityDates.length) attention.push({ key: "baseline", title: "اعتماد خط الأساس الزمني", detail: `${missingHighPriorityDates.length} مشروعًا عالي الأولوية بلا تاريخ مستهدف، ولذلك لا يمكن قياس التأخير.`, count: missingHighPriorityDates.length, level: "decision" });
    if (delayedHighPriority.length) attention.push({ key: "delayed", title: "خطة استرداد للمشاريع المتأخرة", detail: `${delayedHighPriority.length} مشروعًا عالي الأولوية تجاوز التاريخ المستهدف.`, count: delayedHighPriority.length, level: "risk" });
    if (stopped.length) attention.push({ key: "stopped", title: "حسم المشاريع المتوقفة", detail: `${stopped.length} مشروعًا متوقفًا يحتاج قرار استئناف أو إعادة تخطيط.`, count: stopped.length, level: "decision" });
    if (linksReady && treatmentsReady && highTreatmentsWithoutControlLinks.size) attention.push({ key: "mapping", title: "استكمال مواءمة المعالجات والضوابط", detail: `${highTreatmentsWithoutControlLinks.size} مشروعًا لديه معالجة عالية بلا رابط مباشر مسجّل بضابط.`, count: highTreatmentsWithoutControlLinks.size, level: "data" });
    return {
      years,
      high: projects.filter((project) => project.priority === "high").length,
      controls: new Set(links.map((link) => link.control_id)).size,
      average: averageProgress(projects),
      attention,
      delayed: projects.filter((project) => isDelayed(project)).length,
      hasSchedule: projects.some((project) => Boolean(project.target_end_date)),
    };
  }, [projects, links, treatments, linksReady, treatmentsReady]);

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري إعداد العرض التنفيذي…</p></main>;
  }

  return (
    <main className="roadmap-page executive-board" dir="rtl">
      <section className="roadmap-shell">
        <header className="executive-hero"><div><span>عرض الإدارة العليا · 2027–2029</span><h1>ملخص محفظة المشاريع السيبرانية</h1><p>الحالات والتقدم المسجّل للمشاريع وفئات التنبيه الإداري الحالية.</p></div><aside><button type="button" disabled={!exportReady} title={!exportReady ? "التصدير غير متاح حتى تكتمل القراءات" : undefined} onClick={() => { if (exportReady) window.print(); }}>تصدير PDF</button><Link href="/roadmap/dashboard">العودة إلى خارطة طريق المشاريع ←</Link></aside></header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, reads.treatments, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <section className="executive-kpis">
          <Kpi label="المشاريع السيبرانية" value={projectsReady ? projects.length : unavailable} detail="ضمن الخطة الثلاثية" />
          <Kpi label="متوسط تقدم المشاريع المسجّل" value={projectsReady ? `${data.average}%` : unavailable} detail="متوسط غير مرجح من المشاريع" tone="teal" />
          <Kpi label="المشاريع المتأخرة" value={projectsReady ? (data.hasSchedule ? data.delayed : "بيانات غير كافية") : unavailable} detail={!projectsReady ? "تعذر قراءة التواريخ" : data.hasSchedule ? `حتى ${getRiyadhDate()}` : "التواريخ المستهدفة غير مكتملة"} tone="amber" />
          <Kpi label="فئات التنبيه الإداري" value={exportReady ? data.attention.length : unavailable} detail="عدد فئات القواعد المتحققة، لا عدد المشاريع أو القرارات" tone="blue" />
        </section>

        <ReadSection available={projectsReady}><section className="executive-section"><header><span>التقدم المسجّل بحسب السنة</span><h2>توزيع المشاريع بحسب السنة</h2><p>يعرض الحالة الحالية من سجل المشاريع، ولا يعتبر ربط الضابط تحققًا للالتزام.</p></header><div className="executive-timeline">{data.years.map((year) => <article key={year.year}><header><b>{year.year}</b><span>{year.items.length} مشاريع</span></header><div className="executive-progress"><i style={{ width: `${year.progress}%` }} /></div><small>{year.progress}% متوسط تقدم المشاريع المسجّل · {year.high} عالية الأولوية</small><ul>{year.items.slice(0, 5).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><Link className="strategy-project-link" href={projectHref(project.id, "executive")}>{project.name_ar}</Link><em className={project.priority}>{priorityText[project.priority]}</em></li>)}</ul></article>)}</div></section></ReadSection>

        <section className="executive-focus-grid">
          <ReadSection available={projectsReady}><article className="executive-section"><header><span>المشاريع السيبرانية</span><h2>أعلى الأولويات الحالية</h2><p>تعكس الأولوية الإدارية المسجلة، وليس درجة Portfolio Score.</p></header><ol>{projects.filter((project) => project.priority === "high").slice(0, 5).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><Link className="strategy-project-link" href={projectHref(project.id, "executive")}>{project.name_ar}</Link><small>{project.planned_year} · {project.planned_quarter}</small></li>)}</ol></article></ReadSection>
          <article className="executive-section"><header><span>NCA والضوابط</span><h2>ضوابط ذات ربط مباشر مسجّل</h2><p>ضوابط من سجل الربط المباشر بالمشاريع، دون دمج علاقات المتطلبات. الربط لا يعني الامتثال أو إغلاق الفجوة.</p></header><strong className="executive-big-number">{linksReady ? data.controls : unavailable}</strong><Link href="/roadmap">مراجعة الروابط ←</Link></article>
          <article className="executive-section"><header><span>العلاقات عبر المتطلبات</span><h2>ضوابط مميزة مرتبطة بالمشاريع عبر المتطلبات</h2><p>حالة الربط ضمن نطاق القراءة، دون استنتاج أثر المشروع أو امتثال الضابط. لا تضاف إلى الروابط المباشرة الموروثة.</p></header><strong className="executive-big-number">{modern?.controls ?? unavailable}</strong><Link href="/roadmap">تفاصيل العلاقات ←</Link></article>
        </section>

        <section className="executive-decisions dynamic-attention"><header><span>Dynamic Management Attention</span><h2>ما الذي يحتاج انتباه الإدارة؟</h2><p>تظهر العناصر من قواعد بيانات قابلة للتتبع؛ لا توجد قيمة دنيا مصطنعة.</p></header><ReadSection available={projectsReady}>{!exportReady && <p className="metric-unavailable">بعض قواعد التنبيه غير متاحة؛ لا يمكن تأكيد خلو المحفظة من التنبيهات.</p>}{data.attention.length ? data.attention.map((item, index) => <article key={item.key} className={item.level}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.detail}</p></div><em>{item.count}</em></article>) : exportReady ? <article className="attention-empty"><div><strong>لا توجد فئات تنبيه وفق القواعد الحالية</strong><p>سيظهر هنا أي تأخير أو توقف أو نقص في خط الأساس عند تسجيله.</p></div></article> : null}</ReadSection></section>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

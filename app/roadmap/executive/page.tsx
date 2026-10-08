"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { projectHref } from "@/lib/strategy-navigation";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows, unavailable, type ReadStatus } from "@/lib/strategy-read";
import { readCanonicalEdges, type CanonicalEdges } from "@/lib/strategy-portfolio-read";
import { projectCount } from "@/lib/arabic-count";
import { ReadNotice, ReadSection } from "../read-state";
import { averageProgress } from "../portfolio-metrics";
import { durationLabel, executionYearFor, executionYearText, executionYears, isArchived, scopedRequirementCounts, type PortfolioFields } from "@/lib/portfolio-analytics";
import { managementAttention } from "@/lib/portfolio-attention";
import "../roadmap.css";

type Project = PortfolioFields & {
  id: number;
  project_code: string;
  name_ar: string;
  status: "planned" | "in_progress" | "on_hold" | "completed";
  progress_percent: number;
  target_outcome: string | null;
};
type LinkRow = { project_id: number; control_id: number };
type Treatment = { project_id: number; priority: "high" | "medium" | "low" };


export default function ExecutiveRoadmapPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canonical, setCanonical] = useState<CanonicalEdges | null>(null);
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
          readStrategyRows((from, to) => supabase.from("cybersecurity_projects").select("id,project_code,name_ar,status,progress_percent,target_outcome,portfolio_priority,execution_year,work_type,executive_owner_code,executive_owner_other,duration_value,duration_unit,archived_at", { count: "exact" }).order("portfolio_priority", { nullsFirst: false }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_controls").select("project_id,control_id", { count: "exact" }).order("project_id").order("control_id").range(from, to), row => `${row.project_id}:${row.control_id}`),
          readStrategyRows((from, to) => supabase.from("cybersecurity_project_gap_treatments").select("id,project_id,priority", { count: "exact" }).order("id").range(from, to), row => row.id),
          readStrategyRows((from, to) => supabase.from("controls").select("id,frameworks!inner(is_active)", { count: "exact" }).eq("frameworks.is_active",true).order("id").range(from, to), row => row.id),
        ]);
        const edges = projectResult.status === "COMPLETE" ? await readCanonicalEdges() : null;
        if (active) {
          setReads({ projects: projectResult.status, links: linkResult.status === "COMPLETE" && activeControlResult.status === "COMPLETE" ? "COMPLETE" : "UNAVAILABLE", treatments: treatmentResult.status });
          const activeIds = new Set((activeControlResult.data ?? []).map(row => row.id));
          const visibleProjects = new Set(projectResult.data.map(row => row.id));
          setProjects((projectResult.data ?? []) as Project[]);
          setLinks((linkResult.data ?? []).filter(row => visibleProjects.has(row.project_id) && activeIds.has(row.control_id)) as LinkRow[]);
          setCanonical(edges);
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
    // Executive view covers the active (non-archived) portfolio only.
    const active = projects.filter((project) => !isArchived(project));
    const years = executionYears.map((year) => {
      const items = active.filter((project) => executionYearFor(project.portfolio_priority) === year);
      return { year, items, progress: averageProgress(items) };
    });
    // Shared rules (lib/portfolio-attention.ts): the analysis view counts the same list.
    const attention = managementAttention(active, links, treatments, { links: linksReady, treatments: treatmentsReady });
    const activeIds = new Set(active.map((project) => project.id));
    return {
      active,
      years,
      p1: active.filter((project) => project.portfolio_priority === "P1"),
      controls: new Set(links.filter((link) => activeIds.has(link.project_id)).map((link) => link.control_id)).size,
      average: averageProgress(active),
      attention,
    };
  }, [projects, links, treatments, linksReady, treatmentsReady]);
  // Requirement-derived controls for the same active portfolio the page shows.
  const modern = useMemo(() => scopedRequirementCounts(canonical, data.active), [canonical, data.active]);

  if (loading) {
    return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري إعداد العرض التنفيذي…</p></main>;
  }

  return (
    <main className="roadmap-page executive-board" dir="rtl">
      <section className="roadmap-shell">
        <header className="executive-hero"><div><span>عرض الإدارة العليا · خطة ثلاث سنوات</span><h1>ملخص محفظة المشاريع السيبرانية</h1><p>الحالات والتقدم المسجّل للمشاريع وفئات التنبيه الإداري الحالية.</p></div><aside><button type="button" disabled={!exportReady} title={!exportReady ? "التصدير غير متاح حتى تكتمل القراءات" : undefined} onClick={() => { if (exportReady) window.print(); }}>تصدير PDF</button><Link href="/roadmap/dashboard">العودة إلى خارطة طريق المشاريع ←</Link></aside></header>
        {error && <p className="roadmap-alert" role="alert">{error}</p>}
        <ReadNotice statuses={[reads.projects, reads.links, reads.treatments, modern ? "COMPLETE" : "UNAVAILABLE"]} />

        <section className="executive-kpis">
          <Kpi label="المشاريع السيبرانية" value={projectsReady ? data.active.length : unavailable} detail="المحفظة النشطة (غير المؤرشفة)" />
          <Kpi label="متوسط تقدم المشاريع المسجّل" value={projectsReady ? `${data.average}%` : unavailable} detail="متوسط غير مرجح من المشاريع" tone="teal" />
          <Kpi label="مشاريع الأولوية P1" value={projectsReady ? data.p1.length : unavailable} detail="السنة الأولى من خطة التنفيذ" tone="amber" />
          <Kpi label="فئات التنبيه الإداري" value={exportReady ? data.attention.length : unavailable} detail="عدد فئات القواعد المتحققة، لا عدد المشاريع أو القرارات" tone="blue" />
        </section>

        <ReadSection available={projectsReady}><section className="executive-section"><header><span>التقدم المسجّل بحسب سنة التنفيذ</span><h2>توزيع المشاريع بحسب سنة التنفيذ</h2><p>يعرض الحالة الحالية من سجل المشاريع، ولا يعتبر ربط الضابط تحققًا للالتزام.</p></header><div className="executive-timeline">{data.years.map((year) => <article key={year.year}><header><b>{executionYearText[year.year]}</b><span>{projectCount(year.items.length)}</span></header><div className="executive-progress"><i style={{ width: `${year.progress}%` }} /></div><small>{year.progress}% متوسط تقدم المشاريع المسجّل · أولوية P{year.year}</small><ul>{year.items.slice(0, 5).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><Link className="strategy-project-link" href={projectHref(project.id, "executive")}>{project.name_ar}</Link><em className={project.portfolio_priority ?? ""}>{project.portfolio_priority}</em></li>)}</ul></article>)}</div></section></ReadSection>

        <section className="executive-focus-grid">
          <ReadSection available={projectsReady}><article className="executive-section"><header><span>المشاريع السيبرانية</span><h2>مشاريع الأولوية P1</h2><p>تعكس الأولوية المسجلة، وليس درجة Portfolio Score.</p></header><ol>{data.p1.slice(0, 5).map((project) => <li key={project.id}><b dir="ltr">{project.project_code}</b><Link className="strategy-project-link" href={projectHref(project.id, "executive")}>{project.name_ar}</Link><small>{executionYearText[1]} · {durationLabel(project) ?? "مدة غير محددة"}</small></li>)}</ol></article></ReadSection>
          <article className="executive-section"><header><span>NCA والضوابط</span><h2>ضوابط ذات ربط مباشر مسجّل</h2><p>ضوابط من سجل الربط المباشر بالمشاريع، دون دمج علاقات المتطلبات. الربط لا يعني الامتثال أو إغلاق الفجوة.</p></header><strong className="executive-big-number">{linksReady ? data.controls : unavailable}</strong><Link href="/roadmap">مراجعة الروابط ←</Link></article>
          <article className="executive-section"><header><span>العلاقات عبر المتطلبات</span><h2>ضوابط مميزة مرتبطة بالمشاريع عبر المتطلبات</h2><p>للمحفظة النشطة فقط، دون استنتاج أثر المشروع أو امتثال الضابط. منفصلة عن الروابط المباشرة ولا تُجمع معها.</p></header><strong className="executive-big-number">{modern?.controls ?? unavailable}</strong><Link href="/roadmap">تفاصيل العلاقات ←</Link></article>
        </section>

        <section className="executive-decisions dynamic-attention"><header><span>Dynamic Management Attention</span><h2>ما الذي يحتاج انتباه الإدارة؟</h2><p>تظهر العناصر من قواعد بيانات قابلة للتتبع؛ لا توجد قيمة دنيا مصطنعة.</p></header><ReadSection available={projectsReady}>{!exportReady && <p className="metric-unavailable">بعض قواعد التنبيه غير متاحة؛ لا يمكن تأكيد خلو المحفظة من التنبيهات.</p>}{data.attention.length ? data.attention.map((item, index) => <article key={item.key} className={item.level}><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{item.title}</strong><p>{item.detail}</p></div><em>{item.count}</em></article>) : exportReady ? <article className="attention-empty"><div><strong>لا توجد فئات تنبيه وفق القواعد الحالية</strong><p>سيظهر هنا أي توقف أو نقص في الأولويات أو المدد عند تسجيله.</p></div></article> : null}</ReadSection></section>
      </section>
    </main>
  );
}

function Kpi({ label, value, detail, tone = "" }: { label: string; value: string | number; detail: string; tone?: string }) {
  return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import "../roadmap.css";
import "@/app/controls/[id]/detail.css";

type Project = {
  id: number;
  project_code: string;
  name_ar: string;
  description_ar: string | null;
  status: string;
  priority: string;
  initiative_type: string;
  executive_owner: string | null;
  progress_percent: number;
  target_end_date: string | null;
};

type Requirement = { id: number; requirement_code: string; title_ar: string; status: string };
type ProjectRequirement = {
  project_id: number;
  requirement_id: number;
  coverage_type: "full" | "partial" | "supporting";
  cybersecurity_requirements: Requirement | Requirement[] | null;
};
type ControlRow = {
  id: number;
  control_code: string;
  title_ar: string;
  implementation_status: string;
  evidence_status: string;
  verification_status: string;
  frameworks: { code: string } | { code: string }[] | null;
};
type RequirementControl = {
  requirement_id: number;
  control_id: number;
  coverage_type: "full" | "partial" | "supporting";
  controls: ControlRow | ControlRow[] | null;
};

const tabs = ["نظرة عامة", "المتطلبات", "الضوابط", "الأدلة", "سجل التدقيق"];
const initiativeTypeText: Record<string, string> = {
  technology_project: "مشروع تقني",
  managed_service: "خدمة مُدارة",
  framework_agreement: "اتفاقية إطارية",
  internal_program: "برنامج داخلي",
  policy_governance: "سياسة وحوكمة",
  assessment: "تقييم",
  continuous_activity: "نشاط مستمر",
};
const coverageText: Record<string, string> = { full: "كامل", partial: "جزئي", supporting: "داعم" };
const statusText: Record<string, string> = { planned: "مخطط", in_progress: "قيد التنفيذ", on_hold: "متوقف", completed: "مكتمل" };
const priorityText: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const goodVerification = (value: string) => value === "verified";
const single = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [projectRequirements, setProjectRequirements] = useState<ProjectRequirement[]>([]);
  const [requirementControls, setRequirementControls] = useState<RequirementControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await requireProfile();
        if (!active) return;
        const projectId = Number(id);
        if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error("رقم المشروع غير صحيح.");
        const [p, pr] = await Promise.all([
          supabase.from("cybersecurity_projects").select("*").eq("id", projectId).single(),
          supabase
            .from("cybersecurity_project_requirements")
            .select("project_id,requirement_id,coverage_type,cybersecurity_requirements(id,requirement_code,title_ar,status)")
            .eq("project_id", projectId),
        ]);
        if (p.error || !p.data) throw new Error("المشروع غير موجود أو ليس ضمن صلاحيتك.");
        if (pr.error) throw new Error("تعذر تحميل متطلبات المشروع.");
        if (!active) return;
        setProject(p.data as Project);
        const rows = (pr.data ?? []) as unknown as ProjectRequirement[];
        setProjectRequirements(rows);
        const requirementIds = rows.map((row) => row.requirement_id);
        if (requirementIds.length) {
          const rc = await supabase
            .from("cybersecurity_requirement_controls")
            .select("requirement_id,control_id,coverage_type,controls(id,control_code,title_ar,implementation_status,evidence_status,verification_status,frameworks(code))")
            .in("requirement_id", requirementIds);
          if (rc.error) throw new Error("تعذر تحميل الضوابط المشتقة من المتطلبات.");
          if (active) setRequirementControls((rc.data ?? []) as unknown as RequirementControl[]);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر التحميل");
        const { data } = await supabase.auth.getSession();
        if (!data.session) router.replace("/login");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  const requirementsWithStats = useMemo(
    () =>
      projectRequirements.map((pr) => {
        const requirement = single(pr.cybersecurity_requirements);
        const links = requirementControls.filter((rc) => rc.requirement_id === pr.requirement_id);
        const verifiedCount = links.filter((rc) => {
          const control = single(rc.controls);
          return control && goodVerification(control.verification_status);
        }).length;
        return { requirement, coverage: pr.coverage_type, controlsCount: links.length, verifiedCount };
      }),
    [projectRequirements, requirementControls],
  );

  const derivedControls = useMemo(() => {
    const rows: Array<{ requirementCode: string; coverage: string; control: ControlRow }> = [];
    for (const rc of requirementControls) {
      const control = single(rc.controls);
      if (!control) continue;
      const requirement = requirementsWithStats.find((item) => item.requirement?.id === rc.requirement_id)?.requirement;
      rows.push({ requirementCode: requirement?.requirement_code ?? "—", coverage: rc.coverage_type, control });
    }
    return rows;
  }, [requirementControls, requirementsWithStats]);

  const uniqueControls = useMemo(() => {
    const seen = new Map<number, ControlRow>();
    for (const row of derivedControls) if (!seen.has(row.control.id)) seen.set(row.control.id, row.control);
    return Array.from(seen.values());
  }, [derivedControls]);

  const rollup = useMemo(() => {
    // Full/Partial/Supporting is a breakdown of the LINKED CONTROLS by
    // requirement<->control coverage_type — not the project<->requirement
    // coverage (which is a separate, usually coarser, single value per
    // requirement). One control can appear once per requirement it serves;
    // dedupe by control id so a control isn't double-counted.
    const seenForCoverage = new Set<number>();
    const coverageRows = derivedControls.filter((row) => {
      if (seenForCoverage.has(row.control.id)) return false;
      seenForCoverage.add(row.control.id);
      return true;
    });
    const full = coverageRows.filter((row) => row.coverage === "full").length;
    const partial = coverageRows.filter((row) => row.coverage === "partial").length;
    const supporting = coverageRows.filter((row) => row.coverage === "supporting").length;
    const readyForVerification = uniqueControls.filter((c) => c.evidence_status === "accepted" && c.verification_status !== "verified").length;
    const verified = uniqueControls.filter((c) => goodVerification(c.verification_status)).length;
    const contribution = uniqueControls.length ? Math.round((verified / uniqueControls.length) * 100) : null;
    return { requirementsCount: projectRequirements.length, totalControls: uniqueControls.length, full, partial, supporting, readyForVerification, verified, contribution };
  }, [projectRequirements, uniqueControls, derivedControls]);

  if (loading) return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري تحميل المشروع…</p></main>;
  if (error || !project) return <main className="roadmap-page" dir="rtl"><p role="alert">{error}</p><Link href="/roadmap">العودة إلى سجل المشاريع</Link></main>;

  return (
    <main className="roadmap-page" dir="rtl">
      <section className="roadmap-shell">
        <Link className="detail-back" href="/roadmap">← العودة إلى سجل المشاريع</Link>

        <header className="roadmap-hero project-register-hero">
          <div>
            <span>{initiativeTypeText[project.initiative_type] ?? project.initiative_type}</span>
            <h1><span dir="ltr">{project.project_code}</span> — {project.name_ar}</h1>
            <p>{project.description_ar || "لا يوجد وصف مسجل."}</p>
          </div>
        </header>

        <section className="roadmap-metrics register-metrics" aria-label="مؤشرات المشروع">
          <Metric label="المتطلبات" value={rollup.requirementsCount} />
          <Metric label="ضوابط مشتقة" value={rollup.totalControls} />
          <Metric label="تغطية كاملة" value={rollup.full} tone="linked" />
          <Metric label="تغطية جزئية" value={rollup.partial} tone="warning" />
          <Metric label="تغطية داعمة" value={rollup.supporting} tone="muted" />
          <Metric label="جاهزة للتحقق" value={rollup.readyForVerification} tone="active" />
          <Metric label="ضوابط مُتحقَّقة" value={rollup.verified} tone="linked" />
          <Metric label="نسبة مساهمة الامتثال" value={rollup.contribution === null ? "—" : `${rollup.contribution}%`} />
        </section>
        <p className="detail-hint">نسبة المساهمة محسوبة لحظيًا من حالة التحقق الفعلية للضوابط المرتبطة — إنجاز المشروع لا يعني امتثال الضابط.</p>

        <div className="detail-tabs" role="tablist" aria-label="تفاصيل المشروع">
          {tabs.map((label, index) => (
            <button key={label} role="tab" aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}>
              {label}
            </button>
          ))}
        </div>

        <section className="detail-columns">
          <div className="detail-content">
            {tab === 0 && (
              <section className="detail-card">
                <h2>نظرة عامة</h2>
                <p>الحالة: {statusText[project.status] ?? project.status} · الأولوية: {priorityText[project.priority] ?? project.priority}</p>
                <p>المالك التنفيذي: {project.executive_owner || "غير محدد"}</p>
                <p>نسبة الإنجاز: {project.progress_percent}% · الموعد المستهدف: {project.target_end_date || "غير محدد"}</p>
              </section>
            )}

            {tab === 1 && (
              <section className="detail-card">
                <h2>المتطلبات المرتبطة</h2>
                {!requirementsWithStats.length && <p>لا توجد متطلبات مرتبطة بهذا المشروع بعد.</p>}
                {requirementsWithStats.map(
                  (item) =>
                    item.requirement && (
                      <article className="control-evidence-item" key={item.requirement.id}>
                        <b dir="ltr">{item.requirement.requirement_code}</b> — {item.requirement.title_ar}
                        <p>
                          التغطية: {coverageText[item.coverage] ?? item.coverage} · الضوابط: {item.controlsCount} · تحقق: {item.verifiedCount}/{item.controlsCount}
                        </p>
                      </article>
                    ),
                )}
              </section>
            )}

            {tab === 2 && (
              <section className="detail-card">
                <h2>الضوابط المشتقة من المتطلبات</h2>
                {!derivedControls.length && <p>لا توجد ضوابط مشتقة بعد.</p>}
                {derivedControls.map((row, index) => {
                  const framework = single(row.control.frameworks);
                  return (
                    <article className="control-evidence-item" key={`${row.control.id}-${index}`}>
                      <small>متطلب: <span dir="ltr">{row.requirementCode}</span> · تغطية: {coverageText[row.coverage] ?? row.coverage}</small>
                      <h3><Link href={`/controls/${row.control.id}`}><span dir="ltr">{framework?.code} · {row.control.control_code}</span> — {row.control.title_ar}</Link></h3>
                      <p>
                        التطبيق: <StatusBadge status={row.control.implementation_status} /> · الدليل: <StatusBadge status={row.control.evidence_status} /> · التحقق: <StatusBadge status={row.control.verification_status} />
                      </p>
                    </article>
                  );
                })}
              </section>
            )}

            {tab === 3 && (
              <section className="detail-card">
                <h2>الأدلة</h2>
                <p className="detail-hint">يُستخدم سجل الأدلة والمراجعة الحالي كما هو — لا مسار رفع أو مراجعة جديد هنا. افتح الضابط لإدارة دليله.</p>
                {!uniqueControls.length && <p>لا توجد ضوابط مرتبطة بعد.</p>}
                {uniqueControls.map((control) => (
                  <article className="control-evidence-item" key={control.id}>
                    <b dir="ltr">{control.control_code}</b> — {control.title_ar}
                    <p>حالة الدليل: <StatusBadge status={control.evidence_status} /></p>
                    <Link className="detail-back" href={`/controls/${control.id}`}>فتح الأدلة والمراجعة ←</Link>
                  </article>
                ))}
              </section>
            )}

            {tab === 4 && (
              <section>
                {!uniqueControls.length && <section className="detail-card"><p>لا توجد ضوابط مرتبطة، لا يوجد سجل تدقيق مرتبط بعد.</p></section>}
                {uniqueControls.map((control) => (
                  <details className="control-evidence-item" key={control.id} open={uniqueControls.length === 1}>
                    <summary dir="ltr">{control.control_code} — {control.title_ar}</summary>
                    <GrcAuditTrail controlId={control.id} />
                  </details>
                ))}
              </section>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <article className={`roadmap-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

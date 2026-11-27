"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DailyOperationsTabs from "@/components/DailyOperationsTabs";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import { requireProfile } from "@/lib/auth";
import { frameworkOf } from "@/lib/compliance";
import { controlHeading } from "@/lib/control-presentation";
import { riyadhIsoDate } from "@/lib/dates";
import { compareOperationalDueDates, isCriticalOperationalRisk, isRiskTreatmentOverdue, matchesTaskFilter, type TaskFilter } from "@/lib/operations-followup";
import { supabase } from "@/lib/supabase";
import "./alerts.css";

type Control = {
  id: number; control_code: string; title_ar: string; control_owner_id: string | null;
  due_date: string | null; evidence_status: string; implementation_status: string; frameworks: unknown;
};
type Risk = {
  id: number; risk_code: string; risk_description: string; residual_score: number;
  action_due_date: string | null; treatment_owner: string; risk_status: string;
};
type Notice = { key: string; title: string; detail: string; href: string };
type Group = { key: string; tone: "danger" | "warning"; title: string; description: string; href: string; items: Notice[] };

function controlNotice(control: Control, action: boolean): Notice {
  const { code } = frameworkOf(control.frameworks);
  return {
    key: `control:${control.id}`,
    title: controlHeading(code, control.control_code, control.title_ar),
    detail: `${code} · ${control.control_code}${control.due_date ? ` · استحقاق ${control.due_date}` : ""}`,
    href: `/controls/${control.id}${action ? "/assign" : ""}`,
  };
}

function riskNotice(risk: Risk, detail: string): Notice {
  return { key: `risk:${risk.id}`, title: risk.risk_description, detail: `${risk.risk_code} · ${detail}`, href: `/risks?risk=${risk.id}` };
}

export default function AlertsPage() {
  const router = useRouter();
  const [controls, setControls] = useState<Control[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        await requireProfile(["admin", "cybersecurity_team"]);
      } catch {
        if (live) router.replace("/");
        return;
      }
      try {
        const [c, r] = await Promise.all([
          supabase.from("controls").select("id,control_code,title_ar,control_owner_id,due_date,evidence_status,implementation_status,frameworks!inner(code,is_active)").eq("frameworks.is_active", true),
          supabase.from("cyber_risks").select("id,risk_code,risk_description,residual_score,action_due_date,treatment_owner,risk_status"),
        ]);
        if (c.error) throw c.error;
        if (r.error) throw r.error;
        if (live) { setControls((c.data ?? []) as Control[]); setRisks((r.data ?? []) as Risk[]); }
      } catch {
        if (live) setError("تعذر تحميل التنبيهات. حدّث الصفحة للمحاولة مرة أخرى.");
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => { live = false; };
  }, [router]);

  const now = riyadhIsoDate();
  const groups = useMemo<Group[]>(() => {
    const sorted = [...controls].sort((a, b) => compareOperationalDueDates(a.due_date, b.due_date) || a.id - b.id);
    const notices = (filter: TaskFilter) => sorted.filter(control => matchesTaskFilter(control, filter, now)).map(control => controlNotice(control, filter === "unassigned"));
    const critical = risks.filter(isCriticalOperationalRisk).sort((a, b) => b.residual_score - a.residual_score || a.id - b.id);
    const overdue = risks.filter(risk => isRiskTreatmentOverdue(risk, now)).sort((a, b) => compareOperationalDueDates(a.action_due_date, b.action_due_date) || a.id - b.id);
    return [
      { key: "critical", tone: "danger", title: "مخاطر حرجة مفتوحة", description: "مخاطر بدرجة متبقية 17 فأعلى وما زالت قيد المتابعة.", href: "/risks?filter=critical", items: critical.map(risk => riskNotice(risk, `الدرجة المتبقية ${risk.residual_score}/25`)) },
      { key: "overdue", tone: "danger", title: "تكليفات متأخرة", description: "ضوابط تجاوزت موعد الاستحقاق ولم يكتمل تنفيذها.", href: "/tasks?filter=overdue", items: notices("overdue") },
      { key: "risk-actions", tone: "danger", title: "معالجات مخاطر متأخرة", description: "إجراءات معالجة مفتوحة تجاوزت موعدها.", href: "/risks?filter=overdue", items: overdue.map(risk => riskNotice(risk, `${risk.treatment_owner} · استحقاق ${risk.action_due_date}`)) },
      { key: "unassigned", tone: "warning", title: "ضوابط بلا مالك", description: "ضوابط لم تُسند إلى حساب مالك في المنصة.", href: "/tasks?filter=unassigned", items: notices("unassigned") },
      { key: "evidence", tone: "warning", title: "أدلة تحتاج استكمالًا", description: "ضوابط لم يُرفع لها دليل أو تحتاج تحديث الدليل.", href: "/tasks?filter=evidence", items: notices("evidence") },
    ];
  }, [controls, risks, now]);

  if (loading) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل التنبيهات…</main>;
  const active = groups.find(group => group.key === selected) ?? groups.find(group => group.items.length > 0) ?? groups[0];
  const uniqueItems = new Set(groups.flatMap(group => group.items.map(item => item.key))).size;
  const criticalCount = groups.find(group => group.key === "critical")?.items.length ?? 0;
  return (
    <main className="workflow-page" dir="rtl">
      <WorkflowHeading title="المتابعة اليومية" description="تابع التكليفات والتنبيهات التي تتطلب إجراءً." />
      <DailyOperationsTabs current="alerts" />
      {error ? <p className="cgp-shell-error" role="alert">{error}</p> : <>
        <div className="workflow-metrics">
          <WorkflowMetric label="سجلات تحتاج متابعة" value={uniqueItems} />
          <WorkflowMetric label="مخاطر حرجة مفتوحة" value={criticalCount} tone={criticalCount ? "danger" : "neutral"} />
        </div>
        <section className="alert-groups" aria-label="أنواع التنبيهات">
          {groups.map(group => (
            <button type="button" key={group.key} onClick={() => setSelected(group.key)} aria-pressed={group.key === active.key} className={`alert-group-card ${group.items.length ? group.tone : ""} ${group.key === active.key ? "selected" : ""}`}>
              <span>{group.title}</span><strong>{group.items.length}</strong>
            </button>
          ))}
        </section>
        <section className="alerts-list" aria-label={active.title}>
          <div className="alerts-list-head">
            <div><h2>{active.title}</h2><p>{active.description}</p></div>
            {active.items.length > 0 && <Link href={active.href}>عرض القائمة ←</Link>}
          </div>
          {active.items.length === 0 ? <div className="workflow-empty">لا توجد عناصر ضمن هذا التنبيه حاليًا.</div> : active.items.slice(0, 10).map(item => (
            <Link key={item.key} href={item.href} className={`alert-item ${active.tone}`}>
              <div><b>{item.title}</b><p>{item.detail}</p></div><span aria-hidden="true">فتح ←</span>
            </Link>
          ))}
          {active.items.length > 10 && <p className="alerts-more">عرض أول 10 من {active.items.length}.</p>}
        </section>
      </>}
    </main>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { readStrategyRows } from "@/lib/strategy-read";
import { supabase } from "@/lib/supabase";
import type { Assignment, Requirement } from "./NudeeReport";
import styles from "./nudee-dashboard.module.css";

const NudeeReport = dynamic(() => import("./NudeeReport"), {
  loading: () => <p role="status">جارٍ تحميل التقرير…</p>,
});
const number = new Intl.NumberFormat("ar-SA");
const dateTime = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
});
const auditLabels: Record<string, string> = {
  assigned: "إسناد متطلب", submitted: "تقديم دليل للمراجعة",
  changes_requested: "طلب تعديل الدليل", approved: "اعتماد دليل",
};
type AuditEvent = { id: number; assignment_id: number; action: string; created_at: string };
type HomeRequirement = Pick<Requirement, "id" | "evidence_name">;
type OfficeData = { records: HomeRequirement[]; assignments: Assignment[] };

function RecentActivity({ names }: { names: Map<number, string> }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await supabase.from("nudee_audit").select("id,assignment_id,action,created_at")
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5);
        if (result.error) throw result.error;
        if (active) setEvents(result.data ?? []);
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  return <section className={styles.homePanel} aria-labelledby="recent-title">
    <h2 id="recent-title">آخر نشاط للتكليفات</h2>
    {failed ? <div><p role="alert">تعذر تحميل سجل النشاط.</p>
      <button type="button" className={styles.secondaryButton} onClick={() => { setFailed(false); setAttempt(a => a + 1); }}>إعادة المحاولة</button></div>
      : !events ? <p role="status">جارٍ تحميل النشاط…</p>
      : !events.length ? <p>لا توجد إجراءات مسجلة على التكليفات بعد.</p>
      : <ol className={styles.auditList}>{events.map(event =>
        <li key={event.id}><strong>{auditLabels[event.action] ?? "تحديث التكليف"}</strong>
          <span>{names.get(event.assignment_id) || `التكليف رقم ${number.format(event.assignment_id)}`}</span>
          <time dateTime={event.created_at}>{dateTime.format(new Date(event.created_at))}</time>
        </li>)}</ol>}
  </section>;
}

function OfficeSummary({ records, assignments }: OfficeData) {
  const [reportStarted, setReportStarted] = useState(false);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Riyadh" });
  const summary = useMemo(() => {
    const byRequirement = new Map(assignments.map(a => [a.requirement_id, a]));
    const names = new Map<number, string>();
    let inProgress = 0, submitted = 0, approved = 0, unassigned = 0, overdue = 0;
    for (const r of records) {
      const a = byRequirement.get(r.id);
      if (!a) { unassigned++; continue; }
      names.set(a.id, r.evidence_name);
      if (a.status === "submitted") submitted++;
      if (a.status === "approved") approved++;
      if (a.status === "assigned" || a.status === "changes_requested") {
        inProgress++;
        if (a.due_date && a.due_date < today) overdue++;
      }
    }
    return { inProgress, submitted, approved, unassigned, overdue, names };
  }, [records, assignments, today]);

  const actions = [
    { view: "unassigned", title: "إسناد المتطلبات", count: summary.unassigned },
    { view: "submitted", title: "مراجعة الأدلة المقدّمة", count: summary.submitted },
    { view: "overdue", title: "متابعة التكليفات المتأخرة", count: summary.overdue },
  ];
  return <>
    <dl className={styles.homeMetrics} aria-label="ملخص متطلبات نُضيء">
      {[
        { label: "إجمالي المتطلبات", value: records.length },
        { label: "قيد التنفيذ", value: summary.inProgress },
        { label: "بانتظار المراجعة", value: summary.submitted },
        { label: "معتمدة", value: summary.approved },
      ].map(kpi => <div key={kpi.label}><dt>{kpi.label}</dt><dd>{number.format(kpi.value)}</dd></div>)}
    </dl>
    {!records.length && <p role="status" className={styles.empty}>لم تُستورد متطلبات نُضيء بعد.</p>}
    <div className={styles.homeColumns}>
      <section className={styles.homePanel} aria-labelledby="actions-title">
        <h2 id="actions-title">إجراءات المكتب</h2>
        <ul className={styles.actionList}>{actions.map(action => <li key={action.view}>
          <Link href={`/data-governance/nudee?view=${action.view}`}>
            <span>{action.title}</span><strong>{number.format(action.count)}</strong><span aria-hidden="true">←</span>
          </Link>
        </li>)}</ul>
      </section>
      <RecentActivity names={summary.names} />
    </div>
    {!!records.length && <details className={styles.report} onToggle={event => {
      if (event.currentTarget.open) setReportStarted(true);
    }}>
      <summary>تقرير نُضيء التفصيلي</summary>
      {reportStarted && <div className={styles.reportBody}><NudeeReport assignments={assignments} /></div>}
    </details>}
  </>;
}

export default function NudeeDashboard() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await requireProfile(["admin", "data_governance_team"]);
        if (!active) return;
        const [requirements, assignments] = await Promise.all([
          readStrategyRows<HomeRequirement>((from, to) => supabase.from("nudee_requirements")
            .select("id,evidence_name", { count: "exact" }).order("id").range(from, to), r => r.id),
          readStrategyRows<Assignment>((from, to) => supabase.from("nudee_assignments")
            .select("id,requirement_id,status,due_date", { count: "exact" }).order("id").range(from, to), a => a.id),
        ]);
        if (requirements.error || assignments.error) throw new Error("تعذر تحميل متطلبات المكتب وتكليفاته.");
        if (active) setData({ records: requirements.data, assignments: assignments.data });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات المكتب.");
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  return <main className={styles.root} dir="rtl">
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>المؤشر الوطني للبيانات · نُضيء</span><h1>مكتب إدارة البيانات</h1></div>
      {data && <Link className={styles.back} href="/data-governance/nudee">عرض المتطلبات</Link>}
    </header>
    {data ? <OfficeSummary {...data} /> : error ? <div className={styles.alert}>
      <p role="alert">{error}</p>
      <button type="button" className={styles.secondaryButton} onClick={() => { setError(""); setAttempt(a => a + 1); }}>إعادة المحاولة</button>
    </div> : <p role="status">جارٍ تحميل بيانات المكتب…</p>}
  </main>;
}

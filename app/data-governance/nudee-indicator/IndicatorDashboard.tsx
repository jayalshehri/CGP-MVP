"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { formatRiyadhDate, riyadhIsoDate } from "@/lib/dates";
import { isOverdue } from "../nudee/queues";
import { useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import type { Assignment, Requirement } from "../nudee-dashboard/NudeeReport";
import shared from "../nudee-dashboard/nudee-dashboard.module.css";
import styles from "./indicator.module.css";

import CycleSummary from "./CycleSummary";
import { useSearchParams } from "next/navigation";
import { cyclesPath, evidenceLink, indicatorPath } from "./routes";
import EvidencePreparation from "./EvidencePreparation";

const NudeeRegister = dynamic(() => import("../nudee/NudeeRegister"), {
  loading: () => <p role="status">جارٍ تحميل سجل الأدلة…</p>,
});

const AssessmentFile = dynamic(() => import("./AssessmentFile"), { loading: () => <p role="status">جارٍ تحميل ملف التقييم…</p> });
const NudeeReport = dynamic(() => import("../nudee-dashboard/NudeeReport"), {
  loading: () => <p role="status">جارٍ تحميل التقرير…</p>,
});
const requirementColumns = "id,source_row,requirement_title,domain_name,standard_code,maturity_level,source_compliance,source_review_status,source_progress,schedule_indicator,planned_start,planned_end,actual_end,evidence_name,review_phase";
const number = new Intl.NumberFormat("ar-SA");
const percentage = new Intl.NumberFormat("ar-SA", { style: "percent", maximumFractionDigits: 1 });
type IndicatorRecord = Requirement & { requirement_title: string };
type Data = { records: IndicatorRecord[]; assignments: Assignment[] };
type Counts = { total: number; approved: number; submitted: number; returned: number; late: number };

function Readiness({ records, assignments }: Data) {
  const today = riyadhIsoDate();
  const { total, domains, priorities } = useMemo(() => {
    const byRequirement = new Map(assignments.map(a => [a.requirement_id, a]));
    const groups = new Map<string, Counts>();
    const emptyCounts = (): Counts => ({ total: 0, approved: 0, submitted: 0, returned: 0, late: 0 });
    const total = emptyCounts();
    const priorities: {record: IndicatorRecord; assignment: Assignment; overdue: boolean}[] = [];
    for (const record of records) {
      const group = groups.get(record.domain_name) ?? emptyCounts();
      const assignment = byRequirement.get(record.id);
      const state = assignment?.status;
      const key = state === "changes_requested" ? "returned" : state;
      const overdue = isOverdue(assignment, today);
      for (const counts of [group, total]) {
        counts.total++;
        if (key === "approved" || key === "submitted" || key === "returned") counts[key]++;
        if (overdue) counts.late++;
      }
      if (assignment && (overdue || state === "changes_requested" || state === "submitted")) {
        priorities.push({record, assignment, overdue});
      }
      groups.set(record.domain_name, group);
    }
    priorities.sort((a,b) => Number(b.overdue) - Number(a.overdue)
      || (a.assignment.due_date || "9999").localeCompare(b.assignment.due_date || "9999")
      || a.record.source_row - b.record.source_row);
    const domains = [...groups].sort(([a,x],[b,y]) => y.late-x.late || y.returned-x.returned
      || y.submitted-x.submitted || a.localeCompare(b,"ar"));
    return { total, domains, priorities: priorities.slice(0,3) };
  }, [records, assignments, today]);

  return <>
    {total.total > 0 ? <section className={styles.overview} aria-label="جاهزية الأدلة داخل المكتب">
      <article className={styles.primary}>
        <h2>نسبة الأدلة المعتمدة داخليًا</h2>
        <strong>{percentage.format(total.approved / total.total)}</strong>
        <progress value={total.approved} max={total.total} aria-label="نسبة الأدلة المعتمدة داخليًا" />
        <Link href={evidenceLink({view:"approved",layout:"list"})}>عرض المعتمد · {number.format(total.approved)} من أصل {number.format(total.total)}</Link>
      </article>
      <Link href={evidenceLink({view:"submitted",layout:"list"})} className={styles.countCard}>
        <h2>بانتظار المراجعة</h2><strong>{number.format(total.submitted)}</strong><span>عرض الأدلة المقدّمة ←</span>
      </Link>
      <Link href={evidenceLink({view:"changes_requested",layout:"list"})} className={styles.countCard}>
        <h2>معادة للتعديل</h2><strong>{number.format(total.returned)}</strong><span>عرض الأدلة المعادة ←</span>
      </Link>
    </section> : <p className={shared.empty} role="status">ستظهر جاهزية الأدلة بعد إضافة متطلبات نُضيء.</p>}
    <CycleSummary/>
    <div className={styles.workGrid}>
      <section className={styles.domains} aria-labelledby="domain-readiness">
        <h2 id="domain-readiness">جاهزية الأدلة حسب المجال</h2>
        <p className={styles.panelHint}>حتى أربعة مجالات لها تكليفات متأخرة أو أدلة تحتاج مراجعة أو تعديلًا.</p>
        {domains.some(([, c]) => c.late || c.returned || c.submitted) ?
          <ul className={styles.domainList}>{domains.filter(([, c]) => c.late || c.returned || c.submitted).slice(0,4).map(([name, counts]) =>
            <li key={name}>
              <Link className={styles.domainName} href={evidenceLink({domain:name,layout:"list"})}>{name}</Link>
              <Link href={evidenceLink({domain:name,view:"approved",layout:"list"})}>معتمد {number.format(counts.approved)} من {number.format(counts.total)}</Link>
              <progress value={counts.approved} max={counts.total} aria-label={"جاهزية أدلة "+name}/>
              <div className={styles.domainCounts}>
                <Link href={evidenceLink({domain:name,view:"overdue",layout:"list"})}>متأخر {number.format(counts.late)}</Link>
                <Link href={evidenceLink({domain:name,view:"submitted",layout:"list"})}>بانتظار المراجعة {number.format(counts.submitted)}</Link>
                <Link href={evidenceLink({domain:name,view:"changes_requested",layout:"list"})}>معاد {number.format(counts.returned)}</Link>
              </div>
            </li>)}</ul> : <p className={styles.panelHint}>لا توجد مجالات تحتاج متابعة حاليًا.</p>}
        <Link className={styles.allWork} href={evidenceLink()}>عرض كل المجالات ({number.format(domains.length)}) ←</Link>
      </section>
      <section className={styles.priorities} aria-labelledby="priority-title">
        <h2 id="priority-title">متطلبات تحتاج متابعة</h2>
        <p className={styles.panelHint}>افتح المتطلب للاطلاع على مالكه ودليله وآخر قرار.</p>
        {priorities.length ? <ul>{priorities.map(({record,assignment:a,overdue}) =>
          <li key={record.id}><Link href={evidenceLink({domain:record.domain_name,layout:"list",open:record.id})}>
            <strong>{record.evidence_name}</strong>
            <small>{record.domain_name}{a.due_date && " · "+formatRiyadhDate(a.due_date)}</small>
            <span>{overdue?"متأخر · ":""}{a.status==="submitted"?"بانتظار المراجعة":a.status==="changes_requested"?"معاد للتعديل":"بانتظار الرفع"}</span>
          </Link></li>)}</ul> : <p className={styles.panelHint}>لا توجد تكليفات متأخرة أو أدلة بانتظار المراجعة أو التعديل.</p>}
        <Link className={styles.allWork} href={evidenceLink({view:"all",layout:"list"})}>فتح سجل المتطلبات كاملًا ←</Link>
      </section>
    </div>

  </>;
}

function IndicatorData({ report = false }: { report?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const [records, assignments] = await Promise.all([
        readStrategyRows<IndicatorRecord>((from,to) => supabase.from("nudee_requirements")
          .select(requirementColumns, { count: "exact" }).order("source_row").order("id").range(from,to), row => row.id),
        readStrategyRows<Assignment>((from,to) => supabase.from("nudee_assignments")
          .select("id,requirement_id,status,updated_at,due_date", { count: "exact" }).order("id").range(from,to), row => row.id),
      ]);
      if (records.error || assignments.error) throw new Error("تعذر تحميل جاهزية أدلة المؤشر.");
      if (active) setData({ records: records.data, assignments: assignments.data });
    }
    void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل المؤشر."); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <div className={shared.alert}><p role="alert">{error}</p>
    <button type="button" className={shared.secondaryButton} onClick={() => { setError(""); setAttempt(n => n + 1); }}>إعادة المحاولة</button></div>;
  return data ? (report ? <NudeeReport {...data}/> : <Readiness {...data}/>) : <p role="status">جارٍ تحميل مؤشر نُضيء…</p>;
}

function CycleTab({ reportLink }: { reportLink: boolean }) {
  const [reportOpened, setReportOpened] = useState(reportLink);
  return <>
    <section className={styles.cycleFile} aria-labelledby="cycle-file-title">
      <h2 id="cycle-file-title">ملف التقييم وخطة التحسين</h2>
      <AssessmentFile/>
    </section>
    <details open={reportLink || undefined} className={shared.report} onToggle={e => { if (e.currentTarget.open) setReportOpened(true); }}>
      <summary>تقرير نُضيء التفصيلي</summary>
      {reportOpened && <div className={shared.reportBody}><p>يعرض التقرير بيانات السجل أو ملف الأصل حسب المصدر المختار. تجد تقارير الدورة المحفوظة ضمن لقطات الدورة المؤرخة.</p><IndicatorData report/></div>}
    </details>
  </>;
}

const tabs = [
  { id: "overview", label: "نظرة عامة", href: indicatorPath },
  { id: "evidence", label: "المجالات والأدلة", href: evidenceLink() },
  { id: "cycles", label: "دورات التقييم", href: cyclesPath },
] as const;

export default function IndicatorDashboard() {
  const search = useSearchParams();
  const requested = search.get("tab");
  const reportLink = search.get("report") === "1";
  const tab = requested === "evidence" ? "evidence" : requested === "cycles" || reportLink ? "cycles" : "overview";
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    requireProfile(["admin", "data_governance_team"]).then(() => {
      if (active) setAllowed(true);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر التحقق من صلاحية الوصول إلى المؤشر.");
    });
    return () => { active = false; };
  }, [attempt]);
  if (!allowed) return error ? <div className={shared.alert}><p role="alert">{error}</p>
    <button onClick={() => { setError(""); setAttempt(n => n + 1); }}>إعادة المحاولة</button></div> : <p role="status">جارٍ تحميل مؤشر نُضيء…</p>;
  return <>
    <nav className={styles.tabs} aria-label="تبويبات مؤشر نُضيء">
      {tabs.map(item => <Link key={item.id} href={item.href} scroll={false} aria-current={tab === item.id ? "page" : undefined}>{item.label}</Link>)}
    </nav>
    {tab === "overview" && <IndicatorData/>}
    {tab === "evidence" && <NudeeRegister embedded renderPreparation={(records, domain) => <EvidencePreparation key={domain} records={records} domain={domain}/>}/>}
    {tab === "cycles" && <CycleTab key={String(reportLink)} reportLink={reportLink}/>}
  </>;
}

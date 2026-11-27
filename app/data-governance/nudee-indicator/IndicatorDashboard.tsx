"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { formatRiyadhDate, riyadhIsoDate } from "@/lib/dates";
import { isOverdue } from "../nudee/queues";
import { useEffect, useMemo, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import type { Assignment, Requirement } from "../nudee-dashboard/NudeeReport";
import shared from "../nudee-dashboard/nudee-dashboard.module.css";
import styles from "./indicator.module.css";

import CycleSummary from "./CycleSummary";
import QuestionOverview from "./QuestionOverview";
import SourceReference from "../nudee/SourceReference";

const AssessmentFile = dynamic(() => import("./AssessmentFile"));
const QuestionPreparation = dynamic(() => import("./QuestionPreparation"));
const NudeeReport = dynamic(() => import("../nudee-dashboard/NudeeReport"), {
  loading: () => <p role="status">جارٍ تحميل التقرير…</p>,
});
const requirementColumns = "id,source_row,requirement_title,domain_name,standard_code,maturity_level,source_compliance,source_review_status,source_progress,schedule_indicator,planned_start,planned_end,actual_end,evidence_name,review_phase";
const register = "/data-governance/nudee";
const number = new Intl.NumberFormat("ar-SA");
const percentage = new Intl.NumberFormat("ar-SA", { style: "percent", maximumFractionDigits: 1 });
type IndicatorRecord = Requirement & { requirement_title: string };
type Data = { records: IndicatorRecord[]; assignments: Assignment[] };
type Counts = { total: number; approved: number; submitted: number; returned: number; late: number };

function Readiness({ records, assignments }: Data) {
  const [assessmentOpen,setAssessmentOpen]=useState(false);
  const [cycleRevision,setCycleRevision]=useState(0);
  const [prepareOpened,setPrepareOpened] = useState(false);
  const preparation=useRef<HTMLDetailsElement>(null);
  const [selection,setSelection]=useState<{domain:string;code:string;serial:number}|null>(null);
  const [revision,setRevision]=useState(0);
  function openQuestion(domain:string,code:string){
    setSelection(previous=>({domain,code,serial:(previous?.serial||0)+1}));setPrepareOpened(true);
    if(preparation.current){preparation.current.open=true;preparation.current.scrollIntoView({block:"start"});preparation.current.querySelector("summary")?.focus({preventScroll:true});}
  }
  const [reportOpened, setReportOpened] = useState(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("report")==="1");
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
    return { total, domains, priorities: priorities.slice(0,5) };
  }, [records, assignments, today]);

  return <>
    {total.total > 0 ? <section className={styles.overview} aria-label="جاهزية الأدلة داخل المكتب">
      <article className={styles.primary}>
        <h2>نسبة الأدلة المعتمدة داخليًا</h2>
        <strong>{percentage.format(total.approved / total.total)}</strong>
        <progress value={total.approved} max={total.total} aria-label="نسبة الأدلة المعتمدة داخليًا" />
        <Link href={register + "?view=approved"}>عرض المعتمد · {number.format(total.approved)} من أصل {number.format(total.total)}</Link>
      </article>
      <Link href={register + "?view=submitted"} className={styles.countCard}>
        <h2>بانتظار المراجعة</h2><strong>{number.format(total.submitted)}</strong><span>عرض الأدلة المقدّمة ←</span>
      </Link>
      <Link href={register + "?view=changes_requested"} className={styles.countCard}>
        <h2>معادة للتعديل</h2><strong>{number.format(total.returned)}</strong><span>عرض الأدلة المعادة ←</span>
      </Link>
    </section> : <p className={shared.empty} role="status">ستظهر جاهزية الأدلة بعد إضافة متطلبات نُضيء.</p>}
    <CycleSummary revision={cycleRevision}/>
    <details className={shared.report} onToggle={e=>{
      if(e.currentTarget.open)setAssessmentOpen(true);
      else if(assessmentOpen)setCycleRevision(n=>n+1);
    }}><summary>ملف التقييم وخطة التحسين</summary>{assessmentOpen&&<div className={shared.reportBody}><AssessmentFile/></div>}</details>
    <div className={styles.workGrid}>
      <section className={styles.domains} aria-labelledby="domain-readiness">
        <h2 id="domain-readiness">جاهزية الأدلة حسب المجال</h2>
        <p className={styles.panelHint}>تظهر المجالات ذات التكليفات المتأخرة أولًا.</p>
        <ul className={styles.domainList}>{domains.map(([name, counts]) =>
          <li key={name}><Link href={{pathname:register,query:{domain:name,layout:"list"}}}>
            <strong>{name}</strong><span>{number.format(counts.approved)} من {number.format(counts.total)} معتمد</span>
            <progress value={counts.approved} max={counts.total} aria-label={"جاهزية أدلة "+name}/>
            <small>{counts.late ? "متأخر "+number.format(counts.late)+" · " : ""}بانتظار المراجعة {number.format(counts.submitted)} · معاد {number.format(counts.returned)}</small>
          </Link></li>)}</ul>
      </section>
      <section className={styles.priorities} aria-labelledby="priority-title">
        <h2 id="priority-title">متطلبات تحتاج متابعة</h2>
        <p className={styles.panelHint}>افتح المتطلب للاطلاع على مالكه ودليله وآخر قرار.</p>
        {priorities.length ? <ul>{priorities.map(({record,assignment:a,overdue}) =>
          <li key={record.id}><Link href={{pathname:register,query:{domain:record.domain_name,layout:"list",open:record.id}}}>
            <strong>{record.evidence_name}</strong>
            <small>{record.domain_name}{a.due_date && " · "+formatRiyadhDate(a.due_date)}</small>
            <span>{overdue?"متأخر · ":""}{a.status==="submitted"?"بانتظار المراجعة":a.status==="changes_requested"?"معاد للتعديل":"بانتظار الرفع"}</span>
          </Link></li>)}</ul> : <p className={styles.panelHint}>لا توجد تكليفات متأخرة أو أدلة بانتظار المراجعة أو التعديل.</p>}
        <Link className={styles.allWork} href={register+"?view=all&layout=list"}>فتح سجل المتطلبات كاملًا ←</Link>
      </section>
    </div>

    <SourceReference/>
    <QuestionOverview records={records} revision={revision} onPrepare={openQuestion}/>
    <details ref={preparation} className={shared.report} onToggle={e=>{ if(e.currentTarget.open) setPrepareOpened(true); }}>
      <summary>جاهزية الأسئلة وحزمة المجال</summary>
      {prepareOpened && <QuestionPreparation key={selection?.serial||0} records={records} initialDomain={selection?.domain} initialCode={selection?.code} onChange={()=>setRevision(n=>n+1)}/>}
    </details>
    <details open={typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("report")==="1"?true:undefined} className={shared.report} onToggle={e => { if (e.currentTarget.open) setReportOpened(true); }}>
      <summary>تقرير نُضيء التفصيلي</summary>
      {reportOpened && <div className={shared.reportBody}><NudeeReport records={records} assignments={assignments} /></div>}
    </details>
  </>;
}

export default function IndicatorDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      await requireProfile(["admin", "data_governance_team"]);
      if (!active) return;
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
  return data ? <Readiness {...data} /> : <p role="status">جارٍ تحميل مؤشر نُضيء…</p>;
}

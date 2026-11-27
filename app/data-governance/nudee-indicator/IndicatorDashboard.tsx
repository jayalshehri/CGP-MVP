"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import type { Assignment, Requirement } from "../nudee-dashboard/NudeeReport";
import shared from "../nudee-dashboard/nudee-dashboard.module.css";
import styles from "./indicator.module.css";

import QuestionOverview from "./QuestionOverview";
import SourceReference from "../nudee/SourceReference";

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
type Counts = { total: number; approved: number; submitted: number; returned: number };

function Readiness({ records, assignments }: Data) {
  const [prepareOpened,setPrepareOpened] = useState(false);
  const preparation=useRef<HTMLDetailsElement>(null);
  const [selection,setSelection]=useState<{domain:string;code:string;serial:number}|null>(null);
  const [revision,setRevision]=useState(0);
  function openQuestion(domain:string,code:string){
    setSelection(previous=>({domain,code,serial:(previous?.serial||0)+1}));setPrepareOpened(true);
    if(preparation.current){preparation.current.open=true;preparation.current.scrollIntoView({block:"start"});preparation.current.querySelector("summary")?.focus({preventScroll:true});}
  }
  const [reportOpened, setReportOpened] = useState(false);
  const { total, domains } = useMemo(() => {
    const statuses = new Map(assignments.map(a => [a.requirement_id, a.status]));
    const domains = new Map<string, Counts>();
    const total: Counts = { total: 0, approved: 0, submitted: 0, returned: 0 };
    for (const record of records) {
      const group = domains.get(record.domain_name) ?? { total: 0, approved: 0, submitted: 0, returned: 0 };
      const state = statuses.get(record.id);
      group.total++;
      total.total++;
      const key = state === "changes_requested" ? "returned" : state;
      if (key === "approved" || key === "submitted" || key === "returned") {
        group[key]++;
        total[key]++;
      }
      domains.set(record.domain_name, group);
    }
    return { total, domains };
  }, [records, assignments]);

  if (!total.total) return <p className={shared.empty} role="status">ستظهر جاهزية الأدلة بعد إضافة متطلبات نُضيء.</p>;
  return <>
    <section className={styles.overview} aria-label="جاهزية الأدلة داخل المكتب">
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
    </section>
    <SourceReference/>
    <QuestionOverview records={records} revision={revision} onPrepare={openQuestion}/>
    <details ref={preparation} className={shared.report} onToggle={e=>{ if(e.currentTarget.open) setPrepareOpened(true); }}>
      <summary>جاهزية الأسئلة وحزمة المجال</summary>
      {prepareOpened && <QuestionPreparation key={selection?.serial||0} records={records} initialDomain={selection?.domain} initialCode={selection?.code} onChange={()=>setRevision(n=>n+1)}/>}
    </details>
    <details className={shared.report} onToggle={e => { if (e.currentTarget.open) setReportOpened(true); }}>
      <summary>تقرير نُضيء التفصيلي</summary>
      {reportOpened && <div className={shared.reportBody}><NudeeReport records={records} assignments={assignments} /></div>}
    </details>
    <section className={styles.domains} aria-labelledby="domain-readiness">
      <h2 id="domain-readiness">جاهزية الأدلة حسب المجال</h2>
      <table><thead><tr><th scope="col">المجال</th><th scope="col">المعتمد من الإجمالي</th>
        <th scope="col">بانتظار المراجعة</th><th scope="col">معادة للتعديل</th></tr></thead>
        <tbody>{Array.from(domains, ([name, counts]) => <tr key={name}>
          <th scope="row"><Link href={{ pathname: register, query: { domain: name } }}>{name}<span aria-hidden="true"> ←</span></Link></th>
          <td><span>{number.format(counts.approved)} من {number.format(counts.total)}</span>
            <progress value={counts.approved} max={counts.total} aria-label={"جاهزية أدلة "+name} /></td>
          <td>{number.format(counts.submitted)}</td><td>{number.format(counts.returned)}</td>
        </tr>)}</tbody>
      </table>
    </section>
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

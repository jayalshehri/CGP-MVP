"use client";

import { formatRiyadhDate, formatRiyadhDateTime, riyadhIsoDate } from "@/lib/dates";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { readStrategyRows } from "@/lib/strategy-read";
import { supabase } from "@/lib/supabase";
import OfficeAssistant from "./OfficeAssistant";
import { findWork, recordLink, weeklyDue, workLink, type Scope, type WorkItem } from "./officeWork";
import { officeWeek } from "../nudee/queues";
import daily from "./daily.module.css";
import styles from "./nudee-dashboard.module.css";

const number = new Intl.NumberFormat("ar-SA");
const auditLabels: Record<string, string> = {
  assigned: "إسناد متطلب", submitted: "تقديم دليل للمراجعة",
  changes_requested: "طلب تعديل الدليل", approved: "اعتماد دليل",
};
type AuditEvent = { id: number; assignment_id: number; action: string; created_at: string };
type HomeRequirement = Pick<WorkItem, "id" | "evidence_name" | "domain_name">;
type Task = NonNullable<WorkItem["task"]> & {id:number; requirement_id:number};
type OfficeData = {items:WorkItem[]; userId:string; names:Map<number,string>; loaded:Date};

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
          <time dateTime={event.created_at}>{formatRiyadhDateTime(event.created_at)}</time>
        </li>)}</ol>}
  </section>;
}

function OfficeSummary({items,userId,names,loaded}: OfficeData) {
  const today=riyadhIsoDate(loaded);
  const {review,late,due,priorities,domains}=useMemo(()=>{
    const list=(scope:Scope)=>findWork(items,scope,today,userId);
    const review=list({view:"submitted"});
    const late=list({view:"overdue"});
    const due=list(weeklyDue(today));
    const priorityCandidates=[...late.map(item=>({item,action:"متابعة التكليف"})),
      ...list({view:"review"}).map(item=>({item,action:"مراجعة الدليل"})),
      ...due.map(item=>({item,action:"فتح التكليف"}))];
    const priorities=priorityCandidates.slice(0,3);
    const counts=new Map<string,number>();
    for(const row of late) counts.set(row.domain_name,(counts.get(row.domain_name) || 0)+1);
    const domains=[...counts].sort(([a,x],[b,y])=>y-x || a.localeCompare(b,"ar")).slice(0,5);
    return {review,late,due,priorities,domains};
  },[items,today,userId]);
  const cards = [
    {label:"أدلة بانتظار المراجعة",rows:review,scope:{view:"submitted"},note:"فتح الأدلة المقدّمة",color:"green"},
    {label:"تكليفات متأخرة",rows:late,scope:{view:"overdue"},note:"فتح التكليفات المتأخرة",color:"amber"},
    {label:"تستحق هذا الأسبوع",rows:due,scope:weeklyDue(today),note:"من اليوم حتى "+formatRiyadhDate(officeWeek(today).end),color:"slate"},
  ];
  return <>
    {typeof window!=="undefined" && new URLSearchParams(window.location.search).has("section") && <p className={styles.empty} role="status">هذا الرابط يعود إلى خدمة سابقة. <Link href="/data-governance/nudee">فتح مركز الأدلة</Link></p>}
    <OfficeAssistant items={items} today={today} userId={userId}/>
    <section className={daily.metrics} aria-label="ملخص أعمال المكتب">{cards.map(card=>
      <Link key={card.label} href={workLink(card.scope)} className={daily.card} data-tone={card.color}>
        <span>{card.label}</span><strong>{number.format(card.rows.length)}</strong><small>{card.note} ←</small>
      </Link>)}</section>
    <div className={daily.grid}>
      <section className={daily.panel} aria-labelledby="priorities-title"><h2 id="priorities-title">أولويات اليوم</h2>
        {priorities.length ? <ol className={daily.list}>{priorities.map(({item,action})=>
          <li key={item.id}><div><strong>{item.evidence_name}</strong><small>{item.owner} · {item.task?.due_date ? formatRiyadhDate(item.task.due_date) : "دون موعد مسجّل"}</small></div>
          <Link href={recordLink(item)} aria-label={action+" · "+item.evidence_name}>{action} ←</Link></li>)}</ol>
        : <p>{items.length?"لا توجد تكليفات متأخرة أو قريبة الاستحقاق أو أدلة تنتظر قرارك.":"لم تُستورد متطلبات نُضيء بعد."}</p>}
        <Link className={daily.footerLink} href={workLink({view:"unassigned"})}>إسناد المتطلبات ←</Link>
      </section>
      <section className={daily.panel} aria-labelledby="domain-title"><h2 id="domain-title">التكليفات المتأخرة حسب المجال</h2>
        {domains.length?<ul className={daily.bars}>{domains.map(([name,count])=><li key={name}>
          <Link href={workLink({view:"overdue",domain:name})}><span>{name}<b>{number.format(count)}</b></span>
            <i aria-hidden="true"><i style={{width:(100*count/domains[0][1])+"%"}}/></i></Link></li>)}</ul>
        :<p>لا توجد تكليفات متأخرة في المجالات المسجّلة.</p>}
        {domains.length>0&&<Link className={daily.footerLink} href={workLink({view:"overdue"})}>عرض كل المتأخر ←</Link>}
      </section>
    </div>
    <details className={daily.activity}><summary>سجل النشاط الأخير</summary><RecentActivity names={names}/></details>
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
        const {user}=await requireProfile(["admin", "data_governance_team"]);
        if (!active) return;
        const [requirements, assignments, directory] = await Promise.all([
          readStrategyRows<HomeRequirement>((from, to) => supabase.from("nudee_requirements")
            .select("id,evidence_name,domain_name", { count: "exact" }).order("id").range(from, to), r => r.id),
          readStrategyRows<Task>((from, to) => supabase.from("nudee_assignments")
            .select("id,requirement_id,status,updated_at,due_date,assignee_id", { count: "exact" }).order("id").range(from, to), a => a.id),
          supabase.rpc("nudee_assignees"),
        ]);
        if (requirements.error || assignments.error) throw new Error("تعذر تحميل متطلبات المكتب وتكليفاته.");
        const directoryRows: {user_id:string;display_name:string|null}[]=directory.data??[];
        const people=new Map(directoryRows.map(p=>[p.user_id,p.display_name]));
        const tasks=new Map(assignments.data.map(t=>[t.requirement_id,t]));
        const names=new Map<number,string>();
        const items=requirements.data.map(r=>{
          const task=tasks.get(r.id);
          if(task)names.set(task.id,r.evidence_name);
          const owner=task?.assignee_id ? people.get(task.assignee_id) || "اسم المالك غير متاح" : "لم يُحدّد المالك";
          return {...r,task,owner};
        });
        if(active)setData({items,userId:user.id,names,loaded:new Date()});
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات المكتب.");
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  return <main className={styles.root+" "+daily.root} dir="rtl">
    <header className={daily.heading}>
      <h1>مكتب إدارة البيانات</h1>
      {data && <div className={daily.freshness}><small>آخر تحديث للوحة · <time dateTime={data.loaded.toISOString()}>{formatRiyadhDateTime(data.loaded)}</time></small>
        <button type="button" onClick={()=>{setError("");setData(null);setAttempt(n=>n+1);}}>تحديث اللوحة</button></div>}
    </header>
    {data ? <OfficeSummary {...data} /> : error ? <div className={styles.alert}>
      <p role="alert">{error}</p>
      <button type="button" className={styles.secondaryButton} onClick={() => { setError(""); setAttempt(a => a + 1); }}>إعادة المحاولة</button>
    </div> : <p role="status">جارٍ تحميل بيانات المكتب…</p>}
  </main>;
}

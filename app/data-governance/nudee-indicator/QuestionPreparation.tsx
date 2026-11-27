"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { labels, type ManifestRow } from "./package";
import styles from "./indicator.module.css";

export type QuestionRecord = { id: number; standard_code: string; requirement_title: string; domain_name: string; maturity_level: string };
import { baselineLevel, localLevels as levels } from "../nudee/reference";
type Decision = { id: number; target_level: string; confirmed: boolean; evidence_ids: number[] };
const numbers = new Intl.NumberFormat("ar-SA");
async function manifest(domain: string, records: QuestionRecord[], exporting=false) {
  const { data, error } = await supabase.rpc(exporting?"nudee_export_manifest":"nudee_preparation_manifest", { p_domain: domain });
  const rows = (data ?? []) as ManifestRow[];
  const ids = new Set(rows.map(r => r.requirement_id));
  if (error || rows.length !== records.length || ids.size !== rows.length || records.some(r => !ids.has(r.id))) throw new Error("تعذر تحميل حزمة المجال كاملة. حدّث الصفحة ثم أعد المحاولة.");
  return rows;
}

function DomainReview({ domain, records, initialCode, onChange }: { domain: string; records: QuestionRecord[]; initialCode?:string; onChange:()=>void }) {
  const [rows, setRows] = useState<ManifestRow[]>([]);
  const [code, setCode] = useState(records.find(r=>r.standard_code===initialCode)?.standard_code || records[0].standard_code);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    let active = true;
    manifest(domain, records).then(data => { if (active) setRows(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [domain, records, retry]);
  async function exportDomain() {
    setExporting(true); setError("");
    try {
      const fresh = await manifest(domain, records,true);
      const { downloadPackage } = await import("./package");
      await downloadPackage(domain, fresh);
      setRows(fresh);
    } catch (err) { setError(err instanceof Error ? err.message : "تعذر تجهيز الحزمة."); }
    finally { setExporting(false); }
  }
  const questions = Array.from(new Map(records.map(r => [r.standard_code, r.requirement_title])));
  return <>
    <label>السؤال<select aria-label="السؤال" value={code} onChange={e => setCode(e.target.value)}>
      {questions.map(([key,title]) => <option key={key} value={key}>{key} · {title}</option>)}
    </select></label>
    {error && <p role="alert">{error} <button onClick={() => { setError(""); setRetry(n => n+1); }}>إعادة التحميل</button></p>}
    {rows.length > 0 ? <>
      <QuestionReview key={code} domain={domain} code={code} title={questions.find(q => q[0] === code)?.[1] || code}
        rows={rows.filter(r => r.standard_code === code)} reload={() => {setRetry(n => n+1);onChange();}} />
      <div className={styles.exportRow}><div><strong>حزمة المجال</strong><p>ملف ZIP يضم النسخ المعتمدة داخليًا وفهرس الأدلة وقائمة النواقص.</p></div>
        <button type="button" disabled={exporting} onClick={exportDomain}>{exporting ? "جارٍ تجهيز الملفات…" : "تنزيل حزمة المجال"}</button></div>
    </> : !error && <p role="status">جارٍ تحميل الأدلة…</p>}
  </>;
}

function QuestionReview({domain, code, title, rows, reload}: {domain:string; code:string; title:string; rows:ManifestRow[]; reload:()=>void}) {
  const [decision,setDecision] = useState<Decision|null>(null);
  const [level,setLevel] = useState("");
  const [loading,setLoading] = useState(true);
  const [version,setVersion] = useState(0);
  const [failed,setFailed] = useState(false);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.resolve(supabase.from("nudee_question_decisions").select("id,target_level,confirmed,evidence_ids")
      .eq("domain_name",domain).eq("standard_code",code).order("id",{ascending:false}).limit(1))
      .then(({data,error}) => {
        if (!active) return;
        if (error) { setFailed(true); setMessage("تعذر تحميل قرار المكتب."); }
        else { const item = (data?.[0] ?? null) as Decision|null; setDecision(item); setLevel(item?.target_level ?? ""); setFailed(false); }
        setLoading(false);
      }, () => { if(active) {setFailed(true);setMessage("تعذر تحميل قرار المكتب.");setLoading(false);} });
    return () => { active=false; };
  }, [domain,code,version]);
  const baseline=level===baselineLevel;
  const scope=rows.filter(r => levels.includes(r.maturity_level) && levels.indexOf(r.maturity_level)<=levels.indexOf(level));
  const approved=scope.filter(r => r.status==="approved" && r.submission_id);
  const levelsPresent=levels.slice(0,levels.indexOf(level)+1).every(l=>scope.some(r=>r.maturity_level===l));
  const complete=scope.length>0 && levelsPresent && approved.length===scope.length && rows.every(r=>levels.includes(r.maturity_level));
  const ids=approved.slice().sort((a,b)=>a.requirement_id-b.requirement_id).map(r=>r.submission_id);
  const confirmed=complete && decision?.target_level===level && decision.confirmed && JSON.stringify(ids)===JSON.stringify(decision.evidence_ids);
  async function save(confirm:boolean) {
    setBusy(true);setMessage("");
    try {
      const {error}=await supabase.rpc("nudee_question_decide",{p_domain:domain,p_code:code,p_level:level,p_confirm:confirm,p_previous:decision?.id ?? null});
      if(error) throw error;
      setMessage(baseline?"سُجل غياب القدرات لهذا السؤال.":confirm?"سُجلت مراجعة المكتب للسؤال.":"حُفظ المستوى المستهدف.");
    } catch { setMessage("تعذر حفظ القرار. تحقق من آخر حالة للأدلة ثم أعد المحاولة."); }
    finally { setBusy(false);setLoading(true);setVersion(n=>n+1);reload(); }
  }
  return <div className={styles.question}>
    <h3>{title}</h3>
    {loading ? <p role="status">جارٍ تحميل قرار المكتب…</p> : failed ? <button onClick={()=>{setLoading(true);setVersion(n=>n+1);}}>إعادة المحاولة</button> : <>
      <label>المستوى المستهدف<select aria-label="المستوى المستهدف" value={level} disabled={busy} onChange={e=>{setLevel(e.target.value);setMessage("");}}>
        <option value="">اختر المستوى</option><option value={baselineLevel}>{baselineLevel}</option>{levels.filter(l=>rows.some(r=>r.maturity_level===l)).map(l=><option key={l}>{l}</option>)}</select></label>
      {baseline && <><p>يسجّل المكتب غياب القدرات لهذا السؤال. لا يتطلب هذا المستوى رفع دليل.</p>
        {decision?.target_level!==baselineLevel&&<button disabled={busy} onClick={()=>save(false)}>تسجيل المستوى صفر</button>}</>}
      {level && !baseline && <><p><strong>{numbers.format(approved.length)} من {numbers.format(scope.length)}</strong> أدلة معتمدة للمستوى المحدد والمستويات السابقة.</p>
        <div className={styles.buttons}>
          {decision?.target_level!==level && <button disabled={busy} onClick={()=>save(false)}>حفظ المستوى المستهدف</button>}
          {confirmed ? <strong>أكد المكتب جاهزية السؤال داخليًا</strong> : <button disabled={busy||!complete} onClick={()=>save(true)}>تأكيد جاهزية السؤال داخليًا</button>}
        </div>
        <ul className={styles.evidenceList}>{scope.map(r=><li key={r.requirement_id}>
          <Link href={{pathname:"/data-governance/nudee",query:{evidence:r.requirement_id}}}>{r.evidence_name}</Link>
          <span>{labels[r.status] ?? r.status}</span></li>)}</ul>
      </>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}

export default function QuestionPreparation({records,initialDomain,initialCode,onChange}:{records:QuestionRecord[];initialDomain?:string;initialCode?:string;onChange:()=>void}) {
  const [domain,setDomain]=useState(initialDomain || records[0]?.domain_name || "");
  const selected=useMemo(()=>records.filter(r=>r.domain_name===domain),[records,domain]);
  return <section className={styles.preparation} aria-label="تجهيز أسئلة نُضيء">
    <label>مجال القياس<select aria-label="مجال القياس" value={domain} onChange={e=>setDomain(e.target.value)}>
      {Array.from(new Set(records.map(r=>r.domain_name))).map(d=><option key={d}>{d}</option>)}</select></label>
    {selected.length>0 && <DomainReview key={domain} domain={domain} records={selected} initialCode={domain===initialDomain?initialCode:undefined} onChange={onChange}/>}
  </section>;
}

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { governanceDomain } from "../nudee/reference";
import type { QuestionRecord } from "./QuestionPreparation";
import styles from "./indicator.module.css";

type Summary = { domain_name:string; standard_code:string; target_level:string|null; question_state:string; missing_count:number };
const states: Record<string,string> = {baseline:"غياب القدرات مسجّل",no_target:"بانتظار تحديد المستهدف",blocked:"تحتاج استكمال أدلة",ready:"جاهز لتأكيد المكتب",confirmed:"مؤكد داخليًا",unsupported:"يتطلب مراجعة النطاق"};
export default function QuestionOverview({records, revision, onPrepare}:{
  records: QuestionRecord[]; revision:number; onPrepare:(domain:string,code:string)=>void;
}) {
  const domains=Array.from(new Set(records.map(r=>r.domain_name)));
  const [domain,setDomain]=useState(domains.includes(governanceDomain)?governanceDomain:domains[0]);
  const [rows,setRows]=useState<Summary[]|null>(null);
  const [failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    async function load(){
      try {
        const {data,error}=await supabase.rpc("nudee_question_overview");
        if(error)throw error;
        if(active){setRows(data||[]);setFailed(false);}
      }catch{if(active)setFailed(true);}
    }
    void load();
    return ()=>{active=false;};
  },[revision,retry]);
  const group=rows?.filter(r=>r.domain_name===domain);
  return <section className={styles.board} aria-label="جاهزية الأسئلة حسب المجال">
    <header><h2>جاهزية الأسئلة حسب المجال</h2>
      <label>مجال جاهزية الأسئلة <select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map(d=><option key={d}>{d}</option>)}</select></label>
    </header>
    {failed?<p role="alert">تعذر تحميل حالة الأسئلة. <button type="button" onClick={()=>setRetry(n=>n+1)}>إعادة المحاولة</button></p>
      :!group?<p role="status">جارٍ تحميل الأسئلة…</p>
      :<><p>{group.length} أسئلة · {group.filter(r=>r.question_state==="blocked").length} تحتاج استكمال أدلة · {group.filter(r=>r.question_state==="ready").length} جاهزة للتأكيد · {group.filter(r=>r.question_state==="confirmed").length} مؤكدة داخليًا</p>
        <ul>{group.map(r=>{
          const title=records.find(item=>item.domain_name===domain && item.standard_code===r.standard_code)?.requirement_title;
          return <li key={r.standard_code}><div><small><bdi>{r.standard_code}</bdi> · {states[r.question_state]}{r.target_level&&" · "+r.target_level}</small><strong>{title}</strong></div>
            {r.question_state==="blocked"&&<Link href={{pathname:"/data-governance/nudee",query:{domain,question:r.standard_code,missing:r.target_level}}}>عرض الأدلة الناقصة ({r.missing_count})</Link>}
            <button type="button" onClick={()=>onPrepare(domain,r.standard_code)}>{r.question_state==="no_target"?"تحديد المستوى المستهدف":"فتح مراجعة السؤال"}</button>
          </li>;
        })}</ul></>}
  </section>;
}

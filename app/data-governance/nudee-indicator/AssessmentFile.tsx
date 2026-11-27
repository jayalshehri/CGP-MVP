"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { readStrategyRows } from "@/lib/strategy-read";
import { formatRiyadhDate, formatRiyadhDateTime, riyadhIsoDate } from "@/lib/dates";
import styles from "./indicator.module.css";

type Cycle = {id:number;title:string;methodology:string};
type Entry = {id:number;kind:string;subject:string;outcome:string;reference:string;payload?:unknown;created_at:string};
type Mapping = {requirement_id:number;evidence_name:string;domain_name:string;standard_code:string;codes:string[];mapping_state:string;decision_id:number|null;approved_version:number|null};
type Improvement = {id:number;requirement_id:number;description:string;due_date:string;closed_at:string|null;closure_ref:number|null;decision_ref:string|null;owner_id:string};
type Officer = {user_id:string;display_name:string};
type Specification = {code:string;page:number};
const marks:Record<string,string>={unassessed:"لم يُقيَّم",full:"ممتثل",partial:"تنفيذ جزئي",non:"غير ممتثل",na:"غير منطبق"};
const components:Record<string,string>={maturity:"نضج الممارسات",compliance:"الامتثال للمواصفات",operational:"التميز التشغيلي"};
const mappingLabels:Record<string,string>={unresolved:"تحتاج تصنيفًا",maturity:"دليل نضج فقط",linked:"ربط راجعه المكتب",source:"ربط من المصدر"};
const evidenceUrl="/data-governance/nudee?evidence=";
const format=(n:number)=>n.toLocaleString("ar-SA");
function input(form:HTMLFormElement,name:string){return String(new FormData(form).get(name)??"").trim();}
function download(data:unknown,name:string){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
 const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export default function AssessmentFile(){
 const [cycles,setCycles]=useState<Cycle[]>([]),[cycle,setCycle]=useState(0);
 const [specs,setSpecs]=useState<Specification[]>([]),[maps,setMaps]=useState<Mapping[]>([]),[owners,setOwners]=useState<Officer[]>([]);
 const [entries,setEntries]=useState<Entry[]>([]),[actions,setActions]=useState<Improvement[]>([]);
 const [code,setCode]=useState(""),[subject,setSubject]=useState("maturity"),[requirement,setRequirement]=useState(0);
 const [mappingFilter,setMappingFilter]=useState("unresolved"),[search,setSearch]=useState("");
 const [snapshot,setSnapshot]=useState<{id:number;data:{catalog:Mapping[];questions:{question_state:string}[];as_of:string;plan_stages:{maturity_level:string;total:number;progress_sum:number}[];final_review:number}}|null>(null);
 const [revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [unavailable,setUnavailable]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{
  let active=true;
  async function load(){
   const [allCycles,allSpecs,mapping,people]=await Promise.all([
    readStrategyRows<Cycle>((a,b)=>supabase.from("nudee_cycles").select("id,title,methodology",{count:"exact"}).order("id",{ascending:false}).range(a,b),r=>r.id),
    readStrategyRows<Specification>((a,b)=>supabase.from("nudee_specifications").select("code,page",{count:"exact"}).order("code").range(a,b),r=>r.code),
    readStrategyRows<Mapping>((a,b)=>supabase.from("nudee_evidence_mapping").select("*",{count:"exact"}).order("requirement_id").range(a,b),r=>r.requirement_id),
    supabase.rpc("nudee_assignees")
   ]);
   if(allCycles.error||allSpecs.error||mapping.error||people.error)throw Error();
   const id=cycle||allCycles.data[0]?.id||0;
   const history=id?await readStrategyRows<Entry>((a,b)=>supabase.from("nudee_cycle_events").select("id,kind,subject,outcome,reference,created_at,payload",{count:"exact"}).eq("cycle_id",id).neq("kind","snapshot").order("id",{ascending:false}).range(a,b),r=>r.id):{data:[],error:false};
   const snapshots=id?await readStrategyRows<Entry>((a,b)=>supabase.from("nudee_cycle_events").select("id,kind,subject,outcome,reference,created_at",{count:"exact"}).eq("cycle_id",id).eq("kind","snapshot").order("id",{ascending:false}).range(a,b),r=>r.id):{data:[],error:false};
   const plans=id?await readStrategyRows<Improvement>((a,b)=>supabase.from("nudee_improvements").select("*",{count:"exact"}).eq("cycle_id",id).order("id",{ascending:false}).range(a,b),r=>r.id):{data:[],error:false};
   if(history.error||snapshots.error||plans.error)throw Error();
   if(active){setUnavailable(false);setCycles(allCycles.data);setCycle(id);setSpecs(allSpecs.data);setMaps(mapping.data);setOwners(people.data??[]);setEntries([...history.data,...snapshots.data]);setActions(plans.data);setCode(old=>old||allSpecs.data[0]?.code||"");setLoading(false);}
  }
  load().catch(()=>{if(active){setUnavailable(true);setError("تعذر تحميل ملف التقييم كاملًا.");setLoading(false);}});
  return ()=>{active=false;};
 },[cycle,revision]);
 async function record(e:FormEvent<HTMLFormElement>,action:string,values:(f:HTMLFormElement)=>Record<string,unknown>){
  e.preventDefault();if(busy||loading)return;
  const f=e.currentTarget, data={cycle,reference:input(f,"reference"),...values(f)};
  setBusy(true);setError("");setNotice("");
  try{
   const {data:id,error:failure}=await supabase.rpc("nudee_office_record",{p_action:action,p_data:data});
   if(failure)throw failure;
   if(action==="cycle")setCycle(Number(id));
   setNotice("حُفظ السجل.");setLoading(true);setRevision(r=>r+1);
  }catch(cause){const msg=(cause as {message?:string}).message??"";
   setError(/evidence/i.test(msg)?"يلزم دليل معتمد مرتبط بهذا القرار.":/changed/i.test(msg)?"تغيّر القرار. حدّث البيانات ثم راجعها.":/duplicate/i.test(msg)?"اسم الدورة مستخدم.":"تعذر الحفظ. تحقق من الحقول والصلاحية ثم أعد المحاولة.");}
  finally{setBusy(false);}
 }
 const available=maps.filter(r=>(mappingFilter==="all"||r.mapping_state===mappingFilter)&&(!search||[r.standard_code,r.evidence_name,r.domain_name].join(" ").includes(search)));
 const selected=available.find(r=>r.requirement_id===requirement)??available[0];
 const linked=maps.filter(r=>r.codes.includes(code)),decision=entries.find(e=>e.kind==="spec"&&e.subject===code);
 const signature=linked.map(r=>[r.requirement_id,r.approved_version]);
 const stale=!!decision&&JSON.stringify(signature)!==JSON.stringify(decision.payload);
 const official=entries.find(e=>e.kind==="result"&&e.subject===subject);
 const ref=specs.find(s=>s.code===code);
 const actionName=(r:number)=>maps.find(m=>m.requirement_id===r)?.evidence_name??String(r);
 return <div className={styles.assessment}>
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error} <button onClick={()=>{setError("");setLoading(true);setRevision(r=>r+1);}}>إعادة التحميل</button></p>}
 {loading?<p role="status">جارٍ تحميل ملف التقييم…</p>:unavailable?null:<fieldset disabled={busy}>
 <label>دورة التقييم<select value={cycle} onChange={e=>{setCycle(Number(e.target.value));setSnapshot(null);setLoading(true);setError("");}}>{!cycles.length&&<option value={0}>لا توجد دورة مسجلة</option>}{cycles.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
 {cycles.find(c=>c.id===cycle)&&<p>مرجع الدورة · {cycles.find(c=>c.id===cycle)?.methodology}</p>}
 <details><summary>تسجيل دورة تقييم</summary><form onSubmit={e=>record(e,"cycle",f=>({subject:input(f,"title")}))}><label>اسم الدورة<input name="title" maxLength={160} required/></label><label>إصدار المنهجية ومرجع تعليمات الدورة<input name="reference" maxLength={1600} required/></label><button>إنشاء الدورة</button></form></details>
 <details><summary>تصنيف الأدلة وربطها بالمواصفات · {format(maps.filter(r=>r.mapping_state==="unresolved").length)} تحتاج مراجعة</summary>
 <label>حالة الربط<select value={mappingFilter} onChange={e=>setMappingFilter(e.target.value)}><option value="all">جميع الأدلة</option>{Object.entries(mappingLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>بحث عن دليل<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 {available.length?<><label>الدليل<select value={selected.requirement_id} onChange={e=>setRequirement(Number(e.target.value))}>{available.map(m=><option key={m.requirement_id} value={m.requirement_id}>{m.standard_code} · {m.evidence_name}</option>)}</select></label>
 <form key={selected.requirement_id+"-"+selected.decision_id} onSubmit={e=>record(e,"mapping",f=>({requirement:selected.requirement_id,previous:selected.decision_id,codes:input(f,"codes").split(/[,،\s]+/).filter(Boolean)}))}>
 <label>رموز المواصفات المرتبطة<input name="codes" dir="ltr" defaultValue={selected.codes.join(", ")} list="ndi-specs"/></label><datalist id="ndi-specs">{specs.map(s=><option key={s.code}>{s.code}</option>)}</datalist>
 <small>أدخل الرموز مفصولة بفاصلة. اترك الحقل فارغًا لتصنيف الدليل «نضج فقط» مع ذكر السبب.</small>
 <label>مبرر التصنيف<input name="reference" required maxLength={1600}/></label><button>حفظ تصنيف الدليل</button></form></>:<p>لا توجد أدلة تطابق البحث.</p>}</details>
 {cycle>0&&<>
 <details><summary>تقييم المواصفات · {format(specs.length)} مواصفة</summary>
 <label>المواصفة<select value={code} onChange={e=>setCode(e.target.value)}>{specs.map(s=><option key={s.code}>{s.code}</option>)}</select></label>
 <p>{decision?(stale?"تغيّرت الأدلة منذ التقييم":marks[decision.outcome]):"لم يُقيَّم"} · {format(linked.filter(r=>r.approved_version).length)} من {format(linked.length)} أدلة مرتبطة معتمدة. {ref&&<a href={"https://dmo.kku.edu.sa/sites/dmo.kku.edu.sa/files/2026-10/National-Data-Index_v1.0_AR.pdf#page="+(ref.page+1)} target="_blank" rel="noreferrer">إحالة سدايا</a>}</p>
 {linked.length>0&&<ul>{linked.map(r=><li key={r.requirement_id}><Link href={evidenceUrl+r.requirement_id}>{r.evidence_name}</Link> · {r.approved_version?"نسخة معتمدة":"بانتظار دليل معتمد"}</li>)}</ul>}
 <form key={code+"-"+decision?.id} onSubmit={e=>record(e,"spec",f=>({subject:code,outcome:input(f,"mark"),previous:decision?.id??null}))}>
 <label>حكم المكتب<select name="mark" defaultValue={decision?.outcome??"unassessed"}>{Object.entries(marks).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>مسوّغ الحكم أو عدم الانطباق<textarea name="reference" required maxLength={1600}/></label><button>توثيق التقييم الداخلي</button></form></details>
 <details><summary>النتائج الصادرة عن سدايا</summary><dl>{Object.entries(components).map(([k,title])=>{const e=entries.find(x=>x.kind==="result"&&x.subject===k);return <div key={k}><dt>{title}</dt><dd>{e?e.outcome+" · "+e.reference+" · "+formatRiyadhDate((e.payload as {issued_on:string}).issued_on):"بانتظار النتيجة الموثقة"}</dd></div>;})}</dl>
 <form onSubmit={e=>record(e,"result",f=>({subject,outcome:input(f,"value"),date:input(f,"date"),previous:official?.id??null}))}><label>مكوّن المؤشر<select value={subject} onChange={e=>setSubject(e.target.value)}>{Object.entries(components).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>النتيجة كما وردت في الإشعار<input name="value" required maxLength={100}/></label><label>تاريخ الإصدار<input type="date" name="date" max={riyadhIsoDate()} required/></label><label>مرجع إشعار سدايا<input name="reference" required maxLength={1600}/></label><button>حفظ النتيجة ومرجعها</button></form></details>
 <details><summary>خطة التحسين · {format(actions.filter(a=>!a.closed_at).length)} إجراءات مفتوحة</summary>
 <form onSubmit={e=>record(e,"improve",f=>({requirement:Number(input(f,"req")),owner:input(f,"owner"),due:input(f,"due")}))}><label>المتطلب<select name="req" required>{maps.map(m=><option value={m.requirement_id} key={m.requirement_id}>{m.standard_code} · {m.evidence_name}</option>)}</select></label>
 <label>مالك الإجراء<select name="owner" required><option value="">اختر المالك</option>{owners.map(o=><option value={o.user_id} key={o.user_id}>{o.display_name}</option>)}</select></label><label>موعد الإغلاق<input name="due" type="date" required/></label><label>الفجوة والإجراء المطلوب<textarea name="reference" required maxLength={1600}/></label><button>إضافة إجراء تحسين</button></form>
 <ul>{actions.map(a=><li key={a.id}><strong>{a.description}</strong> · {owners.find(o=>o.user_id===a.owner_id)?.display_name??"مالك مسجّل"} · {formatRiyadhDate(a.due_date)} · {a.closed_at?"مغلق":a.due_date<riyadhIsoDate()?"متأخر":"مفتوح"}<br/><Link href={evidenceUrl+a.requirement_id}>{actionName(a.requirement_id)}</Link>
 {a.closed_at?<p>نسخة الإغلاق {a.closure_ref} · {a.decision_ref}</p>:<form onSubmit={e=>record(e,"close",()=>({action_id:a.id}))}><label>قرار الإغلاق ومرجع الاعتماد وفق صلاحيات الجهة<input name="reference" maxLength={1600} required/></label><button>إغلاق بالدليل المعتمد</button></form>}</li>)}</ul></details>
 <details><summary>لقطات الدورة المؤرخة</summary><form onSubmit={e=>record(e,"snapshot",()=>({}))}><label>وصف اللقطة أو مرجع عرض اللجنة<input required name="reference" maxLength={1600}/></label><button>تثبيت لقطة للتقرير</button></form>
 {entries.filter(e=>e.kind==="snapshot").map(e=><p key={e.id}>{formatRiyadhDateTime(e.created_at)} · {e.reference} <button type="button" onClick={async()=>{const r=await supabase.from("nudee_cycle_events").select("payload").eq("id",e.id).single();if(r.error){setError("تعذر تنزيل اللقطة.");return;}setSnapshot({id:e.id,data:r.data.payload});}}>عرض اللقطة</button></p>)}
 {snapshot&&entries.some(e=>e.id===snapshot.id&&e.kind==="snapshot")&&<section aria-label="ملخص اللقطة"><h3>ملخص اللقطة · {formatRiyadhDateTime(snapshot.data.as_of)}</h3>
 <p>الأدلة ذات النسخ المعتمدة {format(snapshot.data.catalog.filter(r=>r.approved_version).length)} من {format(snapshot.data.catalog.length)} · الأسئلة المؤكدة داخليًا {format(snapshot.data.questions.filter(q=>q.question_state==="confirmed").length)} من {format(snapshot.data.questions.length)}</p>
 <p>التقدم المرجّح لخطة الملف · {(25*(snapshot.data.plan_stages.reduce((sum,stage)=>sum+(stage.total?stage.progress_sum/stage.total:0),0)+Number(snapshot.data.final_review))).toLocaleString("ar-SA",{maximumFractionDigits:1})}٪</p>
 <button type="button" onClick={()=>download(snapshot.data,"ndi-cycle-"+cycle+"-snapshot-"+snapshot.id+".json")}>تنزيل تفاصيل اللقطة</button></section>}</details></>}
 </fieldset>}</div>;
}

"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { ASSESSMENT_ROUTES, isBusinessFramework } from "@/lib/compliance-frameworks";
import { isExpired } from "@/lib/grc";
import AssessmentWorkspace from "@/components/AssessmentWorkspace";
import AssessmentPortfolio from "@/components/AssessmentPortfolio";
import "./workspace.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; hierarchy_level:string; implementation_status:string; control_owner:string|null };
type Tab = "overview"|"controls"|"assessment"|"evidence"|"verification"|"findings";
const tabs:{key:Tab;label:string}[]=[
 {key:"overview",label:"نظرة عامة"},
 {key:"controls",label:"الضوابط"},
 {key:"assessment",label:"التقييم"},
 {key:"evidence",label:"الأدلة"},
 {key:"verification",label:"التحقق"},
 {key:"findings",label:"النتائج والإجراءات"},
];

export default function FrameworkWorkspacePage(){
 return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>}><FrameworkWorkspaceContent/></Suspense>;
}

function FrameworkWorkspaceContent(){
 const router=useRouter();
 const params=useParams<{code:string}>();
 const searchParams=useSearchParams();
 const code=(params.code||"").toUpperCase();
 const requestedTab=searchParams.get("tab") as Tab|null;
 const tab:Tab=tabs.some(t=>t.key===requestedTab)?(requestedTab as Tab):"overview";

 const [frameworks,setFrameworks]=useState<Framework[]>([]);
 const [controls,setControls]=useState<Control[]>([]);
 const [role,setRole]=useState<UserRole|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;(async()=>{try{
  const {profile}=await requireProfile();
  const [f,c]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("code"),
   supabase.from("controls").select("id,control_code,title_ar,domain_ar,hierarchy_level,implementation_status,control_owner,frameworks!inner(code,is_active)").eq("frameworks.is_active",true).eq("frameworks.code",code),
  ]);
  if(f.error||c.error)throw f.error||c.error;
  if(active){setRole(profile.role);setFrameworks((f.data??[]) as Framework[]);setControls((c.data??[]) as Control[]);setError("");}
 }catch(e){
  if(active){
   const message=e instanceof Error?e.message:"";
   if(message.includes("تسجيل الدخول")){router.replace("/login");return;}
   setError(message||"تعذر تحميل مساحة الإطار.");
  }
 }finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router,code]);

 const framework=frameworks.find(f=>f.code===code);
 const setTab=(next:Tab)=>{const p=new URLSearchParams(searchParams.toString());if(next==="overview")p.delete("tab");else p.set("tab",next);router.replace(`/compliance/${code}${p.size?`?${p.toString()}`:""}`,{scroll:false});};
 const assessmentHref=ASSESSMENT_ROUTES.find(a=>a.code===code)?.href??null;
 const canReview=role==="admin"||role==="cybersecurity_team";

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مساحة الإطار</h1><p className="catalog-error">{error}</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;
 if(!framework)return <main className="workflow-page" dir="rtl"><h1>الإطار غير متاح</h1><p>لا يوجد إطار مفعّل بهذا الرمز، أو أنه مؤرشف حاليًا.</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;

 return <main className="workflow-page workspace-page" dir="rtl">
  <nav className="workspace-switcher" aria-label="تبديل الإطار">{frameworks.filter(f=>isBusinessFramework(f.code)).map(f=><Link key={f.code} href={`/compliance/${f.code}`} className={f.code===code?"active":""} aria-current={f.code===code?"page":undefined}>{f.code}</Link>)}</nav>
  <header className="workspace-header">
   <div><span className="workspace-kicker">{code} · الإصدار {framework.version}</span><h1>{framework.name_ar}</h1></div>
   <Link className="workflow-button" href="/compliance">مركز الامتثال ←</Link>
  </header>
  <div className="workspace-tabs" role="tablist" aria-label="أقسام مساحة الإطار">{tabs.map(t=><button key={t.key} role="tab" aria-selected={tab===t.key} className={tab===t.key?"active":""} onClick={()=>setTab(t.key)}>{t.label}</button>)}</div>
  <div className="workspace-panel" role="tabpanel">
   {tab==="overview"&&<OverviewTab controls={controls} assessmentHref={assessmentHref} setTab={setTab}/>}
   {tab==="controls"&&<ControlsTab code={code} controls={controls}/>}
   {tab==="assessment"&&(assessmentHref?<AssessmentWorkspace frameworkCode={code}/>:<HonestGap text="لا يوجد مسار تقييم مفعّل لهذا الإطار في CGP حاليًا." note="سيتم تحديد منهجية وحقول التقييم بعد اعتماد وربط أداة التقييم المرجعية."/>)}
   {tab==="evidence"&&<EvidenceTab code={code} controls={controls}/>}
   {tab==="verification"&&<VerificationTab canReview={canReview}/>}
   {tab==="findings"&&<AssessmentPortfolio framework={code}/>}
  </div>
  <ImportExportFoundation/>
 </main>;
}

function HonestGap({text,note}:{text:string;note?:string}){
 return <div className="workflow-empty workspace-gap"><p>{text}</p>{note&&<small>{note}</small>}</div>;
}

function OverviewTab({controls,assessmentHref,setTab}:{controls:Control[];assessmentHref:string|null;setTab:(t:Tab)=>void}){
 const parents=controls.filter(c=>c.hierarchy_level!=="sub_control");
 const subs=controls.filter(c=>c.hierarchy_level==="sub_control");
 const applicable=parents.filter(c=>isApplicable(c.implementation_status));
 const implemented=applicable.filter(c=>isImplemented(c.implementation_status));
 const pct=applicable.length?percentage(implemented.length,applicable.length):null;
 const domains=new Set(controls.map(c=>c.domain_ar)).size;
 return <div className="workspace-overview">
  <div className="workspace-metrics">
   <div><span>الضوابط الأساسية</span><b>{parents.length}</b></div>
   <div><span>الضوابط الفرعية</span><b>{subs.length}</b></div>
   <div><span>المجالات</span><b>{domains}</b></div>
   <div><span>نسبة التنفيذ</span><b>{pct===null?"—":`${pct}%`}</b></div>
  </div>
  <div className="workspace-journey">
   <button onClick={()=>setTab("controls")}><strong>الضوابط</strong><small>استعراض الهيكل التنظيمي والنص الرسمي</small></button>
   <button onClick={()=>setTab("assessment")}><strong>التقييم</strong><small>{assessmentHref?"التقييم متاح في CGP":"التقييم غير مفعّل في CGP حاليًا"}</small></button>
   <button onClick={()=>setTab("evidence")}><strong>الأدلة</strong><small>إدارة الأدلة من المستودع المركزي دون نسخها</small></button>
   <button onClick={()=>setTab("verification")}><strong>التحقق</strong><small>مراجعة الأدلة واعتماد القرار</small></button>
   <button onClick={()=>setTab("findings")}><strong>النتائج والإجراءات</strong><small>الفجوات المفتوحة والمعالجات</small></button>
  </div>
  {!controls.length&&<HonestGap text="لا توجد ضوابط محمّلة لهذا الإطار ضمن نطاق صلاحياتك حاليًا."/>}
 </div>;
}

function ControlsTab({code,controls}:{code:string;controls:Control[]}){
 const domains=useMemo(()=>{
  const map=new Map<string,{total:number;parents:number;subs:number;done:number}>();
  for(const c of controls){
   const row=map.get(c.domain_ar)??{total:0,parents:0,subs:0,done:0};
   row.total++;
   if(c.hierarchy_level==="sub_control")row.subs++;else row.parents++;
   if(isImplemented(c.implementation_status))row.done++;
   map.set(c.domain_ar,row);
  }
  return [...map.entries()];
 },[controls]);
 return <div className="workspace-controls-tab">
  <p className="workspace-hint">هيكل الضوابط والنص التنظيمي الرسمي متاحان بكامل التفاصيل في مكتبة الضوابط. النص التنظيمي لا يُعرض أو يُعدَّل هنا.</p>
  {!domains.length?<HonestGap text="لا توجد ضوابط محمّلة لهذا الإطار ضمن نطاق صلاحياتك حاليًا."/>:<ul className="workspace-domain-list">{domains.map(([name,row])=><li key={name}><span>{name}</span><span>{row.parents>0?`${row.parents} ضابط أساسي`:""}{row.subs>0?` · ${row.subs} ضابط فرعي`:""}</span></li>)}</ul>}
  <Link className="workflow-button" href={`/controls?framework=${code}`}>فتح مكتبة الضوابط لهذا الإطار ←</Link>
 </div>;
}

function EvidenceTab({code,controls}:{code:string;controls:Control[]}){
 const [summary,setSummary]=useState<{withEvidence:number;pending:number;expired:number}|null>(null);
 const [summaryError,setSummaryError]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
  const result=await supabase.rpc("grc_evidence_register");
  if(!active)return;
  if(result.error){setSummaryError(true);return;}
  const ids=new Set(controls.map(control=>control.id));
  const current=((result.data??[]) as {control_id:number;is_current:boolean;status:string;valid_until:string|null}[]).filter(row=>row.is_current&&ids.has(row.control_id));
  setSummary({withEvidence:new Set(current.map(row=>row.control_id)).size,pending:current.filter(row=>["pending_review","under_review"].includes(row.status)).length,expired:current.filter(row=>isExpired(row.valid_until)).length});
 })();return()=>{active=false;};},[controls]);
 return <div className="workspace-evidence-tab">
  <p className="workspace-hint">هذه مساحة إطار {code}. تبقى الأدلة وإصداراتها وقرارات مراجعتها في المستودع المركزي، ولا تُنسخ إلى مساحة الإطار.</p>
  {summary?<div className="workspace-evidence-summary"><div><span>ضوابط لها دليل حالي</span><b>{summary.withEvidence}</b></div><div><span>سجلات أدلة بانتظار المراجعة</span><b>{summary.pending}</b></div><div><span>سجلات أدلة منتهية الصلاحية</span><b>{summary.expired}</b></div></div>:<p className="workspace-hint" role="status">{summaryError?"تعذر تحميل ملخص الأدلة؛ التفاصيل متاحة في المستودع المركزي.":"جاري تحميل ملخص الأدلة…"}</p>}
  <p className="workspace-hint">الأعداد تخص سجلات المستودع الحالية التي تتيحها صلاحياتك لهذا الإطار؛ تفاصيل الإصدارات والقرارات في المستودع.</p>
  <Link className="workflow-button" href={`/evidence?framework=${encodeURIComponent(code)}`}>فتح مستودع الأدلة ←</Link>
 </div>;
}

function VerificationTab({canReview}:{canReview:boolean}){
 return <div className="workspace-verification-tab">
  <p className="workspace-hint">التحقق هو اعتماد الأدلة المرفوعة مقابل المتطلب الرسمي ونتيجة التقييم عند توفرها؛ وهو منفصل عن قرار التقييم نفسه ومنفصل عن التدقيق.</p>
  {canReview?<Link className="workflow-button" href="/review">فتح التحقق ←</Link>:<p className="workspace-hint">إجراء مراجعة الأدلة متاح فقط لمدير النظام وفريق الأمن السيبراني.</p>}
 </div>;
}

function ImportExportFoundation(){
 return <section className="workspace-exchange" aria-labelledby="workspace-exchange-heading">
  <div><h2 id="workspace-exchange-heading">استيراد وتصدير بيانات التقييم</h2><p className="workspace-hint">مسار مستقبلي مضبوط: رفع الملف ← التحقق ← المعاينة ← المطابقة ← الاستيراد. لن تُقبل ملفات أو تُغيَّر نتائج قبل اعتماد قالب الربط.</p></div>
  <div className="workspace-exchange-actions"><button type="button" disabled>استيراد أداة/ملف التقييم</button><button type="button" disabled>تصدير بيانات التقييم</button></div>
  <small>قريبًا — سيُفعّل بعد اعتماد قالب الربط. هذه الأزرار لا ترفع ملفًا ولا تصدّر بيانات ولا تغيّر تقييمًا.</small>
 </section>;
}

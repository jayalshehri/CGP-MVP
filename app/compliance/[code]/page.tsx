"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { EVIDENCE_PRESENT } from "@/lib/compliance";
import { ASSESSMENT_ROUTES } from "@/lib/compliance-frameworks";
import AssessmentWorkspace from "@/components/AssessmentWorkspace";
import AssessmentPortfolio from "@/components/AssessmentPortfolio";
import "./workspace.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; hierarchy_level:string; implementation_status:string; evidence_status:string; control_owner:string|null };
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
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;(async()=>{try{
  await requireProfile();
  const [f,c]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("code"),
   supabase.from("controls").select("id,control_code,title_ar,domain_ar,hierarchy_level,implementation_status,evidence_status,control_owner,frameworks!inner(code,is_active)").eq("frameworks.is_active",true).eq("frameworks.code",code),
  ]);
  if(f.error||c.error)throw f.error||c.error;
  if(active){setFrameworks((f.data??[]) as Framework[]);setControls((c.data??[]) as Control[]);setError("");}
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

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مساحة الإطار</h1><p className="catalog-error">{error}</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;
 if(!framework)return <main className="workflow-page" dir="rtl"><h1>الإطار غير متاح</h1><p>لا يوجد إطار مفعّل بهذا الرمز، أو أنه مؤرشف حاليًا.</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;

 return <main className="workflow-page workspace-page" dir="rtl">
  <nav className="workspace-switcher" aria-label="تبديل الإطار">{frameworks.map(f=><Link key={f.code} href={`/compliance/${f.code}`} className={f.code===code?"active":""} aria-current={f.code===code?"page":undefined}>{f.code}</Link>)}</nav>
  <header className="workspace-header">
   <div><span className="workspace-kicker">{code} · الإصدار {framework.version}</span><h1>{framework.name_ar}</h1></div>
   <Link className="workflow-button" href="/compliance">مركز الامتثال ←</Link>
  </header>
  <div className="workspace-tabs" role="tablist" aria-label="أقسام مساحة الإطار">{tabs.map(t=><button key={t.key} role="tab" aria-selected={tab===t.key} className={tab===t.key?"active":""} onClick={()=>setTab(t.key)}>{t.label}</button>)}</div>
  <div className="workspace-panel" role="tabpanel">
   {tab==="overview"&&<OverviewTab controls={controls} assessmentHref={assessmentHref} setTab={setTab}/>}
   {tab==="controls"&&<ControlsTab code={code} controls={controls}/>}
   {tab==="assessment"&&(assessmentHref?<AssessmentWorkspace frameworkCode={code}/>:<HonestGap text="لا توجد أداة تقييم رسمية مفعلة لهذا الإطار في CGP حاليًا." note="مصدر منهجية التقييم الرسمية هو الهيئة الوطنية للأمن السيبراني؛ لا يجوز لـCGP ابتكار معايير تقييم بديلة."/>)}
   {tab==="evidence"&&<EvidenceTab code={code} controls={controls}/>}
   {tab==="verification"&&<VerificationTab/>}
   {tab==="findings"&&<AssessmentPortfolio framework={code}/>}
  </div>
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
   <button onClick={()=>setTab("assessment")}><strong>التقييم</strong><small>{assessmentHref?"أداة قياس الالتزام الرسمية":"لا توجد أداة تقييم رسمية لهذا الإطار"}</small></button>
   <button onClick={()=>setTab("evidence")}><strong>الأدلة</strong><small>مستودع الأدلة المشترك مصفّى لهذا الإطار</small></button>
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
 const total=controls.length;
 const withEvidence=controls.filter(c=>EVIDENCE_PRESENT.has((c.evidence_status||"").toLowerCase())).length;
 const pendingDecision=controls.filter(c=>["pending_review","under_review"].includes((c.evidence_status||"").toLowerCase())).length;
 return <div className="workspace-evidence-tab">
  <p className="workspace-hint">الأدلة خدمة مشتركة عبر المنصة؛ هذا عرض مصفّى بضوابط {code} فقط، دون نسخ أو تكرار لأي ملف.</p>
  <div className="workspace-metrics"><div><span>ضوابط لديها دليل حالي</span><b>{total?`${withEvidence}/${total}`:"—"}</b></div><div><span>بانتظار قرار المراجعة</span><b>{pendingDecision}</b></div></div>
  <Link className="workflow-button" href="/evidence">فتح مركز الأدلة ←</Link>
 </div>;
}

function VerificationTab(){
 return <div className="workspace-verification-tab">
  <p className="workspace-hint">التحقق هو اعتماد الأدلة المرفوعة مقابل المتطلب الرسمي ونتيجة التقييم عند توفرها؛ وهو منفصل عن قرار التقييم نفسه ومنفصل عن التدقيق.</p>
  <Link className="workflow-button" href="/review">فتح التحقق ←</Link>
 </div>;
}

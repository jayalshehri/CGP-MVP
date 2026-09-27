"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { assessmentHrefFor } from "@/lib/compliance-frameworks";
import { isExpired } from "@/lib/grc";
import { cycleLabels, displayPercent } from "@/lib/assessment";
import ControlsCatalog from "@/components/ControlsCatalog";
import FrameworkWorkspaceShell, { type FrameworkSection } from "@/components/FrameworkWorkspaceShell";
import "./workspace.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; hierarchy_level:string; implementation_status:string; control_owner:string|null };
type CycleSummary = { id:number; framework:string; scope_name:string; status:string; completion:number|null; compliance:number|null };
type EvidenceSummaryRow = { control_id:number; is_current:boolean; status:string; valid_until:string|null };
const sections: FrameworkSection[] = ["overview", "controls", "assessment", "evidence", "findings"];

export default function FrameworkWorkspacePage(){
 return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>}><FrameworkWorkspaceContent/></Suspense>;
}

function FrameworkWorkspaceContent(){
 const router=useRouter();
 const params=useParams<{code:string}>();
 const searchParams=useSearchParams();
 const code=(params.code||"").toUpperCase();
 const requestedTab=searchParams.get("tab");

 const [frameworks,setFrameworks]=useState<Framework[]>([]);
 const [controls,setControls]=useState<Control[]>([]);
 const [role,setRole]=useState<UserRole|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const canAssess=role!==null&&role!=="data_governance_team";
 const tab:FrameworkSection=sections.includes(requestedTab as FrameworkSection)&&!(requestedTab==="assessment"&&!canAssess)&&!(requestedTab==="findings"&&role==="data_governance_team")?(requestedTab as FrameworkSection):"overview";

 useEffect(()=>{let active=true;(async()=>{try{
  const {profile}=await requireProfile();
  const [f,c]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).eq("code",code),
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
 const assessmentHref=assessmentHrefFor(code);

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الإطار…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مساحة الإطار</h1><p className="catalog-error">{error}</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;
 if(!framework)return <main className="workflow-page" dir="rtl"><h1>الإطار غير متاح</h1><p>لا يوجد إطار مفعّل بهذا الرمز، أو أنه مؤرشف حاليًا.</p><Link href="/compliance">العودة إلى مركز الامتثال</Link></main>;

 return <main className="workflow-page workspace-page" dir="rtl">
  <FrameworkWorkspaceShell code={code} name={framework.name_ar} version={framework.version} activeSection={tab} role={role}>
  <div className="workspace-panel">
   {tab==="overview"&&<OverviewTab key={code} code={code} controls={controls}/>}
   {tab==="controls"&&<ControlsCatalog key={code} fixedFramework={code}/>}
   {tab==="assessment"&&(assessmentHref?<div className="workflow-empty workspace-gap"><p>تقييم {code} متاح في صفحة التقييم المخصصة لهذا الإطار.</p><Link href={assessmentHref}>فتح تقييم {code} ←</Link></div>:<HonestGap text="التقييم غير مفعّل في CGP حاليًا" note="لا يُستنتج من ذلك عدم وجود متطلبات رسمية؛ لم تُربط أداة تقييم لهذا الإطار داخل CGP بعد."/>)}
   {tab==="evidence"&&<EvidenceTab code={code} controls={controls}/>}
   {tab==="findings"&&<div className="workflow-empty workspace-gap"><p>سجل الملاحظات والإجراءات مركزي حاليًا؛ تصفية {code} ستُضاف بعد اعتماد عرضها السياقي.</p><Link href={`/findings?from=workspace&origin=${encodeURIComponent(code)}`}>فتح سجل الملاحظات والإجراءات ←</Link></div>}
  </div>
  </FrameworkWorkspaceShell>
 </main>;
}

function HonestGap({text,note}:{text:string;note?:string}){
 return <div className="workflow-empty workspace-gap"><p>{text}</p>{note&&<small>{note}</small>}</div>;
}

function OverviewTab({code,controls}:{code:string;controls:Control[]}){
 const [cycles,setCycles]=useState<{rows:CycleSummary[];error:boolean}|null>(null);
 const [evidence,setEvidence]=useState<{rows:EvidenceSummaryRow[];error:boolean}|null>(null);
 useEffect(()=>{let active=true;void(async()=>{
  const [cycleResult,evidenceResult]=await Promise.all([supabase.rpc("cgp_assessment_summary"),supabase.rpc("grc_evidence_register")]);
  if(active){setCycles({rows:(cycleResult.data??[]) as CycleSummary[],error:!!cycleResult.error});setEvidence({rows:(evidenceResult.data??[]) as EvidenceSummaryRow[],error:!!evidenceResult.error});}
 })();return()=>{active=false;};},[code]);
 const parents=controls.filter(c=>c.hierarchy_level!=="sub_control");
 const applicable=parents.filter(c=>isApplicable(c.implementation_status));
 const implemented=applicable.filter(c=>isImplemented(c.implementation_status));
 const pct=applicable.length?percentage(implemented.length,applicable.length):null;
 const latest=cycles?.rows.filter(c=>c.framework===code).sort((a,b)=>b.id-a.id)[0];
 const controlIds=new Set(controls.map(c=>c.id));
 const currentEvidence=evidence?.rows.filter(row=>row.is_current&&controlIds.has(row.control_id))??[];
 const pending=currentEvidence.filter(row=>["pending_review","under_review"].includes(row.status)).length;
 const expired=currentEvidence.filter(row=>isExpired(row.valid_until)).length;
 return <div className="workspace-overview">
  <div className="workspace-summary-grid">
   <section className="workspace-summary-card"><h2>حالة التنفيذ</h2><strong>{pct===null?"—":`${pct}%`}</strong><p>{implemented.length} من {applicable.length} ضابط أساسي منطبق بحالة تنفيذ مكتمل.</p><small>هذه حالة تطبيق الضوابط، وليست نتيجة قياس الالتزام المعتمدة.</small></section>
   <section className="workspace-summary-card"><h2>آخر دورة تقييم</h2>{cycles===null?<p>جاري تحميل الدورة…</p>:cycles.error?<p>تعذر تحميل ملخص التقييم.</p>:latest?<><strong>{cycleLabels[latest.status]??latest.status}</strong><p>{latest.scope_name} · الدورة #{latest.id}</p><p>اكتمال الإدخال: {displayPercent(latest.completion)}</p>{["approved","closed"].includes(latest.status)&&latest.compliance!==null&&<p>نتيجة قياس الالتزام المعتمدة لهذا النطاق: {displayPercent(latest.compliance)}</p>}<small>النتيجة تخص هذه الدورة ونطاقها فقط، ولا تمثل متوسطًا لجميع النطاقات.</small></>:<p>لا توجد دورة تقييم ضمن صلاحياتك لهذا الإطار.</p>}</section>
   <section className="workspace-summary-card"><h2>الأدلة</h2>{evidence===null?<p>جاري تحميل ملخص الأدلة…</p>:evidence.error?<p>تعذر تحميل ملخص الأدلة.</p>:<><strong>{currentEvidence.length} سجلًا حاليًا</strong><p>{pending} بانتظار المراجعة · {expired} منتهي الصلاحية</p><small>إصدارات وقرارات الأدلة محفوظة في المستودع المركزي.</small></>}</section>
  </div>
  {!controls.length&&<HonestGap text="لا توجد ضوابط محمّلة لهذا الإطار ضمن نطاق صلاحياتك حاليًا."/>}
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
  <Link className="workflow-button" href={`/evidence?framework=${encodeURIComponent(code)}&from=workspace&origin=${encodeURIComponent(code)}`}>فتح مستودع الأدلة ←</Link>
 </div>;
}

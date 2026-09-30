"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { assessmentHrefFor } from "@/lib/compliance-frameworks";
import { formatComplianceDate } from "@/lib/grc";
import { findingStatusLabels, type SharedFinding } from "@/lib/findings";
import { loadEligibleFrameworkEvidence, type EligibleFrameworkEvidence } from "@/lib/framework-evidence";
import { cycleLabels, displayPercent } from "@/lib/assessment";
import ControlsCatalog from "@/components/ControlsCatalog";
import FrameworkWorkspaceShell, { type FrameworkSection } from "@/components/FrameworkWorkspaceShell";
import "./workspace.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; hierarchy_level:string; implementation_status:string; control_owner:string|null };
type CycleSummary = { id:number; framework:string; scope_name:string; status:string; completion:number|null; compliance:number|null };
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
   {tab==="evidence"&&<EvidenceTab code={code}/>}
   {tab==="findings"&&<FindingsTab code={code} frameworkId={framework.id}/>}
  </div>
  </FrameworkWorkspaceShell>
 </main>;
}

function HonestGap({text,note}:{text:string;note?:string}){
 return <div className="workflow-empty workspace-gap"><p>{text}</p>{note&&<small>{note}</small>}</div>;
}

function OverviewTab({code,controls}:{code:string;controls:Control[]}){
 const [cycles,setCycles]=useState<{rows:CycleSummary[];error:boolean}|null>(null);
 const [evidence,setEvidence]=useState<{rows:EligibleFrameworkEvidence[];error:boolean}|null>(null);
 useEffect(()=>{let active=true;void(async()=>{
  const [cycleResult,evidenceResult]=await Promise.allSettled([supabase.rpc("cgp_assessment_summary"),loadEligibleFrameworkEvidence(code)]);
  if(active){setCycles(cycleResult.status==="fulfilled"?{rows:(cycleResult.value.data??[]) as CycleSummary[],error:!!cycleResult.value.error}:{rows:[],error:true});setEvidence(evidenceResult.status==="fulfilled"?{rows:evidenceResult.value,error:false}:{rows:[],error:true});}
 })();return()=>{active=false;};},[code]);
 const parents=controls.filter(c=>c.hierarchy_level!=="sub_control");
 const applicable=parents.filter(c=>isApplicable(c.implementation_status));
 const implemented=applicable.filter(c=>isImplemented(c.implementation_status));
 const pct=applicable.length?percentage(implemented.length,applicable.length):null;
 const latest=cycles?.rows.filter(c=>c.framework===code).sort((a,b)=>b.id-a.id)[0];
 const eligibleEvidence=evidence?.rows??[];
 const direct=eligibleEvidence.filter(row=>row.association==="direct").length;
 const shared=eligibleEvidence.filter(row=>row.association==="shared").length;
 return <div className="workspace-overview">
  <div className="workspace-summary-grid">
   <section className="workspace-summary-card"><h2>حالة التنفيذ</h2><strong>{pct===null?"—":`${pct}%`}</strong><p>{implemented.length} من {applicable.length} ضابط أساسي منطبق بحالة تنفيذ مكتمل.</p><small>هذه حالة تطبيق الضوابط، وليست نتيجة قياس الالتزام المعتمدة.</small></section>
   <section className="workspace-summary-card"><h2>آخر دورة تقييم</h2>{cycles===null?<p>جاري تحميل الدورة…</p>:cycles.error?<p>تعذر تحميل ملخص التقييم.</p>:latest?<><strong>{cycleLabels[latest.status]??latest.status}</strong><p>{latest.scope_name} · الدورة #{latest.id}</p><p>اكتمال الإدخال: {displayPercent(latest.completion)}</p>{["approved","closed"].includes(latest.status)&&latest.compliance!==null&&<p>نتيجة قياس الالتزام المعتمدة لهذا النطاق: {displayPercent(latest.compliance)}</p>}<small>النتيجة تخص هذه الدورة ونطاقها فقط، ولا تمثل متوسطًا لجميع النطاقات.</small></>:<p>لا توجد دورة تقييم ضمن صلاحياتك لهذا الإطار.</p>}</section>
   <section className="workspace-summary-card"><h2>الأدلة المؤهلة</h2>{evidence===null?<p>جاري تحميل ملخص الأدلة…</p>:evidence.error?<p>تعذر تحميل ملخص الأدلة.</p>:<><strong>{eligibleEvidence.length} إصدارًا مؤهلًا</strong><p>{direct} مباشر · {shared} مشترك عبر مواءمة معتمدة</p><small>هذا الملخص لا يشمل الأدلة قيد المراجعة أو المنتهية؛ سجل الإصدارات الكامل في المستودع المركزي.</small></>}</section>
  </div>
  {!controls.length&&<HonestGap text="لا توجد ضوابط محمّلة لهذا الإطار ضمن نطاق صلاحياتك حاليًا."/>}
 </div>;
}

function EvidenceTab({code}:{code:string}){
 const [rows,setRows]=useState<EligibleFrameworkEvidence[]|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
  try{const result=await loadEligibleFrameworkEvidence(code);if(active)setRows(result);}
  catch{if(active)setError(true);}
 })();return()=>{active=false;};},[code]);
 const direct=rows?.filter(row=>row.association==="direct").length??0;
 const shared=rows?.filter(row=>row.association==="shared").length??0;
 return <div className="workspace-evidence-tab">
  <p className="workspace-hint">الأدلة المرتبطة بضوابط {code} والمتاحة ضمن صلاحياتك.</p>
  {rows?<>{rows.length>0&&<div className="workspace-evidence-summary"><div><span>إصدارات مؤهلة</span><b>{rows.length}</b></div><div><span>دليل مباشر</span><b>{direct}</b></div><div><span>دليل مشترك معتمد</span><b>{shared}</b></div><div><span>ضوابط لها دليل مؤهل</span><b>{new Set(rows.map(row=>row.target_control_id)).size}</b></div></div>}
   {rows.length?<div className="workspace-evidence-list">{[...rows].sort((a,b)=>(b.uploaded_at??"").localeCompare(a.uploaded_at??"")).slice(0,8).map(row=><div key={`${row.target_control_id}-${row.evidence_id}`}><b>{row.evidence_name||row.file_name||`دليل #${row.evidence_id}`}</b><span dir="ltr">{row.target_control_code}</span><span>{row.association==="direct"?"دليل مباشر":"دليل مشترك عبر مواءمة معتمدة"}</span><small>الإصدار {row.version_number} · الصلاحية {formatComplianceDate(row.valid_until,true)}</small></div>)}</div>:<p className="workflow-empty">لا توجد أدلة مؤهلة لهذا الإطار ضمن صلاحياتك حاليًا.</p>}</>:<p className="workspace-hint" role="status">{error?"تعذر تحميل الأدلة المؤهلة؛ لا يمكن تأكيد الملخص الآن.":"جاري تحميل ملخص الأدلة…"}</p>}
  {rows&&rows.length>8&&<p className="workspace-hint">تظهر آخر ثمانية إصدارات مرفوعة هنا؛ افتح المستودع لعرض جميع الأدلة المؤهلة.</p>}
  <Link className="workflow-button" href={`/evidence?framework=${encodeURIComponent(code)}&from=workspace&origin=${encodeURIComponent(code)}`}>فتح مستودع الأدلة ←</Link>
 </div>;
}

function FindingsTab({code,frameworkId}:{code:string;frameworkId:number}){
 const [rows,setRows]=useState<SharedFinding[]|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;void(async()=>{
  const result=await supabase.from("grc_findings").select("*").eq("framework_id",frameworkId).order("id",{ascending:false}).limit(8);
  if(!active)return;
  if(result.error){setError(true);return;}
  setRows((result.data??[]) as SharedFinding[]);
 })();return()=>{active=false;};},[frameworkId]);
 return <div className="workspace-evidence-tab">
  <p className="workspace-hint">الملاحظات والإجراءات المرتبطة بضوابط {code} ضمن صلاحياتك.</p>
  {rows?<>{rows.length?<div className="workspace-evidence-list">{rows.map(row=><Link key={row.id} href={`/findings?framework=${encodeURIComponent(code)}&finding=${row.id}&from=workspace&origin=${encodeURIComponent(code)}`}><b>{row.title}</b><span dir="ltr">{row.reference_code}</span><span>{findingStatusLabels[row.status]}</span></Link>)}</div>:<p className="workflow-empty">لا توجد ملاحظات مرتبطة بهذا الإطار ضمن صلاحياتك حاليًا.</p>}</>:<p role="status" className="workspace-hint">{error?"تعذر تحميل ملاحظات الإطار.":"جاري تحميل ملاحظات الإطار…"}</p>}
  <Link className="workflow-button" href={`/findings?framework=${encodeURIComponent(code)}&from=workspace&origin=${encodeURIComponent(code)}`}>فتح ملاحظات {code} ←</Link>
 </div>;
}

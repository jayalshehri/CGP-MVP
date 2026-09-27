"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { assessmentHrefFor, isBusinessFramework } from "@/lib/compliance-frameworks";
import { WorkflowHeading } from "@/components/WorkflowUI";
import "./compliance.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type ControlRow = { framework_id:number; hierarchy_level:string; implementation_status:string };

export default function ComplianceCenterPage(){
 return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل مركز الامتثال…</main>}><ComplianceCenterContent/></Suspense>;
}

function ComplianceCenterContent(){
 const router=useRouter();
 const searchParams=useSearchParams();
 const selectedCode=searchParams.get("framework")?.toUpperCase()??"";
 const [frameworks,setFrameworks]=useState<Framework[]>([]);
 const [controls,setControls]=useState<ControlRow[]>([]);
 const [role,setRole]=useState<UserRole|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;(async()=>{try{
  const {profile}=await requireProfile();
  const [f,c]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("code"),
   supabase.from("controls").select("framework_id,hierarchy_level,implementation_status,frameworks!inner(is_active)").eq("frameworks.is_active",true),
  ]);
  if(f.error||c.error)throw f.error||c.error;
  if(active){setRole(profile.role);setFrameworks(((f.data??[]) as Framework[]).filter(fw=>isBusinessFramework(fw.code)));setControls((c.data??[]) as ControlRow[]);setError("");}
 }catch(e){
  if(active){
   const message=e instanceof Error?e.message:"";
   if(message.includes("تسجيل الدخول")){router.replace("/login");return;}
   setError(message||"تعذر تحميل مركز الامتثال.");
  }
 }finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);

 const selected=frameworks.find(fw=>fw.code===selectedCode);
 const toggleFramework=(code:string)=>router.push(code===selectedCode?"/compliance":`/compliance?framework=${encodeURIComponent(code)}`,{scroll:false});

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مركز الامتثال…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مركز الامتثال</h1><p className="catalog-error">{error}</p><Link href="/">العودة إلى الرئيسية</Link></main>;

 return <main className="workflow-page compliance-center-page" dir="rtl">
  <WorkflowHeading title="مركز الامتثال" description="اختر إطارًا لعرض مهامه دون مغادرة الصفحة. المرجع الرسمي لكل ضابط ونص تنظيمي يبقى الهيئة الوطنية للأمن السيبراني."/>
  {!frameworks.length?<div className="workflow-empty">لا توجد أطر تنظيمية مفعّلة حاليًا.</div>:<>
   <div className="compliance-framework-grid">{frameworks.map(fw=><button key={fw.id} type="button" className={`compliance-framework-card ${selected?.id===fw.id?"selected":""}`} onClick={()=>toggleFramework(fw.code)} aria-expanded={selected?.id===fw.id} aria-controls={selected?.id===fw.id?"compliance-framework-panel":undefined}>
    <span className="compliance-framework-top"><strong dir="ltr">{fw.code}</strong><span className="compliance-framework-chevron" aria-hidden="true">{selected?.id===fw.id?"−":"+"}</span></span>
    <span className="compliance-framework-name">{fw.name_ar}</span>
   </button>)}</div>
   {selected&&<FrameworkPanel framework={selected} controls={controls} role={role} close={()=>toggleFramework(selected.code)}/>}</>}
 </main>;
}

function FrameworkPanel({framework,controls,role,close}:{framework:Framework;controls:ControlRow[];role:UserRole|null;close:()=>void}){
 const rows=controls.filter(c=>c.framework_id===framework.id);
 const parents=rows.filter(c=>c.hierarchy_level!=="sub_control");
 const subs=rows.filter(c=>c.hierarchy_level==="sub_control");
 const applicable=parents.filter(c=>isApplicable(c.implementation_status));
 const implemented=applicable.filter(c=>isImplemented(c.implementation_status));
 const pct=applicable.length?percentage(implemented.length,applicable.length):null;
 const code=framework.code;
 const assessmentHref=assessmentHrefFor(code);
 const canAssess=role!==null&&role!=="data_governance_team";
 const canReview=role==="admin"||role==="cybersecurity_team";
 const canSeeFindings=role!==null&&role!=="data_governance_team";
 return <section id="compliance-framework-panel" className="compliance-framework-panel" aria-label={`خيارات إطار ${code}`}>
  <div className="compliance-panel-heading"><div><span className="compliance-panel-kicker" dir="ltr">{code}</span><h2>{framework.name_ar}</h2></div><button type="button" className="compliance-panel-close" onClick={close} aria-label={`إغلاق خيارات ${code}`}>إغلاق ×</button></div>
  <dl className="compliance-panel-metrics"><div><dt>الإصدار</dt><dd dir="ltr">{framework.version}</dd></div><div><dt>الضوابط الأساسية</dt><dd>{parents.length}</dd></div><div><dt>الضوابط الفرعية</dt><dd>{subs.length}</dd></div><div><dt>نسبة التنفيذ</dt><dd>{pct===null?"—":`${pct}%`}</dd></div></dl>
  <div className="compliance-panel-actions" aria-label={`مهام ${code}`}>
   <Link href={`/compliance/${code}`}><strong>نظرة عامة</strong><small>ملخص الإطار</small></Link>
   <Link href={`/controls?framework=${encodeURIComponent(code)}`}><strong>الضوابط</strong><small>مكتبة ضوابط {code}</small></Link>
   {assessmentHref&&canAssess?<Link href={assessmentHref}><strong>التقييم</strong><small>فتح تقييم {code}</small></Link>:!assessmentHref?<span className="compliance-action-unavailable"><strong>التقييم</strong><small>التقييم غير مفعّل حاليًا</small></span>:null}
   <Link href={`/evidence?framework=${encodeURIComponent(code)}`}><strong>الأدلة</strong><small>مستودع الأدلة مفلتر حسب الإطار</small></Link>
   {canReview&&<Link href="/review"><strong>التحقق</strong><small>مراجعة الأدلة المركزية</small></Link>}
   {canSeeFindings&&<Link href={`/compliance/${code}?tab=findings`}><strong>النتائج والإجراءات</strong><small>دورات {code} والفجوات</small></Link>}
  </div>
  <div className="compliance-panel-footer"><Link href={`/compliance/${code}`}>فتح مساحة {code} كاملة ←</Link><small>الأعداد وفق نطاق صلاحياتك{canReview?"؛ التحقق المركزي لا يدعم تصفية الإطار.":"."}</small></div>
 </section>;
}

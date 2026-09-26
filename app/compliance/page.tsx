"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { isImplemented, isApplicable, percentage } from "@/lib/compliance";
import { ASSESSMENT_ROUTES, isBusinessFramework } from "@/lib/compliance-frameworks";
import { WorkflowHeading } from "@/components/WorkflowUI";
import "./compliance.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type ControlRow = { framework_id:number; hierarchy_level:string; implementation_status:string };

export default function ComplianceCenterPage(){
 const router=useRouter();
 const [frameworks,setFrameworks]=useState<Framework[]>([]);
 const [controls,setControls]=useState<ControlRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;(async()=>{try{
  await requireProfile();
  const [f,c]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("code"),
   supabase.from("controls").select("framework_id,hierarchy_level,implementation_status,frameworks!inner(is_active)").eq("frameworks.is_active",true),
  ]);
  if(f.error||c.error)throw f.error||c.error;
  if(active){setFrameworks(((f.data??[]) as Framework[]).filter(fw=>isBusinessFramework(fw.code)));setControls((c.data??[]) as ControlRow[]);setError("");}
 }catch(e){
  if(active){
   const message=e instanceof Error?e.message:"";
   if(message.includes("تسجيل الدخول")){router.replace("/login");return;}
   setError(message||"تعذر تحميل مركز الامتثال.");
  }
 }finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مركز الامتثال…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مركز الامتثال</h1><p className="catalog-error">{error}</p><Link href="/">العودة إلى الرئيسية</Link></main>;

 return <main className="workflow-page compliance-center-page" dir="rtl">
  <WorkflowHeading title="مركز الامتثال" description="نظرة موحدة على الأطر التنظيمية المفعّلة في CGP. المرجع الرسمي لكل ضابط ونص تنظيمي يبقى الهيئة الوطنية للأمن السيبراني."/>
  {!frameworks.length?<div className="workflow-empty">لا توجد أطر تنظيمية مفعّلة حاليًا.</div>:
  <div className="compliance-framework-grid">{frameworks.map(fw=>{
   const rows=controls.filter(c=>c.framework_id===fw.id);
   const parents=rows.filter(c=>c.hierarchy_level!=="sub_control");
   const subs=rows.filter(c=>c.hierarchy_level==="sub_control");
   const applicable=parents.filter(c=>isApplicable(c.implementation_status));
   const implemented=applicable.filter(c=>isImplemented(c.implementation_status));
   const pct=applicable.length?percentage(implemented.length,applicable.length):null;
   const assessmentHref=ASSESSMENT_ROUTES.find(a=>a.code===fw.code)?.href??null;
   return <Link key={fw.id} href={`/compliance/${fw.code}`} className="compliance-framework-card">
    <div className="compliance-framework-top"><strong dir="ltr">{fw.code}</strong><span className="compliance-framework-version">الإصدار {fw.version}</span></div>
    <p className="compliance-framework-name">{fw.name_ar}</p>
    <div className="compliance-framework-counts">
     {parents.length>0&&<span>{parents.length} ضابط أساسي</span>}
     {subs.length>0&&<span>{subs.length} ضابط فرعي</span>}
    </div>
    <div className="compliance-framework-footer">
     <div className="compliance-framework-pct"><span>نسبة التنفيذ</span><b>{pct===null?"—":`${pct}%`}</b></div>
     <span className={`compliance-framework-assessment ${assessmentHref?"available":"unavailable"}`}>{assessmentHref?"التقييم متاح في CGP":"التقييم غير مفعّل في CGP حاليًا"}</span>
    </div>
   </Link>;
  })}</div>}
 </main>;
}

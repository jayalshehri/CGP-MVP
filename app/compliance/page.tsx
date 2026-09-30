"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cycleLabels } from "@/lib/assessment";
import { assessmentHrefFor, isBusinessFramework } from "@/lib/compliance-frameworks";
import { WorkflowHeading } from "@/components/WorkflowUI";
import "./compliance.css";

type Framework = { id:number; code:string; name_ar:string; version:string };
type ControlRow = { id:number; framework_id:number };
type CycleSummary = { id:number; framework:string; scope_name:string; status:string };

export default function ComplianceCenterPage(){
 const router=useRouter();
 const [frameworks,setFrameworks]=useState<Framework[]>([]);
 const [controls,setControls]=useState<ControlRow[]>([]);
 const [cycles,setCycles]=useState<CycleSummary[]>([]);
 const [role,setRole]=useState<UserRole|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;void(async()=>{try{
  const {profile}=await requireProfile();
  const [f,c,s]=await Promise.all([
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("code"),
   supabase.from("controls").select("id,framework_id,frameworks!inner(is_active)").eq("frameworks.is_active",true),
   supabase.rpc("cgp_assessment_summary"),
  ]);
  if(f.error||c.error)throw f.error||c.error;
  if(active){
   setRole(profile.role);
   setFrameworks(((f.data??[]) as Framework[]).filter(fw=>isBusinessFramework(fw.code)));
   setControls((c.data??[]) as ControlRow[]);
   // An unavailable assessment summary must not block framework navigation.
   setCycles(s.error?[]:(s.data??[]) as CycleSummary[]);
   setError("");
  }
 }catch(e){if(active){const message=e instanceof Error?e.message:"";if(message.includes("تسجيل الدخول")){router.replace("/login");return;}setError(message||"تعذر تحميل مركز الامتثال.");}}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مركز الامتثال…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل مركز الامتثال</h1><p className="catalog-error">{error}</p><Link href="/">العودة إلى الرئيسية</Link></main>;

 return <main className="workflow-page compliance-center-page" dir="rtl">
  <WorkflowHeading title="مركز الامتثال" description="اختر الإطار للعمل على ضوابطه وتقييمه ضمن صلاحياتك."/>
  {!frameworks.length?<div className="workflow-empty">لا توجد أطر تنظيمية مفعّلة حاليًا.</div>:
   <div className="compliance-framework-grid">{frameworks.map(fw=>{
    const frameworkCycles=cycles.filter(c=>c.framework===fw.code);
    const scopes=new Set(frameworkCycles.map(c=>c.scope_name));
    const latest=scopes.size===1?[...frameworkCycles].sort((a,b)=>b.id-a.id)[0]:null;
    const assessmentHref=assessmentHrefFor(fw.code);
    return <article className="compliance-framework-card" key={fw.id}>
     <div className="compliance-framework-heading"><strong dir="ltr">{fw.code}</strong><span>الإصدار <b dir="ltr">{fw.version}</b></span></div>
     <h2>{fw.name_ar}</h2>
     <p>{controls.filter(c=>c.framework_id===fw.id).length} ضابطًا ضمن صلاحياتك</p>
     {latest&&<p className="compliance-cycle-state">آخر دورة: {cycleLabels[latest.status]??latest.status} · {latest.scope_name}</p>}
     <div className="compliance-framework-actions">
      <Link className="workflow-button" href={`/compliance/${encodeURIComponent(fw.code)}`}>فتح مساحة {fw.code} ←</Link>
      {assessmentHref&&role!=="data_governance_team"?<Link href={assessmentHref}>فتح التقييم ←</Link>:!assessmentHref?<span>التقييم غير مفعّل في CGP حاليًا</span>:null}
     </div>
    </article>;
   })}</div>}
 </main>;
}

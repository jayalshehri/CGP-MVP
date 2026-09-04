"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import StatusBadge, { statusText } from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; implementation_notes:string|null; };
type Evidence = { file_path?:string|null; review_notes?:string|null; id:number; evidence_name?:string|null; file_name?:string|null; description?:string|null; status?:string|null };

export default function ControlDetailsPage() {
  const {id}=useParams<{id:string}>(); const router=useRouter();
  const [control,setControl]=useState<Control|null>(null); const [evidence,setEvidence]=useState<Evidence[]>([]);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [canAssign,setCanAssign]=useState(false);
  useEffect(()=>{let active=true;(async()=>{try{
    const {profile}=await requireProfile();if(!active)return;setCanAssign(profile.role!=="control_owner");
    const controlId=Number(id);if(!Number.isSafeInteger(controlId)||controlId<=0)throw new Error("رقم الضابط غير صحيح.");
    const [{data:c,error:ce},{data:e,error:ee}]=await Promise.all([
      supabase.from("controls").select("*").eq("id",controlId).single(),
      supabase.from("evidence").select("*").eq("control_id",controlId).order("uploaded_at",{ascending:false})]);
    if(ce||!c)throw new Error("الضابط غير موجود أو ليس ضمن صلاحيتك.");if(ee)throw ee;
    if(active){setControl(c);setEvidence(e??[]);}
  }catch(e){if(active)setError(e instanceof Error?e.message:"تعذر التحميل");const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");}
  finally{if(active)setLoading(false);}})();return()=>{active=false;};},[id,router]);
  if(loading)return <main dir="rtl" style={{padding:40}}>جاري تحميل الضابط...</main>;
  if(error||!control)return <main dir="rtl" style={{padding:40}}><p role="alert">{error}</p><Link href="/controls">العودة إلى الضوابط</Link></main>;
  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>

    <div className="cgp-page-body" style={{maxWidth:1250,margin:"0 auto",padding:"38px 30px 60px"}}>
      <div style={{marginBottom:25}}><Link href="/controls" style={{color:"#0f7d73",textDecoration:"none",fontWeight:800}}>← العودة إلى الضوابط</Link></div>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}><div style={{flex:1}}><div style={{color:"#0f7d73",fontWeight:800,marginBottom:8}}>{control.control_code}</div><h1 style={{margin:0,fontSize:30}}>{control.title_ar}</h1><div style={{marginTop:12,color:"#687581"}}>{control.domain_ar}</div></div><StatusBadge status={control.implementation_status}/></div>{control.description_ar&&<p style={{borderTop:"1px solid #edf0f2",paddingTop:20,lineHeight:1.9,color:"#4c5964"}}>{control.description_ar}</p>}</section>
      <div className="cgp-responsive-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16,marginBottom:22}}><Info title="حالة التنفيذ" value={statusText(control.implementation_status)}/><Info title="حالة الدليل" value={statusText(control.evidence_status)}/><Info title="حالة التحقق" value={statusText(control.verification_status)}/><Info title="تاريخ الاستحقاق" value={control.due_date||"غير محدد"}/></div>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,gap:12,flexWrap:"wrap"}}><h2 style={{margin:0,fontSize:20}}>المسؤوليات</h2>{canAssign&&<Link href={`/controls/${control.id}/assign`} style={{background:"#0f7d73",color:"white",textDecoration:"none",padding:"10px 15px",borderRadius:9,fontWeight:800,fontSize:14}}>تعيين / تعديل المالك</Link>}</div><div className="cgp-responsive-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:25}}><Info title="مالك الضابط" value={control.control_owner||"غير محدد"}/><Info title="مسؤول الدليل" value={control.evidence_owner||"غير محدد"}/><Info title="آخر مراجعة" value={control.last_review_date||"لم تتم المراجعة"}/></div></section>
      <section style={card}><h2 style={{marginTop:0}}>ملاحظات التنفيذ</h2><div style={{background:"#f8fafb",borderRadius:10,padding:18,color:"#56636f"}}>{control.implementation_notes||"لا توجد ملاحظات تنفيذ مسجلة حاليًا."}</div></section>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:0}}>الأدلة</h2><p style={{color:"#586875"}}>الأدلة المرتبطة بهذا الضابط</p></div><Link href={`/controls/${control.id}/evidence/new`} style={{background:"#0f7d73",color:"white",textDecoration:"none",padding:"10px 15px",borderRadius:9,fontWeight:800}}>+ رفع دليل</Link></div>{evidence.length===0?<div style={{textAlign:"center",padding:35,background:"#f8fafb",borderRadius:12,color:"#586875"}}>لا توجد أدلة مرفوعة</div>:evidence.map(e=><div key={e.id} style={{borderTop:"1px solid #edf0f2",padding:"15px 0"}}><strong>{e.evidence_name||e.file_name||`دليل رقم ${e.id}`}</strong><div style={{color:"#586875",fontSize:13,marginTop:5}}>{statusText(e.status||"")} · {e.description}{e.review_notes&&<p>ملاحظات المراجع: {e.review_notes}</p>}</div><EvidenceDownload path={e.file_path} name={e.file_name}/></div>)}</section>
    </div>
  </main>;
}
const card={background:"white",border:"1px solid #e2e7eb",borderRadius:16,padding:26,marginBottom:22};
function Info({title,value}:{title:string;value:string}){return <div><div style={{fontSize:13,color:"#586875",marginBottom:8}}>{title}</div><div style={{fontWeight:800}}>{value}</div></div>}

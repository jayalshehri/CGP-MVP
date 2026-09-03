import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; implementation_notes:string|null; };
type Evidence = { id:number; evidence_name?:string|null; file_name?:string|null; description?:string|null; status?:string|null };

export default async function ControlDetailsPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; const controlId=Number(id); if(!Number.isInteger(controlId)) notFound();
  const {data:controlData,error:controlError}=await supabase.from("controls").select("*").eq("id",controlId).single();
  if(controlError||!controlData) notFound();
  const {data:evidenceData}=await supabase.from("evidence").select("*").eq("control_id",controlId);
  const control=controlData as Control; const evidence=(evidenceData??[]) as Evidence[];
  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>
    <header style={{height:86,background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 38px"}}><div><div style={{fontSize:24,fontWeight:800}}>Cyber Governance Platform</div><div style={{fontSize:13,opacity:.7,marginTop:5}}>منصة حوكمة الأمن السيبراني</div></div><div>دورة التقييم: 2026</div></header>
    <div style={{maxWidth:1250,margin:"0 auto",padding:"38px 30px 60px"}}>
      <div style={{marginBottom:25}}><Link href="/controls" style={{color:"#0f7d73",textDecoration:"none",fontWeight:800}}>← العودة إلى الضوابط</Link></div>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap"}}><div style={{flex:1}}><div style={{color:"#0f7d73",fontWeight:800,marginBottom:8}}>{control.control_code}</div><h1 style={{margin:0,fontSize:30}}>{control.title_ar}</h1><div style={{marginTop:12,color:"#687581"}}>{control.domain_ar}</div></div><Badge text={statusLabel(control.implementation_status)}/></div>{control.description_ar&&<p style={{borderTop:"1px solid #edf0f2",paddingTop:20,lineHeight:1.9,color:"#4c5964"}}>{control.description_ar}</p>}</section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:16,marginBottom:22}}><Info title="حالة التنفيذ" value={statusLabel(control.implementation_status)}/><Info title="حالة الدليل" value={statusLabel(control.evidence_status)}/><Info title="حالة التحقق" value={statusLabel(control.verification_status)}/><Info title="تاريخ الاستحقاق" value={control.due_date||"غير محدد"}/></div>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,gap:12,flexWrap:"wrap"}}><h2 style={{margin:0,fontSize:20}}>المسؤوليات</h2><Link href={`/controls/${control.id}/assign`} style={{background:"#0f7d73",color:"white",textDecoration:"none",padding:"10px 15px",borderRadius:9,fontWeight:800,fontSize:14}}>تعيين / تعديل المالك</Link></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:25}}><Info title="مالك الضابط" value={control.control_owner||"غير محدد"}/><Info title="مسؤول الدليل" value={control.evidence_owner||"غير محدد"}/><Info title="آخر مراجعة" value={control.last_review_date||"لم تتم المراجعة"}/></div></section>
      <section style={card}><h2 style={{marginTop:0}}>ملاحظات التنفيذ</h2><div style={{background:"#f8fafb",borderRadius:10,padding:18,color:"#56636f"}}>{control.implementation_notes||"لا توجد ملاحظات تنفيذ مسجلة حاليًا."}</div></section>
      <section style={card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:0}}>الأدلة</h2><p style={{color:"#7a8794"}}>الأدلة المرتبطة بهذا الضابط</p></div><Link href={`/controls/${control.id}/evidence/new`} style={{background:"#0f7d73",color:"white",textDecoration:"none",padding:"10px 15px",borderRadius:9,fontWeight:800}}>+ رفع دليل</Link></div>{evidence.length===0?<div style={{textAlign:"center",padding:35,background:"#f8fafb",borderRadius:12,color:"#7a8794"}}>لا توجد أدلة مرفوعة</div>:evidence.map(e=><div key={e.id} style={{borderTop:"1px solid #edf0f2",padding:"15px 0"}}><strong>{e.evidence_name||e.file_name||`دليل رقم ${e.id}`}</strong><div style={{color:"#7a8794",fontSize:13,marginTop:5}}>{e.description||statusLabel(e.status||"")}</div></div>)}</section>
    </div>
  </main>;
}
const card={background:"white",border:"1px solid #e2e7eb",borderRadius:16,padding:26,marginBottom:22};
function Info({title,value}:{title:string;value:string}){return <div><div style={{fontSize:13,color:"#7a8794",marginBottom:8}}>{title}</div><div style={{fontWeight:800}}>{value}</div></div>}
function Badge({text}:{text:string}){return <span style={{background:"#e8f5f2",color:"#0f6f67",padding:"8px 12px",borderRadius:999,fontWeight:800,fontSize:13}}>{text}</span>}
function statusLabel(s:string){const x=(s||"").toLowerCase();if(["compliant","implemented","accepted","verified"].includes(x))return "مكتمل";if(["in_progress","pending_review","under_review"].includes(x))return "قيد العمل";if(["not_implemented","not_uploaded","not_verified"].includes(x))return "غير مكتمل";return s||"غير محدد"}

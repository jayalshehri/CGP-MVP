"use client";

import { WorkflowHeading, WorkflowMetric as Kpi, ResultSummary } from "@/components/WorkflowUI";
import StatusBadge from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Control = { id:number; control_code:string; title_ar:string; evidence_status:string };
type Evidence = { file_path:string|null; is_current:boolean; id:number; control_id:number; evidence_name:string|null; file_name:string|null; description:string|null; status:string|null; uploaded_at:string|null; review_notes:string|null };
type Row = Evidence & { control?:Control };

export default function ReviewPage(){
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [rows,setRows]=useState<Row[]>([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [notes,setNotes]=useState<Record<number,string>>({});
  const [search,setSearch]=useState("");
  const [savingId,setSavingId]=useState<number|null>(null);

  const load=useCallback(async()=>{
    const {data:sessionData}=await supabase.auth.getSession();
    const session=sessionData.session;
    if(!session){router.replace("/login");return;}
    const {data:profile}=await supabase.from("profiles").select("display_name,role,is_active").eq("user_id",session.user.id).maybeSingle();
    if(!profile||profile.is_active===false||!["admin","cybersecurity_team"].includes(profile.role)){router.replace("/");return;}


    const {data:evidenceData,error:evidenceError}=await supabase.from("evidence").select("id,control_id,evidence_name,file_name,description,status,uploaded_at,review_notes,file_path,is_current").in("status",["pending_review","under_review","accepted","rejected"]).order("uploaded_at",{ascending:false});
    if(evidenceError){setError("تعذر تحميل الأدلة: "+evidenceError.message);setLoading(false);return;}
    const evidence=(evidenceData??[]) as Evidence[];
    const ids=[...new Set(evidence.map(e=>e.control_id))];
    let controls:Control[]=[];
    if(ids.length){
      const {data}=await supabase.from("controls").select("id,control_code,title_ar,evidence_status").in("id",ids);
      controls=(data??[]) as Control[];
    }
    const map=new Map(controls.map(c=>[c.id,c]));
    setRows(evidence.map(e=>({...e,control:map.get(e.control_id)})));
    setNotes(Object.fromEntries(evidence.map(e=>[e.id,e.review_notes||""])));
    setLoading(false);
  },[router]);

  useEffect(()=>{const timer=setTimeout(()=>{void load();},0);return()=>clearTimeout(timer);},[load]);

  async function decide(row:Row,status:"accepted"|"rejected"){
    setSavingId(row.id);setError("");setMessage("");
    if(status==="rejected"&&!notes[row.id]?.trim()){setError("يرجى كتابة سبب الرفض.");setSavingId(null);return;}
    const {error:reviewError}=await supabase.rpc("cgp_review_evidence",{p_evidence_id:row.id,p_decision:status,p_notes:notes[row.id]?.trim()||null});
    if(reviewError){setError("تعذر حفظ المراجعة: "+reviewError.message);setSavingId(null);return;}

    setMessage(status==="accepted"?"تم قبول الدليل وتحديث حالة الضابط.":"تم رفض الدليل وإرجاعه للمالك.");
    await load();
    setSavingId(null);
  }

  if(loading)return <main dir="rtl" style={center}>جاري تحميل المراجعة...</main>;
  const pending=rows.filter(r=>r.is_current&&["pending_review","under_review"].includes(r.status||""));
  const matches=(row:Row)=>`${row.evidence_name||""} ${row.control?.control_code||""} ${row.control?.title_ar||""}`.toLowerCase().includes(search.trim().toLowerCase());
  const visiblePending=pending.filter(matches);
  const history=rows.filter(r=>["accepted","rejected"].includes(r.status||""));

  return <main className="workflow-page" dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>

    <section className="cgp-page-body" style={{maxWidth:1300,margin:"0 auto",padding:"38px 28px 60px"}}>
      <WorkflowHeading title="مراجعة الأدلة" description="افتح الدليل، راجع محتواه، ثم وثّق قرارك. سبب الرفض يساعد المالك على التصحيح."/>
{error&&<div role="alert" style={{background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:16}}>{error}</div>}
      {message&&<div role="status" style={{background:"#e8f5f2",color:"#0f6f67",padding:14,borderRadius:10,marginBottom:16}}>{message}</div>}
      <div className="cgp-responsive-grid cgp-kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:16,marginBottom:22}}><Kpi label="بانتظار المراجعة" value={pending.length} tone={pending.length?"warning":"neutral"}/><Kpi label="مقبولة" value={history.filter(r=>r.status==="accepted").length} tone="success"/><Kpi label="مرفوضة" value={history.filter(r=>r.status==="rejected").length} tone={history.some(r=>r.status==="rejected")?"danger":"neutral"}/></div>

      <div className="workflow-filter"><label htmlFor="review-search" className="cgp-field-label">البحث في المراجعات</label><input id="review-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="اسم الدليل أو رقم الضابط"/></div><ResultSummary count={visiblePending.length} total={pending.length} active={!!search} reset={()=>setSearch("")}/><h2 style={{fontSize:21}}>بانتظار القرار</h2>
      {visiblePending.length===0?<div style={empty}>{pending.length?"لا توجد أدلة مطابقة للبحث.":"لا توجد أدلة بانتظار المراجعة."}</div>:visiblePending.map(row=><div key={row.id} style={card}>
        <div className="cgp-responsive-grid" style={{display:"grid",gridTemplateColumns:"1.4fr .8fr",gap:20,alignItems:"start"}}>
          <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13}}>{row.control?.control_code||`ضابط ${row.control_id}`}</div><h3 style={{margin:"7px 0 6px",fontSize:19}}>{row.evidence_name||row.file_name||`دليل ${row.id}`}</h3><div style={{color:"#687581",fontSize:13}}>{row.control?.title_ar||""}</div>{row.description&&<p style={{lineHeight:1.8,color:"#4f5d68"}}>{row.description}</p>}</div>
          <div><div style={{fontSize:12,color:"#586875",marginBottom:5}}>تاريخ الرفع</div><strong>{row.uploaded_at?new Date(row.uploaded_at).toLocaleString("ar-SA"):"غير محدد"}</strong></div>
        </div>
        <label className="cgp-field-label" style={{marginTop:18}} htmlFor={`review-notes-${row.id}`}>ملاحظات المراجع — مطلوبة عند الرفض</label><textarea id={`review-notes-${row.id}`} value={notes[row.id]||""} onChange={e=>setNotes({...notes,[row.id]:e.target.value})} aria-label="ملاحظات المراجع" placeholder="ملاحظات المراجع (مطلوبة عند الرفض)" rows={3} style={{width:"100%",boxSizing:"border-box",marginTop:0,border:"1px solid #ccd6dc",borderRadius:10,padding:12,fontFamily:"inherit",resize:"vertical"}}/>
        <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}><button disabled={savingId!==null} onClick={()=>decide(row,"accepted")} style={accept}>قبول الدليل</button><button disabled={savingId!==null} onClick={()=>decide(row,"rejected")} style={reject}>رفض الدليل</button><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link></div>
      </div>)}

      <h2 style={{fontSize:21,marginTop:32}}>سجل المراجعات</h2>
      {history.filter(matches).length===0?<div style={empty}>لا توجد مراجعات مكتملة بعد.</div>:<div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"hidden"}}>{history.filter(matches).map(row=><div className="cgp-responsive-grid" key={row.id} style={{padding:18,borderBottom:"1px solid #edf0f2",display:"grid",gridTemplateColumns:"1.5fr .7fr auto auto",gap:15,alignItems:"center"}}><div><strong>{row.control?.control_code} · {row.evidence_name||row.file_name}</strong><div style={{fontSize:13,color:"#586875",marginTop:5}}>{row.control?.title_ar}</div>{row.review_notes&&<p className="workflow-review-note">ملاحظات المراجع: {row.review_notes}</p>}</div><StatusBadge status={row.status||""}/><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link></div>)}</div>}
    </section>
  </main>;
}


const card={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:22,marginBottom:16};
const empty={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:35,textAlign:"center" as const,color:"#586875"};
const accept={border:0,background:"#0f7d73",color:"white",padding:"10px 15px",borderRadius:8,fontWeight:800,cursor:"pointer"};
const reject={border:"1px solid #d14343",background:"white",color:"#b42318",padding:"10px 15px",borderRadius:8,fontWeight:800,cursor:"pointer"};
const secondary={background:"#eef3f5",color:"#0b1f33",textDecoration:"none",padding:"10px 13px",borderRadius:8,fontWeight:800,fontSize:13};
const center={minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9",color:"#0b1f33"};

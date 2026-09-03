"use client";

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
  const history=rows.filter(r=>["accepted","rejected"].includes(r.status||""));

  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>
    <header style={{minHeight:86,background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 38px",gap:20}}>
      <div><div style={{fontSize:24,fontWeight:800}}>Cyber Governance Platform</div><div style={{fontSize:13,opacity:.7,marginTop:5}}>التقييم والتحقق</div></div>
      <Link href="/evidence" style={{color:"white",textDecoration:"none",border:"1px solid rgba(255,255,255,.25)",borderRadius:9,padding:"10px 14px"}}>مركز الأدلة</Link>
    </header>
    <section style={{maxWidth:1300,margin:"0 auto",padding:"38px 28px 60px"}}>
      <div style={{marginBottom:26}}><div style={{color:"#0f7d73",fontWeight:800,fontSize:13,marginBottom:8}}>REVIEW & VERIFY</div><h1 style={{margin:0,fontSize:34}}>مراجعة الأدلة</h1><p style={{color:"#7a8794"}}>قبول أو رفض الأدلة المرسلة من ملاك الضوابط مع توثيق ملاحظات المراجع.</p></div>
      {error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:16}}>{error}</div>}
      {message&&<div style={{background:"#e8f5f2",color:"#0f6f67",padding:14,borderRadius:10,marginBottom:16}}>{message}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:16,marginBottom:22}}><Kpi label="بانتظار المراجعة" value={pending.length}/><Kpi label="مقبولة" value={history.filter(r=>r.status==="accepted").length}/><Kpi label="مرفوضة" value={history.filter(r=>r.status==="rejected").length}/></div>

      <h2 style={{fontSize:21}}>قائمة المراجعة</h2>
      {pending.length===0?<div style={empty}>لا توجد أدلة بانتظار المراجعة.</div>:pending.map(row=><div key={row.id} style={card}>
        <div style={{display:"grid",gridTemplateColumns:"1.4fr .8fr",gap:20,alignItems:"start"}}>
          <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13}}>{row.control?.control_code||`Control ${row.control_id}`}</div><h3 style={{margin:"7px 0 6px",fontSize:19}}>{row.evidence_name||row.file_name||`دليل ${row.id}`}</h3><div style={{color:"#687581",fontSize:13}}>{row.control?.title_ar||""}</div>{row.description&&<p style={{lineHeight:1.8,color:"#4f5d68"}}>{row.description}</p>}</div>
          <div><div style={{fontSize:12,color:"#7a8794",marginBottom:5}}>تاريخ الرفع</div><strong>{row.uploaded_at?new Date(row.uploaded_at).toLocaleString("ar-SA"):"غير محدد"}</strong></div>
        </div>
        <textarea value={notes[row.id]||""} onChange={e=>setNotes({...notes,[row.id]:e.target.value})} aria-label="ملاحظات المراجع" placeholder="ملاحظات المراجع (مطلوبة عند الرفض)" rows={3} style={{width:"100%",boxSizing:"border-box",marginTop:18,border:"1px solid #ccd6dc",borderRadius:10,padding:12,fontFamily:"Arial",resize:"vertical"}}/>
        <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}><button disabled={savingId!==null} onClick={()=>decide(row,"accepted")} style={accept}>قبول الدليل</button><button disabled={savingId!==null} onClick={()=>decide(row,"rejected")} style={reject}>رفض الدليل</button><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link></div>
      </div>)}

      <h2 style={{fontSize:21,marginTop:32}}>سجل المراجعات</h2>
      {history.length===0?<div style={empty}>لا توجد مراجعات مكتملة بعد.</div>:<div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"hidden"}}>{history.map(row=><div key={row.id} style={{padding:18,borderBottom:"1px solid #edf0f2",display:"grid",gridTemplateColumns:"1.5fr .7fr .7fr",gap:15,alignItems:"center"}}><div><strong>{row.control?.control_code} · {row.evidence_name||row.file_name}</strong><div style={{fontSize:13,color:"#7a8794",marginTop:5}}>{row.control?.title_ar}</div></div><Status value={row.status==="accepted"?"مقبول":"مرفوض"}/><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link></div>)}</div>}
    </section>
  </main>;
}

function Kpi({label,value}:{label:string;value:number}){return <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:20}}><div style={{fontSize:13,color:"#7a8794",marginBottom:8}}>{label}</div><div style={{fontSize:29,fontWeight:800,color:"#0f7d73"}}>{value}</div></div>}
function Status({value}:{value:string}){return <span style={{display:"inline-block",background:"#e8f5f2",color:"#0f6f67",borderRadius:999,padding:"7px 10px",fontSize:12,fontWeight:800,width:"fit-content"}}>{value}</span>}
const card={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:22,marginBottom:16};
const empty={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:35,textAlign:"center" as const,color:"#7a8794"};
const accept={border:0,background:"#0f7d73",color:"white",padding:"10px 15px",borderRadius:8,fontWeight:800,cursor:"pointer"};
const reject={border:"1px solid #d14343",background:"white",color:"#b42318",padding:"10px 15px",borderRadius:8,fontWeight:800,cursor:"pointer"};
const secondary={background:"#eef3f5",color:"#0b1f33",textDecoration:"none",padding:"10px 13px",borderRadius:8,fontWeight:800,fontSize:13};
const center={minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9",color:"#0b1f33"};
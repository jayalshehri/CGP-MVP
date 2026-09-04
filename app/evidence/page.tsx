"use client";

import { WorkflowHeading, WorkflowMetric as Kpi, ResultSummary } from "@/components/WorkflowUI";
import StatusBadge from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; control_owner_id:string|null };
type Evidence = { is_current:boolean; id:number; control_id:number; evidence_name:string|null; description:string|null; file_name:string|null; file_path:string|null; status:string|null; uploaded_at:string|null; reviewed_at:string|null; review_notes:string|null };

type EvidenceRow = Evidence & { control?:Control };



export default function EvidencePage(){
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [role,setRole]=useState<UserRole>("control_owner");
  const [rows,setRows]=useState<EvidenceRow[]>([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
  const [scope,setScope]=useState("current");
  const [error,setError]=useState("");

  useEffect(()=>{
    async function load(){
      const {data:sessionData}=await supabase.auth.getSession();
      const session=sessionData.session;
      if(!session){router.replace("/login");return;}

      const {data:profile}=await supabase.from("profiles").select("role,is_active").eq("user_id",session.user.id).maybeSingle();
      if(!profile||profile.is_active===false){setError("تعذر التحقق من صلاحية المستخدم.");setLoading(false);return;}
      const userRole=(profile.role||"control_owner") as UserRole;
      setRole(userRole);

      let controlQuery=supabase.from("controls").select("id,control_code,title_ar,domain_ar,control_owner_id").order("id");
      if(userRole==="control_owner") controlQuery=controlQuery.eq("control_owner_id",session.user.id);
      const {data:controlData,error:controlError}=await controlQuery;
      if(controlError){setError("تعذر تحميل الضوابط: "+controlError.message);setLoading(false);return;}

      const controls=(controlData??[]) as Control[];
      if(controls.length===0){setRows([]);setLoading(false);return;}
      const ids=controls.map(c=>c.id);
      const {data:evidenceData,error:evidenceError}=await supabase.from("evidence").select("id,control_id,evidence_name,description,file_name,file_path,status,uploaded_at,reviewed_at,review_notes,is_current").in("control_id",ids).order("uploaded_at",{ascending:false});
      if(evidenceError){setError("تعذر تحميل الأدلة: "+evidenceError.message);setLoading(false);return;}

      const map=new Map(controls.map(c=>[c.id,c]));
      setRows(((evidenceData??[]) as Evidence[]).map(e=>({...e,control:map.get(e.control_id)})));
      setLoading(false);
    }
    load();
  },[router]);

  const filtered=useMemo(()=>rows.filter(row=>{
    const q=search.trim().toLowerCase();
    const text=`${row.evidence_name||""} ${row.file_name||""} ${row.control?.control_code||""} ${row.control?.title_ar||""}`.toLowerCase();
    const matchesSearch=!q||text.includes(q);
    const matchesStatus=status==="all"||(row.status||"")===status;
    return matchesSearch&&matchesStatus&&(scope==="all"||row.is_current);
  }),[rows,search,status,scope]);

  const scoped=rows.filter(row=>scope==="all"||row.is_current);
  const pending=scoped.filter(r=>["pending_review","under_review"].includes(r.status||"")).length;
  const accepted=scoped.filter(r=>r.status==="accepted").length;
  const rejected=scoped.filter(r=>r.status==="rejected").length;

  if(loading)return <main dir="rtl" style={center}>جاري تحميل مركز الأدلة...</main>;
 if(error)return <main dir="rtl"><h1>تعذر تحميل البيانات</h1><p role="alert">{error}</p><button onClick={()=>window.location.reload()}>إعادة المحاولة</button></main>;


  return <main className="workflow-page" dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}}>

    <div className="cgp-page-body" style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>

      <section style={{flex:1,padding:40,minWidth:0}}>
        <WorkflowHeading title="الأدلة" description="تابع الأدلة وحالة مراجعتها، وارجع إلى الضابط لاتخاذ الخطوة التالية." action={<Link className="workflow-button" href="/controls">اختيار ضابط لرفع دليل ←</Link>}/>
{error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:18}}>{error}</div>}
        <div className="workflow-tabs" role="group" aria-label="نطاق الأدلة"><button aria-pressed={scope==="current"} onClick={()=>setScope("current")}>الإرسالات الحالية</button><button aria-pressed={scope==="all"} onClick={()=>setScope("all")}>جميع الإصدارات</button></div>
        <div className="cgp-responsive-grid cgp-kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:22}}><Kpi label="إجمالي الأدلة" value={scoped.length}/><Kpi label="بانتظار المراجعة" value={pending} tone={pending?"warning":"neutral"}/><Kpi label="مقبولة" value={accepted} tone="success"/><Kpi label="مرفوضة" value={rejected} tone={rejected?"danger":"neutral"}/></div>
        <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:18,marginBottom:18,display:"flex",gap:12,flexWrap:"wrap"}}>
          <div className="cgp-filter-field"><label className="cgp-field-label" htmlFor="evidence-search">البحث في الأدلة</label><input id="evidence-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم الدليل أو رقم الضابط" style={{flex:1,minWidth:260,border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",fontSize:14}}/>
          </div><div className="cgp-filter-field"><label className="cgp-field-label" htmlFor="evidence-filter">حالة الدليل</label><select id="evidence-filter" value={status} onChange={e=>setStatus(e.target.value)} style={{border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",background:"white"}}><option value="all">كل الحالات</option><option value="pending_review">بانتظار المراجعة</option><option value="under_review">قيد المراجعة</option><option value="accepted">مقبول</option><option value="rejected">مرفوض</option></select></div>
        </div>
        <ResultSummary count={filtered.length} total={scoped.length} active={!!search||status!=="all"} reset={()=>{setSearch("");setStatus("all");}}/>
<div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"hidden"}}>
          {filtered.length===0?<div style={{padding:45,textAlign:"center",color:"#586875"}}>لا توجد أدلة مطابقة حاليًا.</div>:filtered.map(row=><div className="workflow-row cgp-responsive-grid" key={row.id} style={{padding:20,borderBottom:"1px solid #edf0f2",display:"grid",gridTemplateColumns:"1.6fr 1fr .8fr auto",gap:16,alignItems:"center"}}>
            <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13}}>{row.control?.control_code||`ضابط ${row.control_id}`}</div><div style={{fontWeight:800,marginTop:6}}>{row.evidence_name||row.file_name||`دليل ${row.id}`}</div><div style={{fontSize:13,color:"#586875",marginTop:5}}>{row.control?.title_ar||""}</div></div>
            <div><div style={{fontSize:12,color:"#586875",marginBottom:5}}>تاريخ الرفع</div><strong>{row.uploaded_at?new Date(row.uploaded_at).toLocaleDateString("ar-SA"):"غير محدد"}</strong></div>
            <div><StatusBadge status={row.status||""}/>{!row.is_current&&<small className="workflow-version">إصدار سابق</small>}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link>{role!=="control_owner"&&row.is_current&&["pending_review","under_review"].includes(row.status||"")&&<Link href="/review" style={primary}>مراجعة</Link>}</div>
          </div>)}
        </div>
      </section>
    </div>
  </main>;
}



const primary={background:"#0f7d73",color:"white",textDecoration:"none",padding:"9px 12px",borderRadius:8,fontWeight:800,fontSize:13};
const secondary={background:"#eef3f5",color:"#0b1f33",textDecoration:"none",padding:"9px 12px",borderRadius:8,fontWeight:800,fontSize:13};
const center={minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9",color:"#0b1f33"};

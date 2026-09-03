"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";
type Control = { id:number; control_code:string; title_ar:string; domain_ar:string; control_owner_id:string|null };
type Evidence = { id:number; control_id:number; evidence_name:string|null; description:string|null; file_name:string|null; file_path:string|null; status:string|null; uploaded_at:string|null; reviewed_at:string|null; review_notes:string|null };

type EvidenceRow = Evidence & { control?:Control };

const menu = [
  {name:"لوحة المتابعة",href:"/"},
  {name:"الضوابط",href:"/controls"},
  {name:"مهامي / التكليفات",href:"/tasks"},
  {name:"الأدلة",href:"/evidence"},
];

export default function EvidencePage(){
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [role,setRole]=useState<UserRole>("control_owner");
  const [rows,setRows]=useState<EvidenceRow[]>([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
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
      const {data:evidenceData,error:evidenceError}=await supabase.from("evidence").select("id,control_id,evidence_name,description,file_name,file_path,status,uploaded_at,reviewed_at,review_notes").in("control_id",ids).order("uploaded_at",{ascending:false});
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
    return matchesSearch&&matchesStatus;
  }),[rows,search,status]);

  const pending=rows.filter(r=>["pending_review","under_review"].includes(r.status||"")).length;
  const accepted=rows.filter(r=>r.status==="accepted").length;
  const rejected=rows.filter(r=>r.status==="rejected").length;

  if(loading)return <main dir="rtl" style={center}>جاري تحميل مركز الأدلة...</main>;

  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}}>
    <header style={{minHeight:86,background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 38px",gap:20}}>
      <div><div style={{fontSize:24,fontWeight:800}}>Cyber Governance Platform</div><div style={{fontSize:13,opacity:.7,marginTop:5}}>مركز الأدلة</div></div>
      {role!=="control_owner"&&<Link href="/review" style={{color:"white",textDecoration:"none",border:"1px solid rgba(255,255,255,.25)",borderRadius:9,padding:"10px 14px"}}>فتح المراجعة والتحقق</Link>}
    </header>
    <div style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>
      <aside style={{width:260,background:"white",borderLeft:"1px solid #e2e7eb",padding:"28px 20px",flexShrink:0}}>
        {menu.map(item=><Link key={item.href} href={item.href} style={{display:"block",padding:"15px 18px",marginBottom:7,borderRadius:10,textDecoration:"none",fontSize:15,fontWeight:item.href==="/evidence"?800:400,background:item.href==="/evidence"?"#e8f5f2":"transparent",color:item.href==="/evidence"?"#0f6f67":"#44515c"}}>{item.name}</Link>)}
      </aside>
      <section style={{flex:1,padding:40,minWidth:0}}>
        <div style={{marginBottom:26}}><div style={{color:"#0f7d73",fontWeight:800,fontSize:13,marginBottom:8}}>EVIDENCE</div><h1 style={{margin:0,fontSize:34}}>الأدلة</h1><p style={{color:"#7a8794"}}>متابعة الأدلة المرفوعة وحالة مراجعتها وربطها بالضوابط.</p></div>
        {error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:18}}>{error}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:22}}><Kpi label="إجمالي الأدلة" value={rows.length}/><Kpi label="بانتظار المراجعة" value={pending}/><Kpi label="مقبولة" value={accepted}/><Kpi label="مرفوضة" value={rejected}/></div>
        <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:18,marginBottom:18,display:"flex",gap:12,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث باسم الدليل أو رقم الضابط" style={{flex:1,minWidth:260,border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",fontSize:14}}/>
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",background:"white"}}><option value="all">كل الحالات</option><option value="pending_review">بانتظار المراجعة</option><option value="under_review">قيد المراجعة</option><option value="accepted">مقبول</option><option value="rejected">مرفوض</option></select>
        </div>
        <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"hidden"}}>
          {filtered.length===0?<div style={{padding:45,textAlign:"center",color:"#7a8794"}}>لا توجد أدلة مطابقة حاليًا.</div>:filtered.map(row=><div key={row.id} style={{padding:20,borderBottom:"1px solid #edf0f2",display:"grid",gridTemplateColumns:"1.6fr 1fr .8fr auto",gap:16,alignItems:"center"}}>
            <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13}}>{row.control?.control_code||`Control ${row.control_id}`}</div><div style={{fontWeight:800,marginTop:6}}>{row.evidence_name||row.file_name||`دليل ${row.id}`}</div><div style={{fontSize:13,color:"#7a8794",marginTop:5}}>{row.control?.title_ar||""}</div></div>
            <div><div style={{fontSize:12,color:"#7a8794",marginBottom:5}}>تاريخ الرفع</div><strong>{row.uploaded_at?new Date(row.uploaded_at).toLocaleDateString("ar-SA"):"غير محدد"}</strong></div>
            <Status value={statusLabel(row.status||"")}/>
            <div style={{display:"flex",gap:8}}><Link href={`/controls/${row.control_id}`} style={secondary}>فتح الضابط</Link>{role!=="control_owner"&&<Link href="/review" style={primary}>مراجعة</Link>}</div>
          </div>)}
        </div>
      </section>
    </div>
  </main>;
}

function Kpi({label,value}:{label:string;value:number}){return <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:20}}><div style={{fontSize:13,color:"#7a8794",marginBottom:8}}>{label}</div><div style={{fontSize:29,fontWeight:800,color:"#0f7d73"}}>{value}</div></div>}
function Status({value}:{value:string}){return <span style={{display:"inline-block",background:"#e8f5f2",color:"#0f6f67",borderRadius:999,padding:"7px 10px",fontSize:12,fontWeight:800}}>{value}</span>}
function statusLabel(s:string){if(s==="accepted")return"مقبول";if(s==="rejected")return"مرفوض";if(s==="under_review")return"قيد المراجعة";if(s==="pending_review")return"بانتظار المراجعة";return s||"غير محدد"}
const primary={background:"#0f7d73",color:"white",textDecoration:"none",padding:"9px 12px",borderRadius:8,fontWeight:800,fontSize:13};
const secondary={background:"#eef3f5",color:"#0b1f33",textDecoration:"none",padding:"9px 12px",borderRadius:8,fontWeight:800,fontSize:13};
const center={minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9",color:"#0b1f33"};
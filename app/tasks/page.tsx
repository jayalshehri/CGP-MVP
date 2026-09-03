"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";
type ControlTask = {
  id:number;
  control_code:string;
  title_ar:string;
  domain_ar:string;
  implementation_status:string;
  evidence_status:string;
  verification_status:string;
  due_date:string|null;
  control_owner_id:string|null;
  control_owner:string|null;
};

const menu = [
  {name:"لوحة المتابعة",href:"/"},
  {name:"الضوابط",href:"/controls"},
  {name:"مهامي / التكليفات",href:"/tasks"},
  {name:"إدارة المستخدمين",href:"/users"},
];

export default function TasksPage(){
  const router=useRouter();
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [role,setRole]=useState<UserRole>("control_owner");
  const [tasks,setTasks]=useState<ControlTask[]>([]);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");

  useEffect(()=>{
    async function load(){
      const {data:sessionData}=await supabase.auth.getSession();
      const session=sessionData.session;
      if(!session){router.replace("/login");return;}
      const {data:profile,error:profileError}=await supabase.from("profiles").select("role,is_active").eq("user_id",session.user.id).maybeSingle();
      if(profileError||!profile||profile.is_active===false){setError("تعذر التحقق من صلاحية المستخدم.");setLoading(false);return;}
      const userRole=(profile.role||"control_owner") as UserRole;
      setRole(userRole);
      let query=supabase.from("controls").select("id,control_code,title_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner_id,control_owner").order("due_date",{ascending:true,nullsFirst:false});
      if(userRole==="control_owner") query=query.eq("control_owner_id",session.user.id);
      const {data,error:controlsError}=await query;
      if(controlsError){setError("تعذر تحميل التكليفات: "+controlsError.message);setLoading(false);return;}
      setTasks((data??[]) as ControlTask[]);
      setLoading(false);
    }
    load();
  },[router]);

  const filtered=useMemo(()=>tasks.filter(t=>{
    const q=search.trim().toLowerCase();
    const matchesSearch=!q||`${t.control_code} ${t.title_ar} ${t.domain_ar} ${t.control_owner||""}`.toLowerCase().includes(q);
    const normalized=(t.implementation_status||"").toLowerCase();
    const matchesFilter=filter==="all"||
      (filter==="done"&&["implemented","compliant"].includes(normalized))||
      (filter==="progress"&&["in_progress","pending_review","under_review"].includes(normalized))||
      (filter==="pending"&&!["implemented","compliant"].includes(normalized));
    return matchesSearch&&matchesFilter;
  }),[tasks,search,filter]);

  const overdue=tasks.filter(t=>t.due_date&&new Date(t.due_date)<new Date()&&!['implemented','compliant'].includes((t.implementation_status||'').toLowerCase())).length;
  const waitingEvidence=tasks.filter(t=>!['uploaded','accepted','approved','verified'].includes((t.evidence_status||'').toLowerCase())).length;
  const completed=tasks.filter(t=>['implemented','compliant'].includes((t.implementation_status||'').toLowerCase())).length;

  if(loading)return <main dir="rtl" style={center}>جاري تحميل مهامك...</main>;

  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}}>
    <header style={{minHeight:86,background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 38px",gap:20}}>
      <div><div style={{fontSize:24,fontWeight:800}}>Cyber Governance Platform</div><div style={{fontSize:13,opacity:.7,marginTop:5}}>منصة حوكمة الأمن السيبراني</div></div>
      <div style={{fontSize:14}}>دورة التقييم: 2026</div>
    </header>
    <div style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>
      <aside style={{width:260,background:"white",borderLeft:"1px solid #e2e7eb",padding:"28px 20px",flexShrink:0}}>
        {menu.filter(x=>x.name!=="إدارة المستخدمين"||role==="admin").map(item=><Link key={item.href} href={item.href} style={{display:"block",padding:"15px 18px",marginBottom:7,borderRadius:10,textDecoration:"none",fontSize:15,fontWeight:item.href==="/tasks"?800:400,background:item.href==="/tasks"?"#e8f5f2":"transparent",color:item.href==="/tasks"?"#0f6f67":"#44515c"}}>{item.name}</Link>)}
      </aside>
      <section style={{flex:1,padding:40,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",flexWrap:"wrap",marginBottom:26}}>
          <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13,marginBottom:8}}>WORKFLOW</div><h1 style={{margin:0,fontSize:34}}>{role==="control_owner"?"مهامي":"التكليفات"}</h1><p style={{color:"#7a8794"}}>متابعة الضوابط المكلفة، الاستحقاقات، الأدلة وحالة التحقق من مكان واحد.</p></div>
          <Link href="/controls" style={{background:"#0f7d73",color:"white",textDecoration:"none",padding:"12px 17px",borderRadius:9,fontWeight:800}}>عرض جميع الضوابط</Link>
        </div>
        {error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:18}}>{error}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:16,marginBottom:22}}>
          <Kpi label="إجمالي التكليفات" value={tasks.length}/><Kpi label="مكتملة" value={completed}/><Kpi label="بانتظار أدلة" value={waitingEvidence}/><Kpi label="متأخرة" value={overdue}/>
        </div>
        <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:18,marginBottom:18,display:"flex",gap:12,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث برقم الضابط أو العنوان أو المجال" style={{flex:1,minWidth:260,border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",fontSize:14}}/>
          <select value={filter} onChange={e=>setFilter(e.target.value)} style={{border:"1px solid #ccd6dc",borderRadius:9,padding:"11px 13px",background:"white"}}><option value="all">كل الحالات</option><option value="pending">غير مكتملة</option><option value="progress">قيد العمل</option><option value="done">مكتملة</option></select>
        </div>
        <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"hidden"}}>
          {filtered.length===0?<div style={{padding:45,textAlign:"center",color:"#7a8794"}}>لا توجد تكليفات مطابقة حاليًا.</div>:filtered.map(task=>{
            const isOverdue=!!task.due_date&&new Date(task.due_date)<new Date()&&!['implemented','compliant'].includes((task.implementation_status||'').toLowerCase());
            return <div key={task.id} style={{padding:20,borderBottom:"1px solid #edf0f2",display:"grid",gridTemplateColumns:"1.6fr .8fr .8fr .8fr auto",gap:15,alignItems:"center"}}>
              <div><div style={{color:"#0f7d73",fontWeight:800,fontSize:13}}>{task.control_code}</div><div style={{fontWeight:800,marginTop:6}}>{task.title_ar}</div><div style={{fontSize:13,color:"#7a8794",marginTop:5}}>{task.domain_ar}{role!=="control_owner"&&task.control_owner?` · ${task.control_owner}`:""}</div></div>
              <Status label="التنفيذ" value={statusLabel(task.implementation_status)}/>
              <Status label="الدليل" value={statusLabel(task.evidence_status)}/>
              <div><div style={{fontSize:12,color:"#7a8794",marginBottom:5}}>الاستحقاق</div><div style={{fontWeight:800,color:isOverdue?"#b42318":"#0b1f33"}}>{task.due_date||"غير محدد"}</div></div>
              <Link href={`/controls/${task.id}`} style={{background:"#eef3f5",color:"#0b1f33",textDecoration:"none",padding:"10px 13px",borderRadius:8,fontWeight:800,fontSize:13}}>فتح الضابط</Link>
            </div>
          })}
        </div>
      </section>
    </div>
  </main>;
}

function Kpi({label,value}:{label:string;value:number}){return <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:20}}><div style={{fontSize:13,color:"#7a8794",marginBottom:8}}>{label}</div><div style={{fontSize:29,fontWeight:800,color:"#0f7d73"}}>{value}</div></div>}
function Status({label,value}:{label:string;value:string}){return <div><div style={{fontSize:12,color:"#7a8794",marginBottom:5}}>{label}</div><span style={{display:"inline-block",background:"#e8f5f2",color:"#0f6f67",borderRadius:999,padding:"6px 9px",fontSize:12,fontWeight:800}}>{value}</span></div>}
function statusLabel(s:string){const x=(s||"").toLowerCase();if(["compliant","implemented","accepted","approved","verified","uploaded"].includes(x))return "مكتمل";if(["in_progress","pending_review","under_review"].includes(x))return "قيد العمل";if(["not_implemented","not_uploaded","not_verified","not_started"].includes(x))return "غير مكتمل";return s||"غير محدد"}
const center={minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9",color:"#0b1f33"};

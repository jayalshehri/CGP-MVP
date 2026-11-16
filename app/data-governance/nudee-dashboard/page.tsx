"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";
type Requirement={id:number;domain_name:string;maturity_level:string;source_compliance:string|null;standard_code:string};
type Assignment={requirement_id:number;status:string};
export default function NudeeDashboard(){
 const [rows,setRows]=useState<Requirement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void Promise.resolve().then(async()=>{
  await requireProfile(["admin","data_governance_team"]);
  const [r,a]=await Promise.all([
   supabase.from("nudee_requirements").select("id,domain_name,maturity_level,source_compliance,standard_code").limit(1000),
   supabase.from("nudee_assignments").select("requirement_id,status").limit(1000)
  ]);
  if(r.error||a.error)throw r.error||a.error;
  if(active){setRows((r.data||[]) as Requirement[]);setAssignments((a.data||[]) as Assignment[]);}
 }).catch(e=>{if(active)setError(e instanceof Error?e.message:"تعذر تحميل لوحة نُضيء");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[]);
 const domains=useMemo(()=>Object.entries(rows.reduce((acc,r)=>{acc[r.domain_name]=(acc[r.domain_name]||0)+1;return acc;},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]),[rows]);
 const levels=useMemo(()=>Object.entries(rows.reduce((acc,r)=>{acc[r.maturity_level]=(acc[r.maturity_level]||0)+1;return acc;},{} as Record<string,number>)),[rows]);
 const count=(status:string)=>assignments.filter(a=>a.status===status).length;
 const approved=count("approved");
 return <main className="dg-page" dir="rtl" style={{maxWidth:1220,margin:"auto"}}>
 <div className="workflow-heading"><div><span>مكتب إدارة البيانات / مؤشر نُضيء</span><h1>لوحة مؤشر نُضيء</h1><p>ملخص تفاعلي للمجالات ومستويات النضج والتكليفات والأدلة</p></div></div>
 <nav aria-label="التنقل داخل نُضيء" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24}}><Link href="/data-governance/nudee">التكليفات والأدلة</Link><Link href="/data-governance/nudee-dashboard" aria-current="page">لوحة مؤشر نُضيء</Link></nav>
 {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
 {loading?<p>جاري تحميل المؤشرات…</p>:<><section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
 {[["إجمالي الأدلة",rows.length],["المسندة",assignments.filter(a=>a.status!=="unassigned").length],["بانتظار التحقق",count("submitted")],["الأدلة المعتمدة",approved],["المعادة للتعديل",count("changes_requested")]].map(([label,n])=><div key={label} style={{padding:20,borderRadius:14,background:"#f1f5f9",border:"1px solid #e2e8f0"}}><div style={{color:"#475569",fontSize:13}}>{label}</div><strong style={{fontSize:30,color:"#0f172a"}}>{n}</strong></div>)}
 </section>
 <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:24,marginTop:24}}>
 <div style={{background:"white",padding:20,border:"1px solid #e2e8f0",borderRadius:14}}><h2>توزيع الأدلة حسب مستوى النضج</h2>{levels.map(([label,n])=><div key={label} style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><span>{label}</span><b>{n}</b></div><div style={{background:"#e2e8f0",borderRadius:20,height:10,overflow:"hidden"}}><div style={{height:"100%",width:`${rows.length?100*n/rows.length:0}%`,background:"#0f766e"}}/></div></div>)}</div>
 <div style={{background:"white",padding:20,border:"1px solid #e2e8f0",borderRadius:14}}><h2>توزيع الأدلة حسب المجال</h2>{domains.map(([label,n])=><div key={label} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><span>{label}</span><b>{n}</b></div><div style={{background:"#e2e8f0",borderRadius:20,height:8,overflow:"hidden"}}><div style={{height:"100%",width:`${rows.length?100*n/rows.length:0}%`,background:"#0f766e"}}/></div></div>)}</div>
 </section>
 {!rows.length&&<p role="status" style={{marginTop:20}}>لا توجد متطلبات مستوردة بعد. ستظهر المؤشرات بعد استيراد ملف نُضيء والتحقق من البيانات.</p>}
 <p style={{marginTop:20,fontSize:12,color:"#64748b"}}>تعرض اللوحة بيانات قاعدة CGP الفعلية؛ اعتماد الدليل لا يعني تلقائيًا تحقيق النضج الرسمي.</p></>}
 </main>;
}

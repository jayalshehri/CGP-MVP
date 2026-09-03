"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Control={id:number;control_code:string;title_ar:string;domain_ar:string;implementation_status:string;evidence_status:string;verification_status:string;due_date:string|null;control_owner:string|null};
type Evidence={id:number;status:string|null};

type DomainRow={name:string;total:number;done:number;verified:number;overdue:number};

const good=(v:string|null|undefined)=>["implemented","compliant","accepted","approved","verified","uploaded"].includes((v||"").toLowerCase());
const progress=(v:string|null|undefined)=>["in_progress","pending_review","under_review"].includes((v||"").toLowerCase());

export default function ReportsPage(){
 const router=useRouter();
 const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const [controls,setControls]=useState<Control[]>([]); const [evidence,setEvidence]=useState<Evidence[]>([]);
 useEffect(()=>{(async()=>{
  const {data:s}=await supabase.auth.getSession(); if(!s.session){router.replace("/login");return;}
  const {data:p}=await supabase.from("profiles").select("role,is_active").eq("user_id",s.session.user.id).maybeSingle();
  if(!p||p.is_active===false||!["admin","cybersecurity_team"].includes(p.role)){router.replace("/");return;}
  const [{data:c,error:ce},{data:e,error:ee}]=await Promise.all([
   supabase.from("controls").select("id,control_code,title_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner").order("id"),
   supabase.from("evidence").select("id,status")
  ]);
  if(ce||ee){setError(ce?.message||ee?.message||"تعذر تحميل التقارير");setLoading(false);return;}
  setControls((c??[]) as Control[]); setEvidence((e??[]) as Evidence[]); setLoading(false);
 })()},[router]);
 const stats=useMemo(()=>{
  const now=new Date(); const total=controls.length; const done=controls.filter(c=>good(c.implementation_status)).length;
  const verified=controls.filter(c=>good(c.verification_status)).length;
  const overdue=controls.filter(c=>c.due_date&&new Date(c.due_date)<now&&!good(c.implementation_status)).length;
  const pendingEvidence=evidence.filter(e=>progress(e.status)).length;
  return {total,done,verified,overdue,pendingEvidence,compliance:total?Math.round(done/total*100):0};
 },[controls,evidence]);
 const domains=useMemo(()=>{
  const m=new Map<string,DomainRow>(); const now=new Date();
  controls.forEach(c=>{const name=c.domain_ar||"غير مصنف";const r=m.get(name)||{name,total:0,done:0,verified:0,overdue:0};r.total++;if(good(c.implementation_status))r.done++;if(good(c.verification_status))r.verified++;if(c.due_date&&new Date(c.due_date)<now&&!good(c.implementation_status))r.overdue++;m.set(name,r)});
  return [...m.values()].sort((a,b)=>b.total-a.total);
 },[controls]);
 function exportCsv(){
  const rows=[["Control Code","Title","Domain","Implementation","Evidence","Verification","Due Date","Owner"],...controls.map(c=>[c.control_code,c.title_ar,c.domain_ar,c.implementation_status,c.evidence_status,c.verification_status,c.due_date||"",c.control_owner||""])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n"); const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`CGP-Report-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
 }
 if(loading)return <main dir="rtl" style={center}>جاري تجهيز التقارير...</main>;
 return <main dir="rtl" style={page}>
  <header style={header}><div><div style={{fontSize:24,fontWeight:800}}>Cyber Governance Platform</div><div style={{fontSize:13,opacity:.7,marginTop:5}}>التقارير ومؤشرات الالتزام</div></div><div style={{display:"flex",gap:10}}><Link href="/executive" style={ghostDark}>اللوحة التنفيذية</Link><Link href="/" style={ghostDark}>لوحة المتابعة</Link></div></header>
  <div style={{display:"flex",minHeight:"calc(100vh - 86px)"}}><aside style={aside}>{[["لوحة المتابعة","/"],["الضوابط","/controls"],["التكليفات","/tasks"],["الأدلة","/evidence"],["التقييم والتحقق","/review"],["التقارير","/reports"],["اللوحة التنفيذية","/executive"]].map(([n,h])=><Link key={h} href={h} style={{...nav,background:h==="/reports"?"#e8f5f2":"transparent",color:h==="/reports"?"#0f6f67":"#44515c",fontWeight:h==="/reports"?800:400}}>{n}</Link>)}</aside>
  <section style={{flex:1,padding:40,minWidth:0}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:20,flexWrap:"wrap",marginBottom:26}}><div><div style={eyebrow}>REPORTING</div><h1 style={h1}>تقارير الالتزام</h1><p style={muted}>مؤشرات لحظية مستخرجة من بيانات الضوابط والأدلة في CGP.</p></div><button onClick={exportCsv} style={primary}>تصدير CSV</button></div>
   {error&&<div style={errorBox}>{error}</div>}
   <div style={kpiGrid}><Kpi label="نسبة الالتزام" value={`${stats.compliance}%`}/><Kpi label="الضوابط المكتملة" value={`${stats.done}/${stats.total}`}/><Kpi label="تم التحقق" value={stats.verified}/><Kpi label="متأخرة" value={stats.overdue}/><Kpi label="أدلة بانتظار المراجعة" value={stats.pendingEvidence}/></div>
   <div style={card}><h2 style={sectionTitle}>الالتزام حسب المجال</h2>{domains.length===0?<Empty/>:<div style={{overflowX:"auto"}}><table style={table}><thead><tr><Th t="المجال"/><Th t="الضوابط"/><Th t="مكتمل"/><Th t="تم التحقق"/><Th t="متأخر"/><Th t="نسبة الالتزام"/></tr></thead><tbody>{domains.map(d=>{const pct=d.total?Math.round(d.done/d.total*100):0;return <tr key={d.name}><Td>{d.name}</Td><Td>{d.total}</Td><Td>{d.done}</Td><Td>{d.verified}</Td><Td>{d.overdue}</Td><Td><div style={{display:"flex",alignItems:"center",gap:10,minWidth:150}}><div style={{height:8,background:"#e8edef",borderRadius:99,flex:1,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:"#0f7d73"}}/></div><strong>{pct}%</strong></div></Td></tr>})}</tbody></table></div>}</div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18}}><Summary title="حالة التنفيذ" items={[["مكتمل",stats.done],["قيد العمل",controls.filter(c=>progress(c.implementation_status)).length],["غير مكتمل",controls.filter(c=>!good(c.implementation_status)&&!progress(c.implementation_status)).length]]}/><Summary title="حالة التحقق" items={[["تم التحقق",stats.verified],["بانتظار التحقق",Math.max(0,stats.total-stats.verified)],["متأخرة",stats.overdue]]}/></div>
  </section></div>
 </main>
}
function Kpi({label,value}:{label:string;value:string|number}){return <div style={kpi}><div style={{fontSize:13,color:"#7a8794",marginBottom:8}}>{label}</div><div style={{fontSize:30,fontWeight:800,color:"#0f7d73"}}>{value}</div></div>}
function Summary({title,items}:{title:string;items:[string,number][]}){return <div style={card}><h2 style={sectionTitle}>{title}</h2>{items.map(([n,v])=><div key={n} style={{display:"flex",justifyContent:"space-between",padding:"13px 0",borderBottom:"1px solid #edf0f2"}}><span>{n}</span><strong>{v}</strong></div>)}</div>}
function Th({t}:{t:string}){return <th style={{textAlign:"right",padding:"13px 12px",fontSize:12,color:"#687581",background:"#f8fafb"}}>{t}</th>}
function Td({children}:{children:React.ReactNode}){return <td style={{padding:"14px 12px",borderTop:"1px solid #edf0f2",fontSize:14}}>{children}</td>}
function Empty(){return <div style={{padding:35,textAlign:"center",color:"#7a8794"}}>لا توجد بيانات كافية بعد.</div>}
const page={minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}; const center={...page,display:"grid",placeItems:"center"}; const header={minHeight:86,background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,padding:"0 38px"}; const aside={width:260,background:"white",borderLeft:"1px solid #e2e7eb",padding:"28px 20px",flexShrink:0} as const; const nav={display:"block",padding:"15px 18px",marginBottom:7,borderRadius:10,textDecoration:"none",fontSize:15}; const ghostDark={color:"white",textDecoration:"none",border:"1px solid rgba(255,255,255,.22)",borderRadius:9,padding:"9px 13px",fontSize:13}; const eyebrow={color:"#0f7d73",fontWeight:800,fontSize:13,marginBottom:8}; const h1={margin:0,fontSize:34}; const muted={color:"#7a8794"}; const primary={border:0,background:"#0f7d73",color:"white",padding:"12px 18px",borderRadius:9,fontWeight:800,cursor:"pointer",height:44}; const errorBox={background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:18}; const kpiGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:16,marginBottom:22}; const kpi={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:20}; const card={background:"white",border:"1px solid #e2e7eb",borderRadius:14,padding:24,marginBottom:20}; const sectionTitle={margin:"0 0 18px",fontSize:20}; const table={width:"100%",borderCollapse:"collapse" as const};

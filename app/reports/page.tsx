"use client";


import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import { requireProfile } from "@/lib/auth";

type Control={id:number;framework_id:number;control_code:string;title_ar:string;domain_ar:string;implementation_status:string;evidence_status:string;verification_status:string;due_date:string|null;control_owner:string|null};
type Evidence={id:number;control_id:number;status:string|null};
type Framework={id:number;code:string;name_ar:string;version:string};

type DomainRow={name:string;total:number;done:number;verified:number;overdue:number};
type ChartItem={label:string;value:number;tone:string};
type FrameworkRow={code:string;name:string;total:number;done:number;percent:number};

const good=(v:string|null|undefined)=>["implemented","compliant","accepted","approved","verified","uploaded"].includes((v||"").toLowerCase());
const progress=(v:string|null|undefined)=>["in_progress","pending_review","under_review"].includes((v||"").toLowerCase());

export default function ReportsPage(){
 const router=useRouter();
 const [loading,setLoading]=useState(true); const [error,setError]=useState("");
 const [controls,setControls]=useState<Control[]>([]); const [evidence,setEvidence]=useState<Evidence[]>([]); const [frameworks,setFrameworks]=useState<Framework[]>([]); const [selectedFramework,setSelectedFramework]=useState("ECC");
 useEffect(()=>{(async()=>{
  try {
   await requireProfile(["admin","cybersecurity_team"]);
  } catch (authError) {
   const message=authError instanceof Error?authError.message:"";
   router.replace(message.includes("تسجيل الدخول")?"/login":"/");
   return;
  }
  const [{data:c,error:ce},{data:e,error:ee},{data:f,error:fe}]=await Promise.all([
   supabase.from("controls").select("id,framework_id,control_code,title_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner").order("id"),
   supabase.from("evidence").select("id,control_id,status").eq("is_current",true),
   supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("id")
  ]);
  if(ce||ee||fe){setError(ce?.message||ee?.message||fe?.message||"تعذر تحميل التقارير");setLoading(false);return;}
  const available=(f??[]) as Framework[]; setControls((c??[]) as Control[]); setEvidence((e??[]) as Evidence[]); setFrameworks(available); if(!available.some(item=>item.code==="ECC"))setSelectedFramework(available[0]?.code??""); setLoading(false);
 })()},[router]);
 const selected=frameworks.find(f=>f.code===selectedFramework);
 const scopedControls=useMemo(()=>selected?controls.filter(c=>c.framework_id===selected.id):[],[controls,selected]);
 const stats=useMemo(()=>{
  const now=new Date(); const total=scopedControls.length; const done=scopedControls.filter(c=>good(c.implementation_status)).length;
  const verified=scopedControls.filter(c=>good(c.verification_status)).length;
  const overdue=scopedControls.filter(c=>c.due_date&&c.due_date<now.toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"})&&!good(c.implementation_status)).length;
  const controlIds=new Set(scopedControls.map(c=>c.id)); const pendingEvidence=evidence.filter(e=>controlIds.has(e.control_id)&&progress(e.status)).length;
  const notApplicable=scopedControls.filter(c=>c.implementation_status==="not_applicable").length; const applicable=Math.max(total-notApplicable,0);
  return {total,done,verified,overdue,pendingEvidence,notApplicable,compliance:applicable?Math.round(done/applicable*100):0};
 },[scopedControls,evidence]);
 const domains=useMemo(()=>{
  const m=new Map<string,DomainRow>(); const now=new Date();
  scopedControls.forEach(c=>{const name=c.domain_ar||"غير مصنف";const r=m.get(name)||{name,total:0,done:0,verified:0,overdue:0};r.total++;if(good(c.implementation_status))r.done++;if(good(c.verification_status))r.verified++;if(c.due_date&&c.due_date<now.toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"})&&!good(c.implementation_status))r.overdue++;m.set(name,r)});
  return [...m.values()].sort((a,b)=>b.total-a.total);
 },[scopedControls]);
 const implementationChart=useMemo<ChartItem[]>(()=>[
  {label:"مطبق كليًا",value:stats.done,tone:"implemented"},
  {label:"مطبق جزئيًا",value:scopedControls.filter(c=>["in_progress","partially_implemented"].includes(c.implementation_status)).length,tone:"partial"},
  {label:"غير مطبق",value:scopedControls.filter(c=>["not_started","not_implemented"].includes(c.implementation_status)).length,tone:"missing"},
  {label:"لا ينطبق",value:stats.notApplicable,tone:"na"},
 ],[scopedControls,stats.done,stats.notApplicable]);
 const frameworkOverview=useMemo<FrameworkRow[]>(()=>frameworks.map(f=>{const rows=controls.filter(c=>c.framework_id===f.id);const applicable=rows.filter(c=>c.implementation_status!=="not_applicable");const done=applicable.filter(c=>good(c.implementation_status)).length;return {code:f.code,name:f.name_ar,total:rows.length,done,percent:applicable.length?Math.round(done/applicable.length*100):0}}),[controls,frameworks]);
 function openControls(status?:string,domain?:string){const params=new URLSearchParams({framework:selectedFramework});if(status)params.set("status",status);if(domain)params.set("domain",domain);router.push(`/controls?${params.toString()}`)}
 function exportCsv(){
  const rows=[["Control Code","Title","Domain","Implementation","Evidence","Verification","Due Date","Owner"],...scopedControls.map(c=>[c.control_code,c.title_ar,c.domain_ar,c.implementation_status,c.evidence_status,c.verification_status,c.due_date||"",c.control_owner||""])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\n"); const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}); const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`CGP-${selectedFramework}-Report-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
 }
 if(loading)return <main dir="rtl" style={center}>جاري تجهيز التقارير...</main>;
 if(error)return <main dir="rtl"><h1>تعذر تحميل البيانات</h1><p role="alert">{error}</p><button onClick={()=>window.location.reload()}>إعادة المحاولة</button></main>;

 return <main dir="rtl" className="workflow-page">
  <section>
   <WorkflowHeading title="تقارير الالتزام" description="مؤشرات لحظية مستخرجة من بيانات الضوابط والأدلة في CGP." action={<div className="report-actions"><button onClick={()=>window.print()} className="workflow-button">تصدير PDF</button><button onClick={exportCsv} className="workflow-button workflow-primary">تصدير CSV</button></div>}/>
   {error&&<div style={errorBox}>{error}</div>}
   <div className="workflow-tabs report-frameworks" role="group" aria-label="الإطار التنظيمي">{frameworks.map(f=><button aria-pressed={selectedFramework===f.code} key={f.id} onClick={()=>setSelectedFramework(f.code)}><b dir="ltr">{f.code}</b><span>{f.name_ar}</span></button>)}</div>
   <p className="dashboard-context">التقرير الحالي: <strong>{selected?.name_ar}</strong> · الإصدار {selected?.version} · {scopedControls.length} ضابط</p>
   <div className="workflow-metrics report-metrics"><WorkflowMetric label="نسبة الالتزام" value={`${stats.compliance}%`} tone="success"/><WorkflowMetric label="الضوابط المكتملة" value={`${stats.done}/${stats.total}`}/><WorkflowMetric label="تم التحقق" value={stats.verified}/><WorkflowMetric label="متأخرة" value={stats.overdue} tone={stats.overdue?"danger":"neutral"}/><WorkflowMetric label="أدلة بانتظار المراجعة" value={stats.pendingEvidence} tone="warning"/></div>
   <div className="report-visual-grid">
    <DonutChart items={implementationChart} total={stats.total} onSelect={tone=>openControls(tone==="implemented"?"implemented":tone==="partial"?"in_progress":tone==="missing"?"not_started":"not_applicable")}/>
    <DomainChart domains={domains} onSelect={domain=>openControls(undefined,domain)}/>
   </div>
   <details className="report-details report-analysis"><summary><span><b>تحليل إضافي ومقارنة الأطر</b><small>المقارنة، التحقق، خريطة الأولويات، والبيانات التفصيلية</small></span><span aria-hidden="true">‹</span></summary><FrameworkComparison rows={frameworkOverview} selected={selectedFramework} onSelect={setSelectedFramework}/><StatusBarChart items={[{label:"تم التحقق",value:stats.verified,tone:"implemented"},{label:"بانتظار التحقق",value:Math.max(0,stats.total-stats.verified),tone:"partial"},{label:"متأخرة",value:stats.overdue,tone:"missing"}]} total={stats.total} title="حالة التحقق والأولوية"/><AttentionMap domains={domains} onSelect={domain=>openControls(undefined,domain)}/><details className="report-details report-data-details"><summary>عرض البيانات التفصيلية</summary><div className="report-table-wrap">{domains.length===0?<Empty/>:<table style={table}><thead><tr><Th t="المجال"/><Th t="الضوابط"/><Th t="مكتمل"/><Th t="تم التحقق"/><Th t="متأخر"/><Th t="نسبة الالتزام"/></tr></thead><tbody>{domains.map(d=>{const pct=d.total?Math.round(d.done/d.total*100):0;return <tr key={d.name}><Td>{d.name}</Td><Td>{d.total}</Td><Td>{d.done}</Td><Td>{d.verified}</Td><Td>{d.overdue}</Td><Td><strong>{pct}%</strong></Td></tr>})}</tbody></table>}</div></details></details>
  </section>
 </main>
}
function FrameworkComparison({rows,selected,onSelect}:{rows:FrameworkRow[];selected:string;onSelect:(code:string)=>void}){
 return <section className="report-chart" aria-labelledby="framework-comparison-title"><div className="report-chart-heading"><div><h2 id="framework-comparison-title">مقارنة الأطر التنظيمية</h2><p>مقارنة فورية لنسبة الالتزام؛ اضغط لتغيير التقرير</p></div></div><div className="report-framework-chart">{rows.map(row=><button type="button" key={row.code} className={selected===row.code?"active":""} onClick={()=>onSelect(row.code)} aria-label={`${row.name}: ${row.percent}%`}><span dir="ltr">{row.code}</span><div><i style={{height:`${Math.max(row.percent,3)}%`}}/><b>{row.percent}%</b></div><small>{row.done}/{row.total}</small></button>)}</div></section>
}
function DonutChart({items,total,onSelect}:{items:ChartItem[];total:number;onSelect:(tone:string)=>void}){
 const colors:Record<string,string>={implemented:"var(--cgp-teal)",partial:"#d39a32",missing:"#bd4b3f",na:"#9aa8b1"};
 let cursor=0; const segments=items.map(item=>{const start=cursor;const end=cursor+(total?item.value/total*360:0);cursor=end;return `${colors[item.tone]} ${start}deg ${end}deg`});
 const background=total?`conic-gradient(${segments.join(",")})`:"#edf1f3";
 return <section className="report-chart report-donut-card" aria-labelledby="implementation-donut-title"><div className="report-chart-heading"><div><h2 id="implementation-donut-title">حالة التنفيذ</h2><p>اضغط على أي حالة لفتح ضوابطها</p></div></div><div className="report-donut-content"><div className="report-donut" style={{background}} role="img" aria-label={`نسبة الالتزام ${total?Math.round(items[0].value/Math.max(total-items[3].value,1)*100):0}%`}><div><strong>{total?Math.round(items[0].value/Math.max(total-items[3].value,1)*100):0}%</strong><span>نسبة الالتزام</span></div></div><div className="report-legend">{items.map(item=><button type="button" key={item.label} onClick={()=>onSelect(item.tone)} title={`فتح ضوابط: ${item.label}`}><i className={item.tone}/><span>{item.label}</span><strong>{item.value}</strong><b aria-hidden="true">←</b></button>)}</div></div></section>
}
function DomainChart({domains,onSelect}:{domains:DomainRow[];onSelect:(domain:string)=>void}){
 const priority=[...domains].sort((a,b)=>(a.total?a.done/a.total:0)-(b.total?b.done/b.total:0))[0];
 return <section className="report-chart" aria-labelledby="domain-chart-title"><div className="report-chart-heading"><div><h2 id="domain-chart-title">الالتزام حسب المجال</h2><p>اضغط على المجال للانتقال إلى ضوابطه</p></div></div>{priority&&<button type="button" className="report-insight" onClick={()=>onSelect(priority.name)}><span>الأولوية المقترحة</span><strong>{priority.name}</strong><b>فتح الضوابط ←</b></button>}{domains.length===0?<Empty/>:<div className="report-domain-chart">{domains.map(d=>{const pct=d.total?Math.round(d.done/d.total*100):0;return <button type="button" onClick={()=>onSelect(d.name)} key={d.name} title={`فتح ضوابط ${d.name}`}><div className="report-chart-label"><span>{d.name}</span><b>{pct}%</b></div><div className="report-chart-track" role="img" aria-label={`${d.name}: ${pct}%`}><span className="report-chart-fill implemented" style={{width:`${pct}%`}}/></div><small>{d.done} من {d.total} ضابط</small></button>})}</div>}</section>
}
function StatusBarChart({items,total,title="توزيع حالة التنفيذ"}:{items:ChartItem[];total:number;title?:string}){
 return <section className="report-chart" aria-labelledby="implementation-chart-title">
  <div className="report-chart-heading"><div><h2 id="implementation-chart-title">{title}</h2><p>نظرة سريعة على حالة ضوابط الإطار المختار</p></div><strong>{total}<span> ضابط</span></strong></div>
  {total===0?<Empty/>:<div className="report-chart-bars">{items.map(item=>{const pct=Math.round(item.value/total*100);return <div className="report-chart-row" key={item.label}><div className="report-chart-label"><span>{item.label}</span><b>{item.value} <small>({pct}%)</small></b></div><div className="report-chart-track" role="img" aria-label={`${item.label}: ${item.value} من ${total}، ${pct}%`}><span className={`report-chart-fill ${item.tone}`} style={{width:`${pct}%`}}/></div></div>})}</div>}
 </section>
}
function AttentionMap({domains,onSelect}:{domains:DomainRow[];onSelect:(domain:string)=>void}){
 return <section className="report-chart" aria-labelledby="attention-map-title"><div className="report-chart-heading"><div><h2 id="attention-map-title">خريطة أولوية المجالات</h2><p>كلما زادت الفجوة ظهر المجال بلون أقوى</p></div></div>{domains.length===0?<Empty/>:<div className="report-heatmap">{domains.map(d=>{const pct=d.total?Math.round(d.done/d.total*100):0;const severity=d.overdue>0||pct<34?"high":pct<67?"medium":"low";return <button type="button" className={severity} key={d.name} onClick={()=>onSelect(d.name)}><span>{d.name}</span><strong>{100-pct}% فجوة</strong><small>{d.overdue?`${d.overdue} متأخر`:`${d.total-d.done} غير مكتمل`}</small></button>})}</div>}</section>
}
function Th({t}:{t:string}){return <th style={{textAlign:"right",padding:"13px 12px",fontSize:12,color:"#687581",background:"#f8fafb"}}>{t}</th>}
function Td({children}:{children:React.ReactNode}){return <td style={{padding:"14px 12px",borderTop:"1px solid #edf0f2",fontSize:14}}>{children}</td>}
function Empty(){return <div style={{padding:35,textAlign:"center",color:"#586875"}}>لا توجد بيانات كافية بعد.</div>}
const page={color:"var(--cgp-ink)"}; const center={...page,display:"grid",placeItems:"center"}; const errorBox={background:"#fff2f0",color:"#9d2e24",padding:14,borderRadius:10,marginBottom:18}; const table={width:"100%",borderCollapse:"collapse" as const};

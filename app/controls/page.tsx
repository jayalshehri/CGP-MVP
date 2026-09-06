"use client";
import { WorkflowHeading, WorkflowMetric, ResultSummary } from "@/components/WorkflowUI";
import StatusBadge from "@/components/StatusBadge";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import "./catalog.css";
import { supabase } from "@/lib/supabase";

type Control={id:number;framework_id:number;control_code:string;title_ar:string;description_ar:string|null;domain_ar:string;implementation_status:string;evidence_status:string;verification_status:string;due_date:string|null;control_owner:string|null;control_owner_id:string|null};
type Framework={id:number;code:string;name_ar:string;version:string};
type ViewMode="structure"|"followup";
const good=(value:string)=>["implemented","compliant"].includes(value);
const cleanTitle=(value:string)=>value.replace(/\s*[-–]\s*[\d-]+\s*$/,"").trim();
const domainNumber=(rows:Control[])=>rows[0]?.control_code.split("-")[0]||"—";

export default function ControlsPage(){
 return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</main>}><ControlsContent/></Suspense>;
}

function ControlsContent(){
 const router=useRouter();
 const searchParams=useSearchParams();
 const rawStatus=searchParams.get("status")??"all";
 const status=["all","implemented","in_progress","not_started","not_applicable","remaining"].includes(rawStatus)?rawStatus:"all";
 const rawAssignment=searchParams.get("assignment")??"all";
 const assignment=["all","assigned","unassigned"].includes(rawAssignment)?rawAssignment:"all";
 const [search,setSearch]=useState(""),[framework,setFramework]=useState("ECC");
 const [activeDomain,setActiveDomain]=useState(""),[scope,setScope]=useState("all"),[view,setView]=useState<ViewMode>("structure");
 const [controls,setControls]=useState<Control[]>([]),[frameworks,setFrameworks]=useState<Framework[]>([]);
 const [error,setError]=useState<Error|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{
  const {user,profile}=await requireProfile();if(!active)return;
  let query=supabase.from("controls").select("id,framework_id,control_code,title_ar,description_ar,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner,control_owner_id").order("id");
  if(profile.role==="control_owner")query=query.eq("control_owner_id",user.id);
  const [{data,error},{data:frameworkData,error:frameworkError}]=await Promise.all([query,supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("id")]);
  if(error||frameworkError)throw error||frameworkError;
  if(active){setControls((data??[]) as Control[]);setFrameworks((frameworkData??[]) as Framework[]);}
 }catch(e){if(active)setError(new Error(e instanceof Error?e.message:"تعذر تحميل الضوابط"));const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);

 const selectedFramework=frameworks.find(item=>item.code===framework);
 const frameworkControls=useMemo(()=>selectedFramework?controls.filter(c=>c.framework_id===selectedFramework.id):[],[controls,selectedFramework]);
 const scoped=useMemo(()=>framework!=="CCC"||scope==="all"?frameworkControls:frameworkControls.filter(c=>c.control_code.includes(scope==="provider"?"-P-":"-T-")),[framework,frameworkControls,scope]);
 const domains=useMemo(()=>Map.groupBy(scoped,c=>c.domain_ar||"غير مصنف"),[scoped]);
 const selectedDomain=activeDomain&&domains.has(activeDomain)?activeDomain:[...domains.keys()][0]||"";
 const domainControls=domains.get(selectedDomain)??[];
 const filtered=domainControls.filter(c=>{
  const searchMatch=`${c.control_code} ${c.title_ar} ${c.control_owner||""}`.toLowerCase().includes(search.trim().toLowerCase());
  const statusMatch=status==="all"||(status==="implemented"?good(c.implementation_status):status==="remaining"?!["implemented","compliant","in_progress"].includes(c.implementation_status):c.implementation_status===status);
  const assignmentMatch=assignment==="all"||(assignment==="assigned"?!!c.control_owner_id:!c.control_owner_id);
  return searchMatch&&statusMatch&&assignmentMatch;
 });
 const sorted=[...filtered].sort((a,b)=>a.control_code.localeCompare(b.control_code,"en",{numeric:true}));
 const subdomains=Map.groupBy(sorted,c=>c.control_code.split("-").slice(0,2).join("-"));
 const searching=!!search.trim()||status!=="all"||assignment!=="all";
 function setFilter(key:"status"|"assignment",value:string){const params=new URLSearchParams(searchParams.toString());if(value==="all")params.delete(key);else params.set(key,value);router.replace(params.size?`/controls?${params.toString()}`:"/controls",{scroll:false});}
 function resetFilters(){setSearch("");router.replace("/controls",{scroll:false});}
 function chooseFramework(code:string){setFramework(code);setActiveDomain("");setScope("all");setSearch("");router.replace("/controls",{scroll:false});}

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل الضوابط</h1><p className="catalog-error">{error.message}</p><Link href="/">العودة إلى لوحة المتابعة</Link></main>;
 return <main className="workflow-page catalog-page" dir="rtl">
  <WorkflowHeading title="مكتبة الضوابط" description="اختر الإطار، ثم المجال الرئيسي والمجال الفرعي للوصول إلى الضابط ومتابعة تنفيذه."/>
  <section aria-labelledby="framework-heading">
   <div className="catalog-section-heading"><div><span>الخطوة 1</span><h2 id="framework-heading">اختر الإطار التنظيمي</h2></div><small>{frameworks.length} إطارات متاحة</small></div>
   <div className="framework-grid">{frameworks.map(item=>{const rows=controls.filter(c=>c.framework_id===item.id);const done=rows.filter(c=>good(c.implementation_status)).length;return <button key={item.id} className={`framework-card ${framework===item.code?"active":""}`} onClick={()=>chooseFramework(item.code)} aria-pressed={framework===item.code}><strong dir="ltr">{item.code}</strong><span>{item.name_ar}</span><small>{item.version} · {rows.length} ضابط</small><progress max={Math.max(rows.length,1)} value={done}/></button>})}</div>
  </section>
  {selectedFramework&&<>
   <section className="framework-summary"><div><span className="catalog-kicker">{selectedFramework.code} · الإصدار {selectedFramework.version}</span><h2>{selectedFramework.name_ar}</h2><p>اختر مجالًا لعرض مكوناته وضوابطه بصورة مستقلة.</p></div><div className="view-switch" role="group" aria-label="طريقة العرض"><button className={view==="structure"?"active":""} onClick={()=>setView("structure")}>عرض الهيكل</button><button className={view==="followup"?"active":""} onClick={()=>setView("followup")}>عرض المتابعة</button></div></section>
   {framework==="CCC"&&<div className="scope-switch" role="group" aria-label="نطاق ضوابط الحوسبة السحابية"><button className={scope==="all"?"active":""} onClick={()=>{setScope("all");setActiveDomain("")}}>الكل</button><button className={scope==="provider"?"active":""} onClick={()=>{setScope("provider");setActiveDomain("")}}>مقدم الخدمة CSP</button><button className={scope==="tenant"?"active":""} onClick={()=>{setScope("tenant");setActiveDomain("")}}>المشترك CST</button></div>}
   <div className="workflow-metrics"><WorkflowMetric label="إجمالي الضوابط" value={scoped.length}/><WorkflowMetric label="مطبق كليًا" value={scoped.filter(c=>good(c.implementation_status)).length} tone="success"/><WorkflowMetric label="مطبق جزئيًا" value={scoped.filter(c=>c.implementation_status==="in_progress").length} tone="warning"/><WorkflowMetric label="غير مطبق" value={scoped.filter(c=>c.implementation_status==="not_started").length}/></div>
   <section aria-labelledby="domain-heading">
    <div className="catalog-section-heading"><div><span>الخطوة 2</span><h2 id="domain-heading">اختر المجال الرئيسي</h2></div><small>{domains.size} مجالات</small></div>
    <div className="domain-grid">{[...domains].map(([name,rows])=>{const done=rows.filter(c=>good(c.implementation_status)).length;const percent=rows.length?Math.round(done/rows.length*100):0;return <button key={name} className={`domain-card ${selectedDomain===name?"active":""}`} onClick={()=>setActiveDomain(name)} aria-pressed={selectedDomain===name}><span className="domain-index">{domainNumber(rows)}</span><span><strong>{name}</strong><small>{rows.length} ضابط · {new Set(rows.map(c=>c.control_code.split("-").slice(0,2).join("-"))).size} مجال فرعي</small></span><b>{percent}%</b></button>})}</div>
   </section>
   <section className="catalog-workspace" aria-labelledby="selected-domain-heading">
    <div className="catalog-workspace-head"><div><span>الخطوة 3</span><h2 id="selected-domain-heading"><b dir="ltr">{domainNumber(domainControls)}</b> {selectedDomain}</h2><p>{domainControls.length} ضابط ضمن المجال المحدد</p></div></div>
    <div className="workflow-filter workflow-filter-grid catalog-filters"><div><label htmlFor="control-search" className="cgp-field-label">البحث داخل المجال</label><input id="control-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم الضابط أو اسمه أو المالك"/></div><div><label htmlFor="control-status" className="cgp-field-label">حالة التنفيذ</label><select id="control-status" value={status} onChange={e=>setFilter("status",e.target.value)}><option value="all">كل الحالات</option><option value="implemented">مطبق كليًا</option><option value="in_progress">مطبق جزئيًا</option><option value="not_started">غير مطبق</option><option value="not_applicable">لا ينطبق</option><option value="remaining">غير مطبق أو لا ينطبق</option></select></div><div><label htmlFor="control-assignment" className="cgp-field-label">الإسناد</label><select id="control-assignment" value={assignment} onChange={e=>setFilter("assignment",e.target.value)}><option value="all">الكل</option><option value="assigned">معيّن</option><option value="unassigned">غير معيّن</option></select></div></div>
    <ResultSummary count={filtered.length} total={domainControls.length} active={searching} reset={resetFilters}/>
    {view==="structure"?<div className="subdomain-list">{[...subdomains].map(([code,rows],index)=><details className="subdomain-card" key={code} open={searching||index===0}><summary><span><b dir="ltr">{code}</b><strong>{cleanTitle(rows[0].title_ar)}</strong><small>{rows.length} ضابط</small></span><span className="catalog-chevron" aria-hidden="true">‹</span></summary><ul>{rows.map(c=><li key={c.id}><Link className="catalog-row" href={`/controls/${c.id}`}><span className="catalog-code" dir="ltr">{c.control_code}</span><span className="catalog-title">{cleanTitle(c.title_ar)}</span><StatusBadge status={c.implementation_status}/><span aria-hidden="true">←</span></Link></li>)}</ul></details>)}</div>:<div className="followup-table-wrap"><table className="followup-table"><thead><tr><th>الضابط</th><th>الاسم</th><th>المالك</th><th>التنفيذ</th><th>الدليل</th><th>الاستحقاق</th><th></th></tr></thead><tbody>{sorted.map(c=><tr key={c.id}><td dir="ltr">{c.control_code}</td><td>{cleanTitle(c.title_ar)}</td><td>{c.control_owner||"غير معيّن"}</td><td><StatusBadge status={c.implementation_status}/></td><td><StatusBadge status={c.evidence_status}/></td><td>{c.due_date||"غير محدد"}</td><td><Link href={`/controls/${c.id}`}>فتح ←</Link></td></tr>)}</tbody></table></div>}
    {!filtered.length&&<div className="workflow-empty">لا توجد ضوابط مطابقة داخل هذا المجال.</div>}
   </section>
  </>}
 </main>;
}

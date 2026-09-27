"use client";
import { WorkflowHeading, WorkflowMetric, ResultSummary } from "@/components/WorkflowUI";
import StatusBadge from "@/components/StatusBadge";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import "@/app/controls/catalog.css";
import { supabase } from "@/lib/supabase";
import { getEccOfficialTitle } from "@/lib/ecc-strategy-example";
import { isBusinessFramework } from "@/lib/compliance-frameworks";

type Control={id:number;framework_id:number;control_code:string;title_ar:string;description_ar:string|null;official_text_ar:string|null;hierarchy_level:string;parent_control_id:number|null;applicability:string|null;domain_ar:string;implementation_status:string;evidence_status:string;verification_status:string;due_date:string|null;control_owner:string|null;control_owner_id:string|null};
type Framework={id:number;code:string;name_ar:string;version:string};
type ViewMode="structure"|"followup";
const good=(value:string)=>["implemented","compliant"].includes(value);
const cleanTitle=(value:string)=>value.replace(/\s*[-–]\s*[\d-]+\s*$/,"").trim();
const domainNumber=(rows:Control[])=>rows[0]?.control_code.split("-")[0]||"—";
// control_code is the canonical LTR identifier; search must match against
// it directly, never against visually-rendered (possibly BiDi-reordered)
// text. Normalizes Arabic-Indic digits and dash-variant characters (from
// keyboards/locales/paste sources that don't produce a plain ASCII "-")
// so a code like "١-٩-٣-١" or "1–9–3–1" still matches "1-9-3-1".
const normalizeCode=(value:string)=>value
 .replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-0x0660))
 .replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-0x06F0))
 .replace(/[‐-―−]/g,"-")
 .toLowerCase().trim();
const hasArabic=(value:string|null)=>!!value&&/[\u0600-\u06ff]/.test(value);
// The concise navigation label. official_text_ar (the validated NCA
// regulatory text) is shown separately wherever a row is expanded — this
// function never substitutes for it, it only picks the best short label.
const displayTitle=(control:Control,frameworkCode:string)=>{
 if(control.official_text_ar)return control.official_text_ar;
 if(frameworkCode==="ECC")return getEccOfficialTitle(control.control_code)||control.description_ar||cleanTitle(control.title_ar);
 if(frameworkCode==="CCC")return hasArabic(control.description_ar)?control.description_ar:cleanTitle(control.title_ar);
 return control.description_ar||cleanTitle(control.title_ar);
};
const applicabilityLabel=(value:string|null)=>value==="CSP"?"مقدم الخدمة CSP":value==="CST"?"المشترك CST":null;

export default function ControlsCatalog({fixedFramework}:{fixedFramework?:string}){
 return <Suspense fallback={<div className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</div>}><ControlsContent fixedFramework={fixedFramework}/></Suspense>;
}

function ControlsContent({fixedFramework}:{fixedFramework?:string}){
 const router=useRouter();
 const searchParams=useSearchParams();
 const embedded=!!fixedFramework;
 const rawStatus=searchParams.get("status")??"all";
 const status=["all","implemented","in_progress","not_started","not_applicable"].includes(rawStatus)?rawStatus:"all";
 const rawAssignment=searchParams.get("assignment")??"all";
 const assignment=["all","assigned","unassigned"].includes(rawAssignment)?rawAssignment:"all";
 const requestedFramework=fixedFramework?.toUpperCase()??searchParams.get("framework")?.toUpperCase()??"ECC";
 const requestedDomain=searchParams.get("domain")??"";
 const [search,setSearch]=useState(searchParams.get("q")??"");
 const [activeDomain,setActiveDomain]=useState(requestedDomain),[scope,setScope]=useState(searchParams.get("scope")??"all"),[view,setView]=useState<ViewMode>(searchParams.get("view")==="followup"?"followup":"structure");
 const [controls,setControls]=useState<Control[]>([]),[frameworks,setFrameworks]=useState<Framework[]>([]),[canManage,setCanManage]=useState(false),[isOwner,setIsOwner]=useState(false);
 const [error,setError]=useState<Error|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{try{
  const {user,profile}=await requireProfile();if(!active)return;
  setCanManage(profile.role==="admin"||profile.role==="cybersecurity_team");
  setIsOwner(profile.role==="control_owner");
  let query=supabase.from("controls").select("id,framework_id,control_code,title_ar,description_ar,official_text_ar,hierarchy_level,parent_control_id,applicability,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner,control_owner_id").order("id");
  if(profile.role==="control_owner")query=query.eq("control_owner_id",user.id);
  const [{data,error},{data:frameworkData,error:frameworkError}]=await Promise.all([query,supabase.from("frameworks").select("id,code,name_ar,version").eq("is_active",true).order("id")]);
  if(error||frameworkError)throw error||frameworkError;
  if(active){setControls((data??[]) as Control[]);setFrameworks(((frameworkData??[]) as Framework[]).filter(item=>isBusinessFramework(item.code)||item.code===fixedFramework?.toUpperCase()));}
 }catch(e){if(active)setError(new Error(e instanceof Error?e.message:"تعذر تحميل الضوابط"));const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router,fixedFramework]);

 const ownerFirstFramework=isOwner&&!searchParams.has("framework")?frameworks.find(item=>controls.some(control=>control.framework_id===item.id)):undefined;
 const selectedFramework=embedded?frameworks.find(item=>item.code===requestedFramework):ownerFirstFramework??frameworks.find(item=>item.code===requestedFramework)??frameworks[0];
 const framework=selectedFramework?.code??"ECC";
 const frameworkControls=useMemo(()=>selectedFramework?controls.filter(c=>c.framework_id===selectedFramework.id):[],[controls,selectedFramework]);
 const scoped=useMemo(()=>framework!=="CCC"||scope==="all"?frameworkControls:frameworkControls.filter(c=>c.control_code.includes(scope==="provider"?"-P-":"-T-")),[framework,frameworkControls,scope]);
 const domains=useMemo(()=>Map.groupBy(scoped,c=>c.domain_ar||"غير مصنف"),[scoped]);
 const selectedDomain=activeDomain&&domains.has(activeDomain)?activeDomain:[...domains.keys()][0]||"";
 const domainControls=domains.get(selectedDomain)??[];
 const normalizedQuery=normalizeCode(search);
 const filtered=domainControls.filter(c=>{
  const searchMatch=normalizeCode(`${c.control_code} ${c.title_ar} ${c.official_text_ar||""} ${framework} ${c.control_owner||""}`).includes(normalizedQuery);
  const statusMatch=status==="all"||(status==="implemented"?good(c.implementation_status):c.implementation_status===status);
  const assignmentMatch=assignment==="all"||(assignment==="assigned"?!!c.control_owner_id:!c.control_owner_id);
  return searchMatch&&statusMatch&&assignmentMatch;
 });
 const sorted=[...filtered].sort((a,b)=>a.control_code.localeCompare(b.control_code,"en",{numeric:true}));
 const searching=!!search.trim()||status!=="all"||assignment!=="all";
 // A sub-control's own code/text can match the search even when its parent's
 // does not (e.g. searching the exact code "1-9-3-1" never matches parent
 // "1-9-3"). The structure view renders sub-controls nested under their
 // parent row, so without the parent present the matching child would be
 // silently unreachable. Back-fill any such parent -- present so the child
 // can render, but not counted as a match (it's excluded from `filtered`/
 // `sorted`, which drive the result count and the follow-up table).
 const filteredIds=new Set(filtered.map(c=>c.id));
 const structureRows=searching
  ?[...sorted,...domainControls.filter(c=>c.hierarchy_level!=="sub_control"&&!filteredIds.has(c.id)&&filtered.some(f=>f.parent_control_id===c.id))].sort((a,b)=>a.control_code.localeCompare(b.control_code,"en",{numeric:true}))
  :sorted;
 const subdomains=Map.groupBy(structureRows,c=>c.control_code.split("-").slice(0,2).join("-"));
 function contextHref(params:URLSearchParams){if(embedded){params.delete("framework");params.set("tab","controls");return `/compliance/${encodeURIComponent(framework)}?${params.toString()}`;}params.delete("tab");params.set("framework",framework);return `/controls?${params.toString()}`;}
 function setFilter(key:"status"|"assignment",value:string){const params=new URLSearchParams(searchParams.toString());if(value==="all")params.delete(key);else params.set(key,value);router.replace(contextHref(params),{scroll:false});}
 function resetFilters(){setSearch("");const params=new URLSearchParams(searchParams.toString());params.delete("status");params.delete("assignment");params.delete("q");router.replace(contextHref(params),{scroll:false});}
 function chooseFramework(code:string){if(code===framework)return;setActiveDomain("");setScope("all");setSearch("");router.push(`/controls?framework=${encodeURIComponent(code)}`,{scroll:false});}
 function chooseDomain(name:string){setActiveDomain(name);const params=new URLSearchParams(searchParams.toString());params.set("domain",name);router.replace(contextHref(params),{scroll:false});}
 function chooseView(next:ViewMode){setView(next);const params=new URLSearchParams(searchParams.toString());if(next==="structure")params.delete("view");else params.set("view",next);router.replace(contextHref(params),{scroll:false});}
 function chooseScope(next:string){setScope(next);setActiveDomain("");const params=new URLSearchParams(searchParams.toString());params.delete("domain");if(next==="all")params.delete("scope");else params.set("scope",next);router.replace(contextHref(params),{scroll:false});}
 function detailHref(id:number){const params=new URLSearchParams();params.set("from",embedded?"workspace":"catalog");if(selectedDomain)params.set("domain",selectedDomain);if(view!=="structure")params.set("view",view);if(scope!=="all")params.set("scope",scope);if(status!=="all")params.set("status",status);if(assignment!=="all")params.set("assignment",assignment);if(search.trim())params.set("q",search.trim());return `/controls/${id}?${params.toString()}`;}

 if(loading)return <div className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</div>;
 if(error)return <div className="workflow-page" dir="rtl"><h1>تعذر تحميل الضوابط</h1><p className="catalog-error">{error.message}</p><Link href="/">العودة إلى لوحة المتابعة</Link></div>;
 const Root=embedded?"div":"main";
 return <Root className={`catalog-page ${embedded?"catalog-embedded":"workflow-page"}`} dir="rtl">
  {!embedded&&<><WorkflowHeading title="مكتبة الضوابط" description="اعرض ضوابط الإطار وحالة تنفيذها، أو انتقل إلى مساحة الإطار." action={canManage?<Link className="workflow-button" href="/controls/bulk-assign">تعيين المالكين جماعيًا ←</Link>:undefined}/>
   <div className="catalog-framework-filter"><label htmlFor="catalog-framework">الإطار التنظيمي</label><select id="catalog-framework" value={framework} onChange={event=>chooseFramework(event.target.value)}>{frameworks.map(item=><option key={item.id} value={item.code}>{item.code} — {item.name_ar}</option>)}</select></div></>}
  {selectedFramework&&<>
   <section className="framework-summary">{!embedded&&<div className="framework-summary-main"><span className="catalog-kicker">{selectedFramework.code} · الإصدار {selectedFramework.version}</span><h2>{selectedFramework.name_ar}</h2><Link href={`/compliance/${framework}`}>فتح مساحة {framework} ←</Link></div>}<div className="view-switch" role="group" aria-label="طريقة العرض"><button className={view==="structure"?"active":""} onClick={()=>chooseView("structure")}>عرض الهيكل</button><button className={view==="followup"?"active":""} onClick={()=>chooseView("followup")}>عرض المتابعة</button></div></section>
   {framework==="CCC"&&<div className="scope-switch" role="group" aria-label="نطاق ضوابط الحوسبة السحابية"><button className={scope==="all"?"active":""} onClick={()=>chooseScope("all")}>الكل</button><button className={scope==="provider"?"active":""} onClick={()=>chooseScope("provider")}>مقدم الخدمة CSP</button><button className={scope==="tenant"?"active":""} onClick={()=>chooseScope("tenant")}>المشترك CST</button></div>}
   <div className="workflow-metrics"><WorkflowMetric label="إجمالي الضوابط" value={scoped.length}/><WorkflowMetric label="مطبق كليًا" value={scoped.filter(c=>good(c.implementation_status)).length} tone="success"/><WorkflowMetric label="مطبق جزئيًا" value={scoped.filter(c=>c.implementation_status==="in_progress").length} tone="warning"/><WorkflowMetric label="غير مطبق" value={scoped.filter(c=>c.implementation_status==="not_started").length}/></div>
   <section aria-labelledby="domain-heading">
    <div className="catalog-section-heading"><div><span>الخطوة 2</span><h2 id="domain-heading">اختر المجال الرئيسي</h2></div><small>{domains.size} مجالات</small></div>
    <div className="domain-grid">{[...domains].map(([name,rows])=>{const done=rows.filter(c=>good(c.implementation_status)).length;const percent=rows.length?Math.round(done/rows.length*100):0;const parentCount=rows.filter(c=>c.hierarchy_level!=="sub_control").length;const subCount=rows.filter(c=>c.hierarchy_level==="sub_control").length;const stats=[parentCount>0?`${parentCount} ضابط أساسي`:null,subCount>0?`${subCount} ضابط فرعي`:null].filter(Boolean).join(" · ");return <button key={name} className={`domain-card ${selectedDomain===name?"active":""}`} onClick={()=>chooseDomain(name)} aria-pressed={selectedDomain===name}><span className="domain-index">{domainNumber(rows)}</span><span><strong>{name}</strong><small>{stats}</small></span><b aria-label="نسبة التنفيذ">{percent}%</b></button>})}</div>
   </section>
   <section className="catalog-workspace" aria-labelledby="selected-domain-heading">
    <div className="catalog-workspace-head"><div><span>الخطوة 3</span><h2 id="selected-domain-heading"><b dir="ltr">{domainNumber(domainControls)}</b> {selectedDomain}</h2><p>{domainControls.length} ضابط ضمن المجال المحدد</p></div></div>
    <div className="workflow-filter workflow-filter-grid catalog-filters"><div><label htmlFor="control-search" className="cgp-field-label">البحث داخل المجال</label><input id="control-search" dir="auto" value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم الضابط أو اسمه أو المالك"/></div><div><label htmlFor="control-status" className="cgp-field-label">حالة التنفيذ</label><select id="control-status" value={status} onChange={e=>setFilter("status",e.target.value)}><option value="all">كل الحالات</option><option value="implemented">مطبق كليًا</option><option value="in_progress">مطبق جزئيًا</option><option value="not_started">غير مطبق</option><option value="not_applicable">لا ينطبق</option></select></div><div><label htmlFor="control-assignment" className="cgp-field-label">الإسناد</label><select id="control-assignment" value={assignment} onChange={e=>setFilter("assignment",e.target.value)}><option value="all">الكل</option><option value="assigned">معيّن</option><option value="unassigned">غير معيّن</option></select></div></div>
    <ResultSummary count={filtered.length} total={domainControls.length} active={searching} reset={resetFilters}/>
    {view==="structure"?<div className="subdomain-list">{[...subdomains].map(([code,rows],index)=>{const parents=rows.filter(c=>c.hierarchy_level!=="sub_control");const byParent=Map.groupBy(rows.filter(c=>c.hierarchy_level==="sub_control"),c=>c.parent_control_id??-1);return <details className="subdomain-card" key={code} open={searching||index===0}><summary><span><b dir="ltr">{code}</b><strong>{code==="1-1"&&framework==="ECC"?"استراتيجية الأمن السيبراني":cleanTitle(rows[0].title_ar)}</strong><small>{rows.length} ضابط وبند فرعي</small></span><span className="catalog-chevron" aria-hidden="true">‹</span></summary><ul>{parents.map(c=>{const subs=byParent.get(c.id)??[];const appl=applicabilityLabel(c.applicability);return <li key={c.id}><Link className="catalog-row" href={detailHref(c.id)}><span className="catalog-code" dir="ltr">{c.control_code}</span><span className="catalog-title" title={c.official_text_ar??undefined}>{displayTitle(c,framework)}</span>{appl&&<span className="catalog-applicability">{appl}</span>}<StatusBadge status={c.implementation_status}/><span aria-hidden="true">←</span></Link>{subs.length>0&&<ul className="catalog-subrows">{subs.map(s=>{const sAppl=applicabilityLabel(s.applicability);return <li key={s.id}><Link className="catalog-row catalog-subrow" href={detailHref(s.id)}><span className="catalog-code" dir="ltr">{s.control_code}</span><span className="catalog-title" title={s.official_text_ar??undefined}>{displayTitle(s,framework)}</span>{sAppl&&<span className="catalog-applicability">{sAppl}</span>}<StatusBadge status={s.implementation_status}/><span aria-hidden="true">←</span></Link></li>})}</ul>}</li>})}</ul></details>})}</div>:<div className="followup-table-wrap">
<table className="followup-table"><colgroup><col className="fc-code"/><col className="fc-title"/><col className="fc-owner"/><col className="fc-status"/><col className="fc-status"/><col className="fc-due"/><col className="fc-more"/><col className="fc-action"/></colgroup><thead><tr><th>الضابط</th><th>الاسم</th><th>المالك</th><th>التنفيذ</th><th>الدليل</th><th>الاستحقاق</th><th aria-hidden="true"></th><th></th></tr></thead><tbody>{sorted.map(c=><tr key={c.id}><td dir="ltr">{c.control_code}</td><td>{displayTitle(c,framework)}</td><td>{c.control_owner||"غير معيّن"}</td><td><StatusBadge status={c.implementation_status}/></td><td><StatusBadge status={c.evidence_status}/></td><td>{c.due_date||"غير محدد"}</td><td><details className="followup-more"><summary>الاستحقاق</summary><span>{c.due_date||"غير محدد"}</span></details></td><td><Link href={detailHref(c.id)}>فتح ←</Link></td></tr>)}</tbody></table></div>}
    {!filtered.length&&<div className="workflow-empty">لا توجد ضوابط مطابقة داخل هذا المجال.</div>}
   </section>
  </>}
 </Root>;
}

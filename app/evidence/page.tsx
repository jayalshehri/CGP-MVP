"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import EvidenceDownload from "@/components/EvidenceDownload";
import GrcAttention from "@/components/GrcAttention";
import StatusBadge from "@/components/StatusBadge";
import { ResultSummary, WorkflowHeading } from "@/components/WorkflowUI";
import { frameworkOf } from "@/lib/compliance";
import { formatComplianceDate, isExpired } from "@/lib/grc";
import { supabase } from "@/lib/supabase";
import "./evidence.css";

type UserRole = "admin" | "cybersecurity_team" | "control_owner" | "nca_external_auditor";
type Control = { id:number; control_code:string; title_ar:string; control_owner:string|null; control_owner_id:string|null; frameworks:unknown };
type Evidence = { link_id:number|null; source_control_id:number; version_number:number; valid_until:string|null; uploader_name:string|null; reviewer_display_name:string|null; is_current:boolean; id:number; control_id:number; evidence_name:string|null; description:string|null; file_name:string|null; file_path:string|null; status:string|null; uploaded_at:string|null; reviewed_at:string|null; review_notes:string|null };
type EvidenceRow = Evidence & { control?:Control };

export default function EvidencePage(){
 return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل مستودع الأدلة…</main>}><EvidenceContent/></Suspense>;
}

function EvidenceContent(){
 const router=useRouter();
 const searchParams=useSearchParams();
 const requestedFramework=searchParams.get("framework")?.toUpperCase()||"all";
 const [loading,setLoading]=useState(true);
 const [role,setRole]=useState<UserRole>("control_owner");
 const [rows,setRows]=useState<EvidenceRow[]>([]);
 const [search,setSearch]=useState("");
 const [status,setStatus]=useState("all");
 const [scope,setScope]=useState("current");
 const [frameworkSelection,setFrameworkSelection]=useState<{routeCode:string;selected:string}|null>(null);
 const framework=frameworkSelection?.routeCode===requestedFramework?frameworkSelection.selected:requestedFramework;
 const setFramework=(selected:string)=>setFrameworkSelection({routeCode:requestedFramework,selected});
 const [error,setError]=useState("");

 useEffect(()=>{let active=true;
  async function load(){
   const {data:sessionData}=await supabase.auth.getSession();
   const session=sessionData.session;
   if(!session){router.replace("/login");return;}
   const {data:profile}=await supabase.from("profiles").select("role,is_active").eq("user_id",session.user.id).maybeSingle();
   if(!profile||profile.is_active===false){if(active){setError("تعذر التحقق من صلاحية المستخدم.");setLoading(false);}return;}
   const userRole=(profile.role||"control_owner") as UserRole;
   if(active)setRole(userRole);
   let controlQuery=supabase.from("controls").select("id,control_code,title_ar,control_owner,control_owner_id,frameworks!inner(code,name_ar,is_active)").eq("frameworks.is_active",true).order("id");
   if(userRole==="control_owner")controlQuery=controlQuery.eq("control_owner_id",session.user.id);
   const {data:controlData,error:controlError}=await controlQuery;
   if(controlError){if(active){setError("تعذر تحميل الضوابط: "+controlError.message);setLoading(false);}return;}
   const controls=(controlData??[]) as Control[];
   if(controls.length===0){if(active){setRows([]);setLoading(false);}return;}
   const {data:evidenceData,error:evidenceError}=await supabase.rpc("grc_evidence_register");
   if(evidenceError){if(active){setError("تعذر تحميل الأدلة: "+evidenceError.message);setLoading(false);}return;}
   const map=new Map(controls.map(control=>[control.id,control]));
   if(active){setRows(((evidenceData??[]) as Evidence[]).filter(row=>map.has(row.control_id)).map(row=>({...row,control:map.get(row.control_id)})));setLoading(false);}
  }
  void load();return()=>{active=false;};
 },[router]);

 const frameworks=useMemo(()=>[...new Set(rows.map(row=>frameworkOf(row.control?.frameworks).code))].filter(code=>code!=="—").sort(),[rows]);
 const filtered=useMemo(()=>rows.filter(row=>{
  const q=search.trim().toLowerCase();
  const text=`${row.evidence_name||""} ${row.file_name||""} ${row.control?.control_code||""} ${row.control?.title_ar||""}`.toLowerCase();
  return (!q||text.includes(q))&&(status==="all"||(row.status||"")===status)&&(scope==="all"||row.is_current)&&(framework==="all"||frameworkOf(row.control?.frameworks).code===framework);
 }),[rows,search,status,scope,framework]);
 const scoped=rows.filter(row=>scope==="all"||row.is_current);
 const pending=scoped.filter(row=>["pending_review","under_review"].includes(row.status||"")).length;
 const accepted=scoped.filter(row=>row.status==="accepted").length;
 const rejected=scoped.filter(row=>row.status==="rejected").length;

 if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مستودع الأدلة…</main>;
 if(error)return <main className="workflow-page" dir="rtl"><h1>تعذر تحميل البيانات</h1><p role="alert">{error}</p><button onClick={()=>window.location.reload()}>إعادة المحاولة</button></main>;

 return <main className="workflow-page evidence-page" dir="rtl">
  <WorkflowHeading title="مستودع الأدلة" description="اعرض الدليل والضابط والإطار وحالة المراجعة في قائمة واحدة، وافتح التفاصيل عند الحاجة." action={<Link className="workflow-button" href="/controls">اختيار ضابط لرفع دليل ←</Link>}/>
  {role!=="nca_external_auditor"&&<details className="evidence-attention"><summary>طلبات الأدلة والمراجعات المطلوبة</summary><GrcAttention/></details>}
  <div className="workflow-tabs" role="group" aria-label="نطاق الأدلة"><button aria-pressed={scope==="current"} onClick={()=>setScope("current")}>الإرسالات الحالية</button><button aria-pressed={scope==="all"} onClick={()=>setScope("all")}>جميع الإصدارات</button></div>
  <div className="evidence-metrics"><span>إجمالي الأدلة <b>{scoped.length}</b></span><span>بانتظار المراجعة <b>{pending}</b></span><span>مقبولة <b>{accepted}</b></span><span>مرفوضة <b>{rejected}</b></span></div>
  <div className="evidence-filters">
   <label>البحث في الأدلة<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="اسم الدليل أو رمز الضابط"/></label>
   <label>الإطار التنظيمي<select value={framework} onChange={event=>setFramework(event.target.value)}><option value="all">جميع الأطر</option>{frameworks.map(code=><option key={code} value={code}>{code}</option>)}{framework!=="all"&&!frameworks.includes(framework)&&<option value={framework}>{framework}</option>}</select></label>
   <label>حالة الدليل<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">كل الحالات</option><option value="pending_review">بانتظار المراجعة</option><option value="under_review">قيد المراجعة</option><option value="accepted">مقبول</option><option value="rejected">مرفوض</option><option value="changes_requested">يحتاج استكمالًا</option></select></label>
  </div>
  <ResultSummary count={filtered.length} total={scoped.length} active={!!search||status!=="all"||framework!=="all"} reset={()=>{setSearch("");setStatus("all");setFramework("all");}}/>
  <div className="evidence-table-scroll"><table className="evidence-table"><thead><tr><th>الدليل</th><th>الضابط</th><th>الإطار</th><th>المالك</th><th>الإصدار</th><th>الحالة</th><th>الصلاحية</th><th>الإجراءات</th></tr></thead><tbody>
   {filtered.length===0?<tr><td colSpan={8} className="evidence-empty">لا توجد أدلة مطابقة حاليًا.</td></tr>:filtered.map(row=>{
    const key=`${row.id}-${row.link_id??"source"}`;
    const frameworkCode=frameworkOf(row.control?.frameworks).code;
    return <tr key={key}>
     <td className="evidence-primary"><strong>{row.evidence_name||row.file_name||`دليل ${row.id}`}</strong><small>{row.file_name||"اسم الملف غير موثق"}</small><details><summary>تفاصيل الدليل</summary><dl><dt>تاريخ الرفع</dt><dd>{formatComplianceDate(row.uploaded_at)}</dd><dt>رافع الدليل</dt><dd>{row.uploader_name||"غير موثق بالاسم"}</dd><dt>الوصف</dt><dd>{row.description||"لا يوجد"}</dd><dt>نوع الربط</dt><dd>{row.link_id?"دليل مشترك":"دليل مباشر"}</dd>{row.reviewed_at&&<><dt>تاريخ القرار</dt><dd>{formatComplianceDate(row.reviewed_at)}</dd><dt>المراجع</dt><dd>{row.reviewer_display_name||"مسجل في سجل القرار"}</dd><dt>ملاحظات المراجعة</dt><dd>{row.review_notes||"لا توجد"}</dd></>}</dl></details></td>
     <td><span dir="ltr">{row.control?.control_code||`#${row.control_id}`}</span><small>{row.control?.title_ar||""}</small></td>
     <td><span dir="ltr">{frameworkCode}</span></td>
     <td>{row.control?.control_owner||"غير معيّن"}</td>
     <td><span dir="ltr">{row.version_number}</span>{!row.is_current&&<small>إصدار سابق</small>}</td>
     <td><StatusBadge status={row.status||""}/></td>
     <td className={isExpired(row.valid_until)?"grc-warning":undefined}>{row.valid_until?formatComplianceDate(row.valid_until,true):"غير محددة"}</td>
     <td><div className="evidence-actions"><EvidenceDownload path={row.file_path} name={row.file_name}/><Link href={`/controls/${row.control_id}`}>فتح الضابط</Link>{["admin","cybersecurity_team"].includes(role)&&row.is_current&&["pending_review","under_review"].includes(row.status||"")&&<Link href={`/review#evidence-${row.id}`}>مراجعة</Link>}</div></td>
    </tr>;
   })}
  </tbody></table></div>
 </main>;
}

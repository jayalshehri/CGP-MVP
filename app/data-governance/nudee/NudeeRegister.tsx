"use client";
import { riyadhIsoDate } from "@/lib/dates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";
import EvidenceVersions, { type Submission } from "./EvidenceVersions";
import { readStrategyRows } from "@/lib/strategy-read";
import AccessibleDialog from "@/components/AccessibleDialog";
import "../data-governance.css";
import "./register.css";

type Requirement={id:number;source_row:number;domain_name:string;standard_code:string;requirement_title:string;maturity_level:string;evidence_name:string;evidence_description:string|null;source_compliance:string|null};
type Assignment={id:number;requirement_id:number;assignee_id:string|null;status:string;updated_at:string;due_date:string|null;review_notes:string|null};
type User={user_id:string;display_name:string|null;role:string};
function isLate(a: Assignment | undefined, today: string) {
 return !!a?.due_date && a.due_date < today && ["assigned", "changes_requested"].includes(a.status);
}
function ownerPriority(a: Assignment | undefined, today: string) {
 if (a?.status === "changes_requested") return 0;
 if (isLate(a, today)) return 1;
 if (a?.status === "assigned") return 2;
 return a?.status === "submitted" ? 3 : 4;
}
const statusLabels:Record<string,string>={unassigned:"لم يكلّف",assigned:"بانتظار الرفع",submitted:"بانتظار المراجعة",changes_requested:"أعيد للتعديل",approved:"معتمد"};
const views:Record<string,string>={all:"كل الحالات",...statusLabels,overdue:"متأخر"};
const pageSize=25;
export default function NudeeRegister(){
 const query=useSearchParams();
 const requestedView=query.get("view")||"all";
 const [role,setRole]=useState<"office"|"assignee"|null>(null);
 const [currentUserId,setCurrentUserId]=useState<string|null>(null);
 const [requirements,setRequirements]=useState<Requirement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [users,setUsers]=useState<User[]>([]);
 const [submissions,setSubmissions]=useState<Submission[]>([]);
 const [filter,setFilter]=useState("");
 const [page,setPage]=useState(1);
 const [selected,setSelected]=useState<number|null>(null);
 const [assignee,setAssignee]=useState("");
 const [due,setDue]=useState("");
 const [note,setNote]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const pending=useRef(false);
 const [needsRefresh,setNeedsRefresh]=useState(false);
 const [loading,setLoading]=useState(true);
 const [bulkIds,setBulkIds]=useState<number[]>([]);
 const [bulkAssignee,setBulkAssignee]=useState("");
 const [bulkDue,setBulkDue]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [domain,setDomain]=useState("");
 const [ownerFilter,setOwnerFilter]=useState("");
 const [versionId,setVersionId]=useState<number|null>(null);
 const [completedReview,setCompletedReview]=useState<number|null>(null);
 const load=useCallback(async()=>{
  const {user,profile}=await requireProfile(["admin","data_governance_team","nudee_owner"]);
  setCurrentUserId(user.id);
  const office=profile.role==="admin"||profile.role==="data_governance_team";
  const {data:a,error:ae}=await supabase.from("nudee_assignments").select("id,requirement_id,assignee_id,status,updated_at,due_date,review_notes").order("id");
  if(ae)throw ae;

  const files=await readStrategyRows<Submission>((from,to)=>supabase.from("nudee_submissions")
   .select("id,assignment_id,file_name,storage_path,submitted_at",{count:"exact"}).order("id",{ascending:false}).range(from,to),s=>s.id);
  if(files.error)throw new Error("تعذر تحميل نسخ الأدلة.");

  if(office){
   const [{data:r,error:re},{data:u,error:ue}]=await Promise.all([
    supabase.from("nudee_requirements").select("id,source_row,domain_name,standard_code,requirement_title,maturity_level,evidence_name,evidence_description,source_compliance").order("source_row").limit(1000),
    supabase.rpc("nudee_assignees")
   ]);
   if(re)throw re;if(ue)throw ue;
   setRequirements((r??[]) as Requirement[]);setUsers((u??[]) as User[]);setRole("office");
  }else{
   const {data:r,error:re}=await supabase.from("nudee_requirements").select("id,source_row,domain_name,standard_code,requirement_title,maturity_level,evidence_name,evidence_description,source_compliance").order("source_row").limit(1000);
   if(re)throw re;
   setRequirements((r??[]) as Requirement[]);
   setRole("assignee");
  }
  setAssignments((a??[]) as Assignment[]);
  setSubmissions(files.data);
  setNeedsRefresh(false);
 },[setAssignments,setCurrentUserId,setNeedsRefresh,setRequirements,setRole,setSubmissions,setUsers]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>load()).catch(e=>{if(active)setError(e.message||"تعذر تحميل المؤشر");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[load]);
 async function refreshAfterMutation(message:string){
  setNotice(message);setNeedsRefresh(true);
  try{await load();}catch{setNotice(message+"؛ تعذر تحديث القائمة. أعد تحميل البيانات قبل أي إجراء جديد.");}
 }
 async function retryLoad(){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");
  try{await load();setNotice("");}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل البيانات. حاول مرة أخرى.");}
  finally{pending.current=false;setBusy(false);setLoading(false);}
 }
 const view=Object.hasOwn(views,requestedView)&&!(role==="assignee"&&requestedView==="unassigned")?requestedView:"all";
 const byRequirement=useMemo(()=>new Map(assignments.map(a=>[a.requirement_id,a])),[assignments]);
 const names=useMemo(()=>new Map(users.map(u=>[u.user_id,u.display_name||u.user_id])),[users]);
 const submittedIds=useMemo(()=>new Set(submissions.map(s=>s.assignment_id)),[submissions]);
 const scoped=useMemo(()=>role==="office"?requirements:requirements.filter(r=>byRequirement.get(r.id)?.assignee_id===currentUserId),[role,requirements,byRequirement,currentUserId]);
 const today=riyadhIsoDate();
 const domains=useMemo(()=>Array.from(new Set(scoped.map(r=>r.domain_name))).sort((a,b)=>a.localeCompare(b,"ar")),[scoped]);
 const visible=useMemo(()=>{
  const search=filter.trim().toLocaleLowerCase("ar");
  return scoped.filter(r=>{
   const a=byRequirement.get(r.id);
   if(domain && r.domain_name!==domain)return false;
   if(ownerFilter && a?.assignee_id!==ownerFilter)return false;
   if(view==="overdue"){
    if(!isLate(a,today))return false;
   }else if(view!=="all"&&(a?.status||"unassigned")!==view)return false;
   return [r.standard_code,r.evidence_name,r.domain_name,r.requirement_title].join(" ").toLocaleLowerCase("ar").includes(search);
  }).sort((left,right)=>{
   const a=byRequirement.get(left.id), b=byRequirement.get(right.id);
   if(view==="submitted")return (a?.updated_at||"").localeCompare(b?.updated_at||"") || left.source_row-right.source_row;
   if(role==="assignee" || view==="overdue"){
    const rank=role==="assignee"?ownerPriority(a,today)-ownerPriority(b,today):0;
    return rank || (a?.due_date||"9999").localeCompare(b?.due_date||"9999") || left.source_row-right.source_row;
   }
   return left.source_row-right.source_row;
  });
 },[scoped,byRequirement,view,filter,today,role,domain,ownerFilter]);
 const pages=Math.max(1,Math.ceil(visible.length/pageSize));
 const currentPage=Math.min(page,pages);
 const pageRows=visible.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const current=scoped.find(r=>r.id===selected);
 const assignment=current?byRequirement.get(current.id):undefined;
 function canAssign(a:Assignment|undefined){return !a||(a.status==="assigned"&&!submittedIds.has(a.id));}
 function changeView(value:string){
  const url=new URL(window.location.href);
  if(value==="all")url.searchParams.delete("view");else url.searchParams.set("view",value);
  window.history.replaceState(null,"",url);
  setPage(1);setBulkIds([]);
 }
 function openRequirement(r:Requirement){
  const a=byRequirement.get(r.id);
  setSelected(r.id);setVersionId(null);setCompletedReview(null);setFile(null);setError("");setNotice("");
  setAssignee(a?.assignee_id||"");setDue(a?.due_date||"");setNote("");
 }
 function closeRequirement(){setSelected(null);setFile(null);setVersionId(null);}
 const files=useMemo(()=>assignment?submissions.filter(s=>s.assignment_id===assignment.id).sort((a,b)=>b.id-a.id):[],[assignment,submissions]);
 const latest=files[0];
 const displayed=files.find(s=>s.id===versionId)||latest;
 const latestSelected=!!latest && latest.id===displayed?.id;
 const nextReview=visible.find(r=>{
  const other=byRequirement.get(r.id);
  return r.id!==selected && other?.status==="submitted" && other.assignee_id!==currentUserId;
 });
 async function assign(){
  if(role!=="office"||!current||!canAssign(assignment)||!assignee||pending.current||needsRefresh)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   const {error:e}=await supabase.rpc("nudee_assign",{p_requirement_id:current.id,p_assignee_id:assignee,p_due_date:due||null});
   if(e)throw e;await refreshAfterMutation("تم إنشاء التكليف");
  }catch(e){setError(e instanceof Error?e.message:"فشل التكليف");}finally{pending.current=false;setBusy(false)}
 }
 async function bulkAssign(){
  if(role!=="office"||!bulkAssignee||!bulkIds.length||pending.current||needsRefresh)return;
  pending.current=true;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   const {data,error:e}=await supabase.rpc("nudee_assign_many",{p_requirement_ids:bulkIds,p_assignee_id:bulkAssignee,p_due_date:bulkDue||null});
   if(e)throw e;
   setBulkIds([]);await refreshAfterMutation("تم إسناد "+data+" متطلب بنجاح");
  }catch(e){setError(e instanceof Error?e.message:"فشل الإسناد الجماعي");}finally{pending.current=false;setBusy(false)}
 }
 async function review(decision:"approved"|"changes_requested"){
  if(role!=="office"||!assignment||!latestSelected||assignment.assignee_id===currentUserId||pending.current||needsRefresh)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   if(assignment.status!=="submitted")throw new Error("يجب استلام الدليل قبل مراجعته");
   if(decision==="changes_requested"&&!note.trim())throw new Error("أدخل سبب الإعادة");
   const {error:e}=await supabase.rpc("nudee_review_version",{p_assignment_id:assignment.id,p_submission_id:latest.id,p_decision:decision,p_notes:note||null});
   if(e){
    if(e.code==="40001"){setNeedsRefresh(true);throw new Error("تغيّرت النسخة أو حالة المراجعة. حدّث البيانات للاطلاع على آخر نسخة.");}
    throw e;
   }
   setCompletedReview(assignment.id);
   setAssignments(rows=>rows.map(row=>row.id===assignment.id?{...row,status:decision,review_notes:note||null}:row));
   await refreshAfterMutation(decision==="approved"?"تم اعتماد الدليل":"أعيد الدليل للمكلّف");
  }catch(e){setError(e instanceof Error?e.message:"فشلت المراجعة");}finally{pending.current=false;setBusy(false)}
 }
 async function upload(){
  if(!assignment||!file||assignment.assignee_id!==currentUserId||pending.current||needsRefresh)return;
  pending.current=true;setBusy(true);setError("");setNotice("");
  let uploadedPath:string|null=null;
  let submissionConfirmed=false;
  // Only an explicit database rejection proves the RPC did not commit.
  // An HTTP timeout/network error can arrive before the server finishes writing.
  let rpcDefinitelyRejected=false;
  try{
   await requireProfile();
   if(!["assigned","changes_requested"].includes(assignment.status))throw new Error("التكليف ليس متاحًا للرفع");
   if(file.size>20*1024*1024)throw new Error("الحد الأقصى للملف 20 ميجابايت");
   const allowed=["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
   if(!allowed.includes(file.type))throw new Error("نوع الملف غير مدعوم");
   const path=`${assignment.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const {error:ue}=await supabase.storage.from("nudee-evidence").upload(path,file,{upsert:false,contentType:file.type});
   if(ue)throw ue;
   uploadedPath=path;
   const {error:se}=await supabase.rpc("nudee_submit_evidence",{p_assignment_id:assignment.id,p_storage_path:path,p_file_name:file.name});
   if(se){
    // PostgreSQL errors below abort the transaction. Never infer rollback from
    // a transport error or an ambiguous PostgREST/gateway failure.
    rpcDefinitelyRejected=new Set(["P0001","23503","23505","23514","42501","22P02","22001"]).has(se.code);
    throw se;
   }
   submissionConfirmed=true;
   setFile(null);await refreshAfterMutation("تم رفع الدليل وإرساله للمراجعة");
  }catch(e){
   let message=e instanceof Error?e.message:"فشل رفع الدليل";
   if(uploadedPath&&!submissionConfirmed){
    // A timed-out RPC may have committed; verify before removing its file.
    const {data:submitted,error:checkError}=await supabase.from("nudee_submissions")
     .select("id").eq("storage_path",uploadedPath).maybeSingle();
    if(!checkError&&submitted){
     setFile(null);await refreshAfterMutation("تم استلام الدليل رغم تعذر تأكيد الاستجابة الأولى.");
     setBusy(false);return;
    }
    if(!checkError&&rpcDefinitelyRejected){
     // Clean up only when the database explicitly rejected the transaction.
     const {error:cleanupError}=await supabase.storage.from("nudee-evidence").remove([uploadedPath]);
     if(cleanupError)message+=". بقي ملف غير مُرسل في التخزين؛ تواصل مع مكتب البيانات لتنظيفه قبل إعادة الإسناد.";
    }else if(!checkError){
     // A read returning no row does not prove a timed-out RPC has finished.
     // Keep the uploaded object rather than risk deleting committed evidence.
     message+=". حالة الإرسال غير مؤكدة؛ احتفظنا بالملف لحماية الدليل. حدّث الصفحة وتواصل مع مكتب البيانات قبل إعادة المحاولة.";
    }else{
     message+=". تعذر التحقق من حالة الإرسال. احتفظنا بالملف؛ حدّث الصفحة قبل محاولة الرفع مجددًا.";
    }
   }
   setError(message);
  }finally{pending.current=false;setBusy(false)}
 }
 const feedback=<>
  {error&&<p className="nr-message nr-error" role="alert">{error}</p>}
  {notice&&<p className="nr-message" role="status">{notice}</p>}
  {(error||needsRefresh)&&<button type="button" className="nr-secondary" disabled={busy} onClick={retryLoad}>إعادة تحميل البيانات</button>}
 </>;
 const userOptions=users.map(u=><option key={u.user_id} value={u.user_id}>{u.display_name||u.user_id}</option>);

 const canUpload=assignment&&assignment.assignee_id===currentUserId&&["assigned","changes_requested"].includes(assignment.status);
 return <div className="dg-page nr-page" dir="rtl">
  <header className="nr-heading">
   <h1>{role==="assignee"?"مهامي":"المتطلبات والأدلة"}</h1>
   {role&&<p>{role==="assignee"?"تابع تكليفاتك وارفع أدلتك لمراجعة مكتب البيانات.":"ابحث عن متطلب لعرض دليله، أو حدد المتطلبات التي تريد إسنادها."}</p>}
  </header>
  {!current&&feedback}
  {loading&&<p role="status">جارٍ تحميل المتطلبات والأدلة…</p>}
  {role&&<section className="nr-register" aria-label={role==="office"?"سجل المتطلبات":"تكليفاتي"}>
   <div className="nr-tools">
    <label htmlFor="nudee-filter">بحث في المتطلبات
     <input id="nudee-filter" type="search" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);setBulkIds([]);}} placeholder="اسم الدليل أو المعيار أو المجال" />
    </label>
    <label htmlFor="nudee-view">حالة المتطلب
     <select id="nudee-view" value={view} onChange={e=>changeView(e.target.value)}>
      {Object.entries(views).filter(([key])=>role==="office"||key!=="unassigned").map(([key,label])=><option key={key} value={key}>{label}</option>)}
     </select>
    </label>
    {role==="office"&&<>
     <label>المجال<select value={domain} onChange={e=>{setDomain(e.target.value);setPage(1);setBulkIds([]);}}>
      <option value="">كل المجالات</option>{domains.map(d=><option key={d}>{d}</option>)}</select></label>
     <label>مالك المتطلب<select value={ownerFilter} onChange={e=>{setOwnerFilter(e.target.value);setPage(1);setBulkIds([]);}}>
      <option value="">كل المالكين</option>{userOptions}</select></label>
    </>}
    <p role="status" className="nr-count">{visible.length} من {scoped.length} متطلب</p>
   </div>
   {role==="office"&&bulkIds.length>0&&<section aria-label="الإسناد الجماعي" className="nr-bulk">
    <strong>المحدد للإسناد ({bulkIds.length})</strong>
    <label htmlFor="nudee-bulk-assignee">المكلّف
     <select id="nudee-bulk-assignee" value={bulkAssignee} onChange={e=>setBulkAssignee(e.target.value)}><option value="">اختر المستخدم</option>{userOptions}</select>
    </label>
    <label htmlFor="nudee-bulk-due">تاريخ الاستحقاق
     <input id="nudee-bulk-due" type="date" value={bulkDue} onChange={e=>setBulkDue(e.target.value)} />
    </label>
    <button type="button" className="nr-primary" disabled={busy||needsRefresh||!bulkAssignee} onClick={bulkAssign}>إسناد المحدد ({bulkIds.length})</button>
    <button type="button" className="nr-secondary" disabled={busy} onClick={()=>setBulkIds([])}>إلغاء التحديد</button>
   </section>}
   {!visible.length?<div className="nr-empty">
    <p>{scoped.length?"لا توجد متطلبات تطابق خيارات البحث والتصفية.":role==="assignee"?"لا توجد متطلبات مسندة إلى حسابك حاليًا.":"لا توجد متطلبات في السجل حاليًا."}</p>
    {scoped.length>0&&<button type="button" className="nr-secondary" onClick={()=>{setFilter("");setDomain("");setOwnerFilter("");changeView("all");}}>عرض كل المتطلبات</button>}
   </div>:<table className="nr-table" aria-label={role==="office"?"سجل متطلبات نُضيء":"المتطلبات المسندة إليّ"}>
    <thead><tr>{role==="office"&&<th scope="col" className="nr-select-col"><span className="nr-sr">تحديد للإسناد</span></th>}
     <th scope="col">الدليل والمعيار</th><th scope="col" className="nr-status-col">الحالة</th>{role==="office"&&<th scope="col" className="nr-owner-col">المكلّف</th>}<th scope="col" className="nr-due-col">الاستحقاق</th>
    </tr></thead>
    <tbody>{pageRows.map(r=>{
     const a=byRequirement.get(r.id);
     const status=a?.status||"unassigned";
     const checked=bulkIds.includes(r.id);
     return <tr key={r.id}>
      {role==="office"&&<td className="nr-select-col"><input type="checkbox" aria-label={"تحديد الدليل "+r.evidence_name} checked={checked}
       disabled={!canAssign(a)||busy||(!checked&&bulkIds.length>=100)} onChange={e=>setBulkIds(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))} /></td>}
      <td className="nr-evidence-col"><button type="button" className="nr-open" aria-haspopup="dialog" disabled={busy} onClick={()=>openRequirement(r)}>{r.evidence_name}</button>
       <small><bdi>{r.standard_code||"—"}</bdi> · {r.domain_name}</small>
       {a && <span className="nr-mobile-meta">{role==="office"&&<span>{names.get(a.assignee_id||"")||"مكلّف مسجّل"} · </span>}{a.due_date?<><span>الاستحقاق </span><time dir="ltr" dateTime={a.due_date}>{a.due_date}</time></>:"دون موعد محدد"}</span>}
       {role==="assignee"&&status==="changes_requested"&&<><span className="nr-row-note">{a?.review_notes}</span>
        <button type="button" className="nr-revise" onClick={()=>openRequirement(r)}>رفع نسخة معدّلة</button></>}
       </td>
      <td className="nr-status-col"><span className="nr-status" data-status={status}>{statusLabels[status]||status}</span>{isLate(a,today)&&<small className="nr-late">متأخر عن الاستحقاق</small>}</td>
      {role==="office"&&<td className="nr-owner-col">{a?.assignee_id?(names.get(a.assignee_id)||"مكلّف مسجّل"):"—"}</td>}
      <td className="nr-due-col">{a?.due_date?<time dateTime={a.due_date} dir="ltr">{a.due_date}</time>:"—"}</td>
     </tr>;
    })}</tbody>
   </table>}
   {pages>1&&<div className="cgp-pagination" aria-label="تصفح نتائج المتطلبات">
    <button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>السابق</button>
    <span aria-live="polite">الصفحة {currentPage} من {pages}</span>
    <button type="button" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>التالي</button>
   </div>}
  </section>}
  {current&&<AccessibleDialog key={current.id} labelledBy="nr-detail-title" backdropClassName="nr-overlay" className="nr-panel" busy={busy} onClose={closeRequirement}>
   <header className="nr-detail-heading">
    <div><small><bdi>{current.standard_code}</bdi> · {current.domain_name}</small><h2 id="nr-detail-title">{current.evidence_name}</h2></div>
    <button autoFocus type="button" className="nr-secondary" disabled={busy} onClick={closeRequirement}>إغلاق</button>
   </header>
   {feedback}
   <p>{current.requirement_title}</p>{current.evidence_description&&<p>{current.evidence_description}</p>}
   <dl className="nr-facts">
    <div><dt>المستوى</dt><dd>{current.maturity_level}</dd></div>
    <div><dt>حالة التكليف</dt><dd>{statusLabels[assignment?.status||"unassigned"]}</dd></div>
    {role==="office"&&assignment?.assignee_id&&<div><dt>المكلّف</dt><dd>{names.get(assignment.assignee_id)||"مكلّف مسجّل"}</dd></div>}
    {assignment?.due_date&&<div><dt>الاستحقاق</dt><dd><time dir="ltr">{assignment.due_date}</time></dd></div>}
   </dl>
   {assignment?.review_notes&&<p className="nr-message"><strong>ملاحظات المكتب</strong><br/>{assignment.review_notes}</p>}
   {role==="office"&&canAssign(assignment)&&<section className="nr-detail-section"><h3>إسناد المتطلب</h3>
    <label htmlFor="nudee-assignee">المسؤول عن رفع الدليل
     <select id="nudee-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">اختر المستخدم</option>{userOptions}</select></label>
    <label htmlFor="nudee-due">تاريخ الاستحقاق<input id="nudee-due" type="date" value={due} onChange={e=>setDue(e.target.value)} /></label>
    <button className="nr-primary" disabled={busy||needsRefresh||!assignee} onClick={assign}>حفظ التكليف</button>
   </section>}
   {canUpload&&<section className="nr-detail-section"><h3>إرسال الدليل</h3>
    <label htmlFor="nudee-file">ملف الدليل<input key={selected} id="nudee-file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" aria-describedby="nr-file-formats"
     disabled={busy||needsRefresh} onChange={e=>setFile(e.target.files?.[0]||null)} /></label>
    <small id="nr-file-formats">PDF أو DOCX أو PNG أو JPEG، بحد أقصى 20 ميجابايت.</small>
    <button className="nr-primary" disabled={busy||needsRefresh||!file} onClick={upload}>رفع وإرسال للمراجعة</button>
   </section>}
   {displayed&&assignment&&<EvidenceVersions key={assignment.id} files={files} selected={displayed} onSelect={setVersionId} status={assignment.status}/>}
   {role==="office"&&assignment?.status==="submitted"&&assignment.assignee_id!==currentUserId&&<section className="nr-detail-section"><h3>قرار المراجعة</h3>
    {latestSelected?<small>يُسجّل القرار على النسخة {files.length}.</small>:<p className="nr-return">اختر أحدث نسخة من الدليل لتسجيل القرار.</p>}
    <label htmlFor="nr-review-note">ملاحظات المراجعة <small>(مطلوبة عند الإعادة)</small>
     <textarea id="nr-review-note" value={note} onChange={e=>setNote(e.target.value)} rows={3}/></label>
    <div className="nr-actions">
     <button className="nr-primary" disabled={busy||needsRefresh||!latestSelected} onClick={()=>review("approved")}>اعتماد الدليل</button>
     <button className="nr-secondary" disabled={busy||needsRefresh||!latestSelected||!note.trim()} onClick={()=>review("changes_requested")}>إعادة للتعديل</button>
    </div>
   </section>}
   {assignment&&completedReview===assignment.id&&nextReview&&<button type="button" className="nr-primary nr-next" disabled={busy||needsRefresh}
    onClick={()=>{setPage(Math.floor(visible.indexOf(nextReview)/pageSize)+1);openRequirement(nextReview);}}>مراجعة الدليل التالي ←</button>}
   {role==="office"&&assignment?.status==="submitted"&&assignment.assignee_id===currentUserId&&<p role="note">يجب أن يراجع الدليل عضو آخر من مكتب البيانات.</p>}
  </AccessibleDialog>}
 </div>;
}

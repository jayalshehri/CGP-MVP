"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCount, NudeeHeading, NudeeMetric, NudeeNavigation } from "../nudee-workspace";
import ui from "../nudee-workspace.module.css";
import styles from "./nudee.module.css";

type Requirement={id:number;source_row:number;domain_name:string;standard_code:string;requirement_title:string;maturity_level:string;evidence_name:string;evidence_description:string|null;source_compliance:string|null};
type Assignment={id:number;requirement_id:number;assignee_id:string|null;status:string;due_date:string|null;review_notes:string|null};
type User={user_id:string;display_name:string|null;role:string};
type Submission={id:number;assignment_id:number;file_name:string;storage_path:string;submitted_at:string};
const statusLabels:Record<string,string>={unassigned:"لم يكلّف",assigned:"بانتظار الرفع",submitted:"بانتظار المراجعة",changes_requested:"أعيد للتعديل",approved:"معتمد"};
const dueDateFormat=new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{dateStyle:"medium",timeZone:"UTC"});
export default function NudeePage(){
 const [role,setRole]=useState<"office"|"assignee"|null>(null);
 const [currentUserId,setCurrentUserId]=useState<string|null>(null);
 const [requirements,setRequirements]=useState<Requirement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [users,setUsers]=useState<User[]>([]);
 const [submissions,setSubmissions]=useState<Submission[]>([]);
 const [filter,setFilter]=useState("");
 const [selected,setSelected]=useState<number|null>(null);
 const [assignee,setAssignee]=useState("");
 const [due,setDue]=useState("");
 const [note,setNote]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const pending=useRef(false);
 const detailRef=useRef<HTMLElement>(null);
 const selectedButton=useRef<HTMLButtonElement>(null);
 const [needsRefresh,setNeedsRefresh]=useState(false);
 const [loading,setLoading]=useState(true);
 const [bulkIds,setBulkIds]=useState<number[]>([]);
 const [bulkAssignee,setBulkAssignee]=useState("");
 const [bulkDue,setBulkDue]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [evidenceLink,setEvidenceLink]=useState<string|null>(null);
 const load=useCallback(async()=>{
  const {user,profile}=await requireProfile(["admin","data_governance_team","nudee_owner"]);
  setCurrentUserId(user.id);
  const office=profile.role==="admin"||profile.role==="data_governance_team";
  const {data:a,error:ae}=await supabase.from("nudee_assignments").select("id,requirement_id,assignee_id,status,due_date,review_notes").order("id");
  if(ae)throw ae;

  const {data:files,error:fe}=await supabase.from("nudee_submissions").select("id,assignment_id,file_name,storage_path,submitted_at").order("submitted_at",{ascending:false});
  if(fe)throw fe;

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
  setSubmissions((files??[]) as Submission[]);
  setNeedsRefresh(false);
 },[]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>load()).catch(e=>{if(active)setError(e.message||"تعذر تحميل المؤشر");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[load]);
 useEffect(()=>{if(selected!==null)detailRef.current?.focus();},[selected]);
 async function refreshAfterMutation(message:string){
  setNotice(message);setNeedsRefresh(true);
  try{await load();}catch{setNotice(message+"؛ تعذر تحديث القائمة. أعد تحميل البيانات قبل أي إجراء جديد.");}
 }
 async function retryLoad(){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");
  try{await load();setNotice("");}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل البيانات. حاول مرة أخرى.");}
  finally{pending.current=false;setBusy(false);setLoading(false);}
 }
 const visible=useMemo(()=>requirements.filter(r=>(r.standard_code+" "+r.evidence_name+" "+r.domain_name+" "+r.requirement_title).toLocaleLowerCase("ar").includes(filter.trim().toLocaleLowerCase("ar"))),[requirements,filter]);
 const current=requirements.find(r=>r.id===selected);
 const assignment=assignments.find(a=>a.requirement_id===selected);
 async function openEvidence(path:string){
  // Open a blank tab synchronously from the user gesture: browsers block popups after await.
  const preview=window.open("about:blank","_blank");
  if(preview)preview.opener=null;
  setEvidenceLink(null);setError("");
  try{
   const {data,error:e}=await supabase.storage.from("nudee-evidence").createSignedUrl(path,60);
   if(e||!data?.signedUrl)throw e||new Error("تعذر إنشاء رابط الدليل المؤقت");
   if(preview)preview.location.replace(data.signedUrl);
   else setEvidenceLink(data.signedUrl);
  }catch(e){
   // A network exception must not leave an empty tab open indefinitely.
   preview?.close();
   setError(e instanceof Error?e.message:"تعذر فتح الدليل. تحقق من الاتصال ثم حاول مرة أخرى.");
  }
 }
 async function assign(){
  if(!current||!assignee||pending.current||needsRefresh)return;pending.current=true;setBusy(true);setError("");setNotice("");
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
  if(!assignment||pending.current||needsRefresh)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   if(assignment.status!=="submitted")throw new Error("يجب استلام الدليل قبل مراجعته");
   if(decision==="changes_requested"&&!note.trim())throw new Error("أدخل سبب الإعادة");
   const {error:e}=await supabase.rpc("nudee_review_evidence",{p_assignment_id:assignment.id,p_decision:decision,p_notes:note||null});
   if(e)throw e;
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
 const status=assignment?.status||"unassigned";
 const currentSubmissions=assignment ? submissions.filter(item=>item.assignment_id===assignment.id) : [];
 const canUpload=["assigned","changes_requested"].includes(status);
 const assignmentLocked=status==="submitted"||status==="approved";
 const assignedUser=users.find(user=>user.user_id===assignment?.assignee_id);
 const blocked=busy||needsRefresh;
 const primary=`${ui.button} ${ui.primary}`;
 const feedback=<>
  {error && <div className={`${ui.message} ${ui.error}`}><p role="alert">{error}</p>
    <button type="button" className={ui.button} disabled={busy} onClick={retryLoad}>إعادة تحميل البيانات</button>
  </div>}
  {notice && <div className={`${ui.message} ${needsRefresh?ui.warning:ui.success}`}><p role="status">{notice}</p>
    {needsRefresh&&!error && <button type="button" className={ui.button} disabled={busy} onClick={retryLoad}>إعادة تحميل البيانات</button>}
  </div>}
  {evidenceLink && <p role="status" className={ui.message}><a href={evidenceLink} target="_blank" rel="noopener noreferrer">فتح الدليل (رابط مؤقت)</a></p>}
 </>;

 return (
  <main className={ui.workspace} dir="rtl">
   <NudeeHeading title="التكليفات والأدلة" description="إدارة متطلبات نُضيء وإسناد الأدلة ورفعها ومراجعتها.">
    {role==="office" && <NudeeNavigation current="evidence" />}
   </NudeeHeading>
   {!current && feedback}
   {loading && <p role="status" className={ui.message}>جاري تحميل المؤشر…</p>}
   {role && <>
    <section className={ui.metrics} aria-label="ملخص التكليفات">
     <NudeeMetric label="المتطلبات" value={requirements.length} />
     <NudeeMetric label="التكليفات" value={assignments.filter(a=>a.status!=="unassigned").length} />
     <NudeeMetric label="بانتظار المراجعة" value={assignments.filter(a=>a.status==="submitted").length} />
     <NudeeMetric label="الأدلة المعتمدة" value={assignments.filter(a=>a.status==="approved").length} />
    </section>
    <div className={styles.workArea} data-detail-open={Boolean(current)}>
     {role==="office" && <section className={`${ui.panel} ${styles.bulk}`} aria-labelledby="nudee-bulk">
      <h2 id="nudee-bulk">إسناد جماعي للمتطلبات</h2>
      <p className={ui.description}>حدد المتطلبات من القائمة ثم اختر المكلّف. تُحفظ جميع التكليفات في عملية واحدة.</p>
      <div className={styles.bulkForm}>
       <label className={ui.field}>المكلّف برفع الأدلة
        <select value={bulkAssignee} onChange={e=>setBulkAssignee(e.target.value)}>
         <option value="">اختر المستخدم</option>
         {users.map(u=><option key={u.user_id} value={u.user_id}>{u.display_name||u.user_id}</option>)}
        </select>
       </label>
       <label className={ui.field}>تاريخ الاستحقاق<input type="date" value={bulkDue} onChange={e=>setBulkDue(e.target.value)} /></label>
       <div className={styles.actions}>
        <button type="button" className={primary} disabled={blocked||!bulkAssignee||bulkIds.length===0} onClick={bulkAssign}>إسناد المحدد ({formatCount.format(bulkIds.length)})</button>
        <button type="button" className={ui.button} disabled={blocked||bulkIds.length===0} onClick={()=>setBulkIds([])}>إلغاء التحديد</button>
       </div>
      </div>
     </section>}
     <section className={`${ui.panel} ${styles.list}`} aria-labelledby="nudee-list">
      <div className={styles.listHeader}>
       <h2 id="nudee-list">قائمة المتطلبات</h2>
       <label className={ui.field}>البحث عن دليل أو معيار
        <input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="رمز المعيار أو اسم الدليل" />
       </label>
       <p role="status" className={ui.description}>{formatCount.format(visible.length)} من {formatCount.format(requirements.length)} متطلب</p>
      </div>
      {!visible.length && <p className={ui.message}>{requirements.length?"لا توجد نتائج مطابقة. عدّل كلمات البحث.":role==="office"?"لا توجد متطلبات متاحة حاليًا.":"لا توجد متطلبات مسندة إلى حسابك حاليًا."}</p>}
      {visible.length>0 && <ul className={styles.queue}>
       {visible.map(r=>{
        const a=assignments.find(x=>x.requirement_id===r.id);
        const selectable=role==="office"&&(!a||a.status==="assigned")&&!submissions.some(x=>x.assignment_id===a?.id);
        const rowStatus=a?.status||"unassigned";
        const checked=bulkIds.includes(r.id);
        return (
         <li key={r.id} className={styles.task} data-current={selected===r.id}>
          {role==="office" && <label className={styles.check}>
           <input type="checkbox" aria-label={"تحديد الدليل "+r.evidence_name} checked={checked} disabled={!selectable||busy||(!checked&&bulkIds.length>=100)} onChange={e=>setBulkIds(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))} />
          </label>}
          <button type="button" className={styles.taskButton} aria-pressed={selected===r.id} aria-controls="nudee-detail" disabled={busy}
           onClick={event=>{
            selectedButton.current=event.currentTarget;
            setSelected(r.id);setFile(null);setAssignee(a?.assignee_id||"");setDue(a?.due_date||"");setNote(a?.review_notes||"");
           }}>
           <span className={styles.taskCode}><bdi>{r.standard_code||"تكليف #"+r.id}</bdi></span>
           <span className={styles.taskName}>{r.evidence_name}</span>
           <span className={styles.taskMeta}><span>{r.maturity_level}</span><span className={styles.badge} data-status={rowStatus}>{statusLabels[rowStatus]}</span></span>
          </button>
         </li>
        );
       })}
      </ul>}
     </section>
     <section ref={detailRef} id="nudee-detail" role="region" aria-label="تفاصيل المتطلب" tabIndex={-1} className={`${ui.panel} ${styles.detail}`}>
      {current ? <>
       <button type="button" className={`${ui.button} ${styles.backToList}`} disabled={busy} onClick={()=>{
        setSelected(null);
        requestAnimationFrame(()=>selectedButton.current?.focus());
       }}>العودة إلى قائمة المتطلبات</button>
       <header className={styles.detailHeader}>
        <div className={styles.detailMeta}>
         {current.standard_code && <bdi className={styles.taskCode}>{current.standard_code}</bdi>}
         <span className={styles.badge} data-status={status}>{statusLabels[status]}</span>
        </div>
        <h2>{current.evidence_name}</h2>
        <p className={styles.requirement}>{current.requirement_title}</p>
        {current.evidence_description && <p className={ui.description}>{current.evidence_description}</p>}
        <dl className={styles.facts}>
         <div><dt>المجال</dt><dd>{current.domain_name}</dd></div>
         <div><dt>مستوى النضج</dt><dd>{current.maturity_level}</dd></div>
         {role==="office"&&assignmentLocked && <>
          <div><dt>المكلّف برفع الدليل</dt><dd>{assignedUser?.display_name||assignedUser?.user_id||"—"}</dd></div>
          <div><dt>تاريخ الاستحقاق</dt><dd>{assignment?.due_date ? <time dateTime={assignment.due_date}>{dueDateFormat.format(new Date(assignment.due_date))}</time> : "—"}</dd></div>
         </>}
        </dl>
       </header>
       {feedback}
       {role==="office"&&!assignmentLocked && <section className={styles.detailSection}>
        <h3>إسناد المتطلب</h3>
        <div className={styles.assignmentFields}>
         <label className={ui.field}>المسؤول عن رفع الدليل
          <select id="nudee-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)}>
           <option value="">اختر المستخدم</option>
           {users.map(u=><option value={u.user_id} key={u.user_id}>{u.display_name||u.user_id}</option>)}
          </select>
         </label>
         <label className={ui.field}>تاريخ الاستحقاق<input type="date" value={due} onChange={e=>setDue(e.target.value)} /></label>
        </div>
        <button type="button" className={primary} disabled={blocked||!assignee} onClick={assign}>حفظ التكليف</button>
       </section>}
       {assignment?.assignee_id===currentUserId&&canUpload && <section className={styles.detailSection}>
        <h3>رفع الدليل</h3>
        <div className={ui.field}>
         <label className={`cgp-file-choice ${styles.fileChoice}`} data-disabled={blocked}>
          <span>اختيار ملف الدليل</span>
          <bdi>{file?.name||"لم يُحدد ملف"}</bdi>
          <input id="nudee-file" className="cgp-file-input" aria-label="اختيار ملف الدليل" aria-describedby="nudee-file-help"
           key={selected??"none"} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={blocked} />
         </label>
         <small id="nudee-file-help">PDF أو Word أو صورة. الحد الأقصى للملف ٢٠ ميجابايت.</small>
        </div>
        <button type="button" className={primary} disabled={blocked||!file} onClick={upload}>رفع وإرسال للمراجعة</button>
       </section>}
       {currentSubmissions.length>0 && <section className={styles.detailSection}>
        <h3>الأدلة المرفوعة</h3>
        <ul className={styles.files}>
         {currentSubmissions.map(x=><li key={x.id}><button className={ui.button} type="button" onClick={()=>openEvidence(x.storage_path)}>عرض الدليل: <bdi>{x.file_name}</bdi></button></li>)}
        </ul>
       </section>}
       {role==="office"&&status==="submitted"&&assignment?.assignee_id!==currentUserId && <section className={styles.detailSection}>
        <h3>قرار مسؤول المكتب</h3>
        <label className={ui.field}>ملاحظات المراجعة
         <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="أدخل ملاحظاتك" />
         <small>أدخل سببًا لإعادة الدليل للتعديل.</small>
        </label>
        <div className={styles.actions}>
         <button type="button" className={primary} disabled={blocked} onClick={()=>review("approved")}>اعتماد الدليل</button>
         <button type="button" className={`${ui.button} ${styles.returnAction}`} disabled={blocked||!note.trim()} onClick={()=>review("changes_requested")}>إعادة للتعديل</button>
        </div>
       </section>}
       {role==="office"&&status==="submitted"&&assignment?.assignee_id===currentUserId && <p role="note" className={`${ui.message} ${ui.warning}`}>لا يمكن للمكلّف اعتماد الدليل الذي رفعه بنفسه؛ يتطلب مراجعًا آخر من مكتب البيانات.</p>}
       {assignment?.review_notes && <div className={ui.message}><p><strong>ملاحظات المكتب:</strong> {assignment.review_notes}</p></div>}
      </> : <>
       <h2>تفاصيل المتطلب</h2>
       <p className={ui.description}>اختر دليلًا من القائمة لعرض تفاصيله والإجراءات المتاحة.</p>
      </>}
     </section>
    </div>
   </>}
  </main>
 );
}

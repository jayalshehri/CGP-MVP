"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import "../data-governance.css";

type Requirement={id:number;source_row:number;domain_name:string;standard_code:string;requirement_title:string;maturity_level:string;evidence_name:string;evidence_description:string|null;source_compliance:string|null};
type Assignment={id:number;requirement_id:number;assignee_id:string|null;status:string;due_date:string|null;review_notes:string|null};
type User={user_id:string;display_name:string|null;role:string};
type Submission={id:number;assignment_id:number;file_name:string;storage_path:string;submitted_at:string};
const statusLabels:Record<string,string>={unassigned:"لم يكلّف",assigned:"بانتظار الرفع",submitted:"بانتظار المراجعة",changes_requested:"أعيد للتعديل",approved:"معتمد"};
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
 const [bulkIds,setBulkIds]=useState<number[]>([]);
 const [bulkAssignee,setBulkAssignee]=useState("");
 const [bulkDue,setBulkDue]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [evidenceLink,setEvidenceLink]=useState<string|null>(null);
 const load=useCallback(async()=>{
  const {user,profile}=await requireProfile();
  setCurrentUserId(user.id);
  const office=profile.role==="admin"||profile.role==="data_governance_team";
  const {data:a,error:ae}=await supabase.from("nudee_assignments").select("id,requirement_id,assignee_id,status,due_date,review_notes").order("id");
  if(ae)throw ae;
  setAssignments((a??[]) as Assignment[]);
  const {data:files,error:fe}=await supabase.from("nudee_submissions").select("id,assignment_id,file_name,storage_path,submitted_at").order("submitted_at",{ascending:false});
  if(fe)throw fe;
  setSubmissions((files??[]) as Submission[]);
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
   if(!(a??[]).some(x=>x.assignee_id===user.id))throw new Error("لا توجد تكليفات نُضيء مسندة إلى حسابك.");
   setRole("assignee");
  }
 },[]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>load()).catch(e=>{if(active)setError(e.message||"تعذر تحميل المؤشر");});return()=>{active=false};},[load]);
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
  if(!current||!assignee)return;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   const {error:e}=await supabase.rpc("nudee_assign",{p_requirement_id:current.id,p_assignee_id:assignee,p_due_date:due||null});
   if(e)throw e;setNotice("تم إنشاء التكليف");await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل التكليف");}finally{setBusy(false)}
 }
 async function bulkAssign(){
  if(role!=="office"||!bulkAssignee||!bulkIds.length)return;
  setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   const {data,error:e}=await supabase.rpc("nudee_assign_many",{p_requirement_ids:bulkIds,p_assignee_id:bulkAssignee,p_due_date:bulkDue||null});
   if(e)throw e;
   setNotice("تم إسناد "+data+" متطلب بنجاح");setBulkIds([]);await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل الإسناد الجماعي");}finally{setBusy(false)}
 }
 async function review(decision:"approved"|"changes_requested"){
  if(!assignment)return;setBusy(true);setError("");setNotice("");
  try{
   await requireProfile(["admin","data_governance_team"]);
   if(assignment.status!=="submitted")throw new Error("يجب استلام الدليل قبل مراجعته");
   if(decision==="changes_requested"&&!note.trim())throw new Error("أدخل سبب الإعادة");
   const {error:e}=await supabase.rpc("nudee_review_evidence",{p_assignment_id:assignment.id,p_decision:decision,p_notes:note||null});
   if(e)throw e;
   setNotice(decision==="approved"?"تم اعتماد الدليل":"أعيد الدليل للمكلّف");await load();
  }catch(e){setError(e instanceof Error?e.message:"فشلت المراجعة");}finally{setBusy(false)}
 }
 async function upload(){
  if(!assignment||!file||assignment.assignee_id!==currentUserId)return;
  setBusy(true);setError("");setNotice("");
  let uploadedPath:string|null=null;
  let submissionConfirmed=false;
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
   if(se)throw se;
   submissionConfirmed=true;
   setFile(null);setNotice("تم رفع الدليل وإرساله للمراجعة");await load();
  }catch(e){
   let message=e instanceof Error?e.message:"فشل رفع الدليل";
   if(uploadedPath&&!submissionConfirmed){
    // A timed-out RPC may have committed; verify before removing its file.
    const {data:submitted,error:checkError}=await supabase.from("nudee_submissions")
     .select("id").eq("storage_path",uploadedPath).maybeSingle();
    if(!checkError&&submitted){
     setFile(null);setNotice("تم استلام الدليل رغم تعذر تأكيد الاستجابة الأولى.");
     try{await load();}catch{setNotice("تم استلام الدليل. حدّث الصفحة لعرض الحالة.");}
     setBusy(false);return;
    }
    if(!checkError){
     const {error:cleanupError}=await supabase.storage.from("nudee-evidence").remove([uploadedPath]);
     if(cleanupError)message+=". بقي ملف غير مُرسل في التخزين؛ تواصل مع مكتب البيانات لتنظيفه قبل إعادة الإسناد.";
    }else{
     message+=". تعذر التحقق من حالة الإرسال. حدّث الصفحة قبل محاولة الرفع مجددًا.";
    }
   }
   setError(message);
  }finally{setBusy(false)}
 }
 return <main className="dg-page" dir="rtl" style={{maxWidth:1200,margin:"auto"}}>
  <div className="workflow-heading"><div><span>مكتب إدارة البيانات</span><h1>مؤشر نُضيء — التكليفات والأدلة</h1><p>إدارة المتطلبات، إسناد الأدلة، الرفع والتحقق قبل الاعتماد</p></div></div>
  <nav aria-label="صفحات مؤشر نُضيء" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}><Link href="/data-governance/nudee" aria-current="page">التكليفات والأدلة</Link>{role==="office"&&<Link href="/data-governance/nudee-dashboard">لوحة مؤشر نُضيء</Link>}</nav>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#047857"}}>{notice}</p>}
  {evidenceLink&&<p role="status"><a href={evidenceLink} target="_blank" rel="noopener noreferrer">فتح الدليل (رابط مؤقت)</a></p>}
  {!role&&!error&&<p>جاري تحميل المؤشر…</p>}
  {role&&<><section className="dg-metrics" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
   {[["المتطلبات",requirements.length],["التكليفات",assignments.filter(a=>a.status!=="unassigned").length],["بانتظار المراجعة",assignments.filter(a=>a.status==="submitted").length],["المعتمدة",assignments.filter(a=>a.status==="approved").length]].map(([name,value])=><div key={name} style={{background:"#f1f5f9",padding:16,borderRadius:12}}><small>{name}</small><h2>{value}</h2></div>)}
  </section>
  {role==="office"&&<section aria-label="الإسناد الجماعي" style={{marginTop:18,padding:18,border:"1px solid #ccdad9",borderRadius:13,background:"#f0fdfa"}}><h2 style={{margin:"0 0 8px"}}>إسناد جماعي للمتطلبات</h2><p style={{fontSize:13,color:"#475569"}}>حدد الأدلة المتاحة من القائمة أدناه، ثم اختر المسؤول وتاريخ الاستحقاق. يُطبّق الإسناد لجميع المحددات في عملية واحدة، أو يُلغى كامل الإجراء عند وجود خطأ.</p><div style={{display:"flex",alignItems:"end",flexWrap:"wrap",gap:10}}><label style={{flex:"2 1 220px"}}>المكلّف برفع الأدلة<select value={bulkAssignee} onChange={e=>setBulkAssignee(e.target.value)} style={{display:"block",width:"100%",padding:9,marginTop:6}}><option value="">اختر المستخدم</option>{users.map(u=><option key={u.user_id} value={u.user_id}>{u.display_name||u.user_id}</option>)}</select></label><label style={{flex:"1 1 140px"}}>تاريخ الاستحقاق<input type="date" value={bulkDue} onChange={e=>setBulkDue(e.target.value)} style={{display:"block",padding:9,marginTop:6,width:"100%"}}/></label><button disabled={busy||!bulkAssignee||bulkIds.length===0} onClick={bulkAssign}>إسناد المحدد ({bulkIds.length})</button><button disabled={busy||bulkIds.length===0} onClick={()=>setBulkIds([])}>إلغاء التحديد</button></div></section>}
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,280px),1fr))",gap:20,marginTop:24}}>
   <div><label htmlFor="nudee-filter">البحث عن دليل أو معيار</label><input id="nudee-filter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="بحث..." style={{display:"block",width:"100%",padding:10,margin:"8px 0"}}/>
   <div style={{maxHeight:560,overflow:"auto",display:"grid",gap:8}}>{visible.map(r=>{const a=assignments.find(x=>x.requirement_id===r.id);const selectable=role==="office"&&(!a||a.status==="assigned")&&!submissions.some(x=>x.assignment_id===a?.id);return <div key={r.id} style={{display:"flex",alignItems:"center",gap:8}}>{role==="office"&&<input type="checkbox" aria-label={"تحديد الدليل "+r.evidence_name} checked={bulkIds.includes(r.id)} disabled={!selectable||busy||(!bulkIds.includes(r.id)&&bulkIds.length>=100)} onChange={e=>setBulkIds(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/>}<button type="button" onClick={()=>{setSelected(r.id);setAssignee(a?.assignee_id||"");setDue(a?.due_date||"");setNote(a?.review_notes||"");}} style={{flex:1,textAlign:"right",padding:12,border:"1px solid #cbd5e1",borderRadius:9,background:selected===r.id?"#ccfbf1":"white",color:"#0f172a"}}><b>{r.standard_code||"تكليف #"+r.id}</b> — {r.evidence_name}<div><small>{r.maturity_level} · {statusLabels[a?.status||"unassigned"]}</small></div></button></div>})}</div></div>
   <div style={{border:"1px solid #cbd5e1",borderRadius:12,padding:20,alignSelf:"start"}}>{!current?<p>اختر دليلًا لعرض التفاصيل.</p>:<><h2>{current.evidence_name}</h2><p>{current.requirement_title}</p><p>{current.evidence_description}</p><p><b>المجال:</b> {current.domain_name} · <b>المستوى:</b> {current.maturity_level}</p><p><b>حالة التكليف:</b> {statusLabels[assignment?.status||"unassigned"]}</p>
   {role==="office"&&<><label htmlFor="nudee-assignee">المسؤول عن رفع الدليل</label><select id="nudee-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)} style={{display:"block",width:"100%",padding:10,margin:"8px 0"}}><option value="">اختر المستخدم</option>{users.map(u=><option value={u.user_id} key={u.user_id}>{u.display_name||u.user_id}</option>)}</select><label htmlFor="nudee-due">تاريخ الاستحقاق</label><input id="nudee-due" type="date" value={due} onChange={e=>setDue(e.target.value)} style={{display:"block",padding:8,margin:"8px 0"}}/><button disabled={busy||!assignee||assignment?.status==="submitted"||assignment?.status==="approved"} onClick={assign}>حفظ التكليف</button></>}
   {assignment?.assignee_id===currentUserId&&<><label htmlFor="nudee-file">ملف الدليل (PDF أو Word أو صورة)</label><input id="nudee-file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={busy||!["assigned","changes_requested"].includes(assignment.status)}/><button disabled={busy||!file||!["assigned","changes_requested"].includes(assignment.status)} onClick={upload}>رفع وإرسال للمراجعة</button></>}
   {assignment&&submissions.filter(x=>x.assignment_id===assignment.id).map(x=><div key={x.id} style={{margin:"8px 0"}}><button type="button" onClick={()=>openEvidence(x.storage_path)}>عرض الدليل: {x.file_name}</button></div>)}
   {role==="office"&&assignment?.status==="submitted"&&assignment.assignee_id!==currentUserId&&<div style={{marginTop:20}}><h3>قرار مسؤول المكتب</h3><textarea aria-label="ملاحظات المراجعة" value={note} onChange={e=>setNote(e.target.value)} placeholder="ملاحظات المراجعة" style={{width:"100%",minHeight:90}}/><div style={{display:"flex",gap:10}}><button disabled={busy} onClick={()=>review("approved")}>اعتماد الدليل</button><button disabled={busy||!note.trim()} onClick={()=>review("changes_requested")}>إعادة للتعديل</button></div></div>}
   {role==="office"&&assignment?.status==="submitted"&&assignment.assignee_id===currentUserId&&<p role="note">لا يمكن للمكلّف اعتماد الدليل الذي رفعه بنفسه؛ يتطلب مراجعًا آخر من مكتب البيانات.</p>}
   {assignment?.review_notes&&<p><b>ملاحظات المكتب:</b> {assignment.review_notes}</p>}</>}</div>
  </section></>}
  <p style={{marginTop:24,fontSize:12,color:"#64748b"}}>البيانات تُقرأ من قاعدة CGP؛ لن تظهر المتطلبات حتى تُستورد من ملف نُضيء وتُطبّق الهجرة المعتمدة.</p>
 </main>;
}

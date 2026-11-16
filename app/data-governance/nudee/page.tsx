"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";

type Requirement={id:number;source_row:number;domain_name:string;standard_code:string;requirement_title:string;maturity_level:string;evidence_name:string;evidence_description:string|null;source_compliance:string|null};
type Assignment={id:number;requirement_id:number;assignee_id:string|null;status:string;due_date:string|null;review_notes:string|null};
type User={user_id:string;display_name:string|null};
type Submission={id:number;assignment_id:number;file_name:string;storage_path:string;submitted_at:string};
const statusLabels:Record<string,string>={unassigned:"لم يكلّف",assigned:"بانتظار الرفع",submitted:"بانتظار المراجعة",changes_requested:"أعيد للتعديل",approved:"معتمد"};
export default function NudeePage(){
 const [role,setRole]=useState<"office"|"assignee"|null>(null);
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
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  const {user,profile}=await requireProfile();
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
    supabase.from("profiles").select("user_id,display_name").eq("is_active",true).limit(200)
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
 const visible=useMemo(()=>requirements.filter(r=>(r.standard_code+" "+r.evidence_name+" "+r.domain_name).includes(filter)),[requirements,filter]);
 const current=requirements.find(r=>r.id===selected);
 const assignment=assignments.find(a=>a.requirement_id===selected);
 async function openEvidence(path:string){
  const {data,error:e}=await supabase.storage.from("nudee-evidence").createSignedUrl(path,60);
  if(e||!data?.signedUrl){setError(e?.message||"تعذر فتح الدليل");return;}
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 }
 async function assign(){
  if(!current||!assignee)return;setBusy(true);setError("");setNotice("");
  try{
   const {user}=await requireProfile(["admin","data_governance_team"]);
   const {error:e}=await supabase.from("nudee_assignments").upsert({requirement_id:current.id,assignee_id:assignee,assigned_by:user.id,due_date:due||null,status:"assigned",review_notes:null},{onConflict:"requirement_id"});
   if(e)throw e;setNotice("تم إنشاء التكليف");await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل التكليف");}finally{setBusy(false)}
 }
 async function review(decision:"approved"|"changes_requested"){
  if(!assignment)return;setBusy(true);setError("");setNotice("");
  try{
   const {user}=await requireProfile(["admin","data_governance_team"]);
   if(assignment.status!=="submitted")throw new Error("يجب استلام الدليل قبل مراجعته");
   if(decision==="changes_requested"&&!note.trim())throw new Error("أدخل سبب الإعادة");
   const {error:e}=await supabase.from("nudee_assignments").update({status:decision,review_notes:note||null,reviewer_id:user.id,reviewed_at:new Date().toISOString()}).eq("id",assignment.id).eq("status","submitted");
   if(e)throw e;
   const {error:logError}=await supabase.from("nudee_audit").insert({assignment_id:assignment.id,actor_id:user.id,action:decision,notes:note||null});
   if(logError)throw logError;
   setNotice(decision==="approved"?"تم اعتماد الدليل":"أعيد الدليل للمكلّف");await load();
  }catch(e){setError(e instanceof Error?e.message:"فشلت المراجعة");}finally{setBusy(false)}
 }
 async function upload(){
  if(!assignment||!file)return;setBusy(true);setError("");setNotice("");
  try{
   const {user}=await requireProfile();
   if(!["assigned","changes_requested"].includes(assignment.status))throw new Error("التكليف ليس متاحًا للرفع");
   if(file.size>20*1024*1024)throw new Error("الحد الأقصى للملف 20 ميجابايت");
   const allowed=["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
   if(!allowed.includes(file.type))throw new Error("نوع الملف غير مدعوم");
   const path=`${assignment.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const {error:ue}=await supabase.storage.from("nudee-evidence").upload(path,file,{upsert:false,contentType:file.type});
   if(ue)throw ue;
   const {error:ie}=await supabase.from("nudee_submissions").insert({assignment_id:assignment.id,submitted_by:user.id,storage_path:path,file_name:file.name});
   if(ie)throw ie;
   const {error:se}=await supabase.rpc("nudee_mark_submitted",{p_assignment_id:assignment.id});
   if(se)throw se;
   setFile(null);setNotice("تم رفع الدليل وإرساله للمراجعة");await load();
  }catch(e){setError(e instanceof Error?e.message:"فشل رفع الدليل");}finally{setBusy(false)}
 }
 return <main className="dg-page" dir="rtl" style={{maxWidth:1200,margin:"auto"}}>
  <div className="workflow-heading"><div><span>مكتب إدارة البيانات</span><h1>مؤشر نُضيء — التكليفات والأدلة</h1><p>إدارة المتطلبات، إسناد الأدلة، الرفع والتحقق قبل الاعتماد</p></div></div>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#047857"}}>{notice}</p>}
  {!role&&!error&&<p>جاري تحميل المؤشر…</p>}
  {role&&<><section className="dg-metrics" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
   {[["المتطلبات",requirements.length],["التكليفات",assignments.filter(a=>a.status!=="unassigned").length],["بانتظار المراجعة",assignments.filter(a=>a.status==="submitted").length],["المعتمدة",assignments.filter(a=>a.status==="approved").length]].map(([name,value])=><div key={name} style={{background:"#f1f5f9",padding:16,borderRadius:12}}><small>{name}</small><h2>{value}</h2></div>)}
  </section>
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:20,marginTop:24}}>
   <div><label htmlFor="nudee-filter">البحث عن دليل أو معيار</label><input id="nudee-filter" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="بحث..." style={{display:"block",width:"100%",padding:10,margin:"8px 0"}}/>
   <div style={{maxHeight:560,overflow:"auto",display:"grid",gap:8}}>{visible.map(r=>{const a=assignments.find(x=>x.requirement_id===r.id);return <button type="button" key={r.id} onClick={()=>{setSelected(r.id);setAssignee(a?.assignee_id||"");setDue(a?.due_date||"");setNote(a?.review_notes||"");}} style={{textAlign:"right",padding:12,border:"1px solid #cbd5e1",borderRadius:9,background:selected===r.id?"#ccfbf1":"white",color:"#0f172a"}}><b>{r.standard_code||"تكليف #"+r.id}</b> — {r.evidence_name}<div><small>{r.maturity_level} · {statusLabels[a?.status||"unassigned"]}</small></div></button>})}</div></div>
   <div style={{border:"1px solid #cbd5e1",borderRadius:12,padding:20,alignSelf:"start"}}>{!current?<p>اختر دليلًا لعرض التفاصيل.</p>:<><h2>{current.evidence_name}</h2><p>{current.requirement_title}</p><p>{current.evidence_description}</p><p><b>المجال:</b> {current.domain_name} · <b>المستوى:</b> {current.maturity_level}</p><p><b>حالة التكليف:</b> {statusLabels[assignment?.status||"unassigned"]}</p>
   {role==="office"&&<><label htmlFor="nudee-assignee">المسؤول عن رفع الدليل</label><select id="nudee-assignee" value={assignee} onChange={e=>setAssignee(e.target.value)} style={{display:"block",width:"100%",padding:10,margin:"8px 0"}}><option value="">اختر المستخدم</option>{users.map(u=><option value={u.user_id} key={u.user_id}>{u.display_name||u.user_id}</option>)}</select><label htmlFor="nudee-due">تاريخ الاستحقاق</label><input id="nudee-due" type="date" value={due} onChange={e=>setDue(e.target.value)} style={{display:"block",padding:8,margin:"8px 0"}}/><button disabled={busy||!assignee||assignment?.status==="submitted"||assignment?.status==="approved"} onClick={assign}>حفظ التكليف</button></>}
   {role==="assignee"&&assignment&&<><label htmlFor="nudee-file">ملف الدليل (PDF أو Word أو صورة)</label><input id="nudee-file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)} disabled={busy||!["assigned","changes_requested"].includes(assignment.status)}/><button disabled={busy||!file||!["assigned","changes_requested"].includes(assignment.status)} onClick={upload}>رفع وإرسال للمراجعة</button></>}
   {assignment&&submissions.filter(x=>x.assignment_id===assignment.id).map(x=><div key={x.id} style={{margin:"8px 0"}}><button type="button" onClick={()=>openEvidence(x.storage_path)}>عرض الدليل: {x.file_name}</button></div>)}
   {role==="office"&&assignment?.status==="submitted"&&<div style={{marginTop:20}}><h3>قرار مسؤول المكتب</h3><textarea aria-label="ملاحظات المراجعة" value={note} onChange={e=>setNote(e.target.value)} placeholder="ملاحظات المراجعة" style={{width:"100%",minHeight:90}}/><div style={{display:"flex",gap:10}}><button disabled={busy} onClick={()=>review("approved")}>اعتماد الدليل</button><button disabled={busy||!note.trim()} onClick={()=>review("changes_requested")}>إعادة للتعديل</button></div></div>}
   {assignment?.review_notes&&<p><b>ملاحظات المكتب:</b> {assignment.review_notes}</p>}</>}</div>
  </section></>}
  <p style={{marginTop:24,fontSize:12,color:"#64748b"}}>البيانات تُقرأ من قاعدة CGP؛ لن تظهر المتطلبات حتى تُستورد من ملف نُضيء وتُطبّق الهجرة المعتمدة.</p>
 </main>;
}

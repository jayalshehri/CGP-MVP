"use client";
import { formatRiyadhDate, formatRiyadhDateTime } from "@/lib/dates";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import ControlAssessmentHistory from "@/components/ControlAssessmentHistory";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import ControlReviewPanel from "@/components/ControlReviewPanel";
import ControlStateStrip from "@/components/ControlStateStrip";
import { controlHeading, controlFrameworkLabel, controlFollowUp, followUpText, crosswalkTypeLabels } from "@/lib/control-presentation";
import { controlPlan } from "@/lib/control-plan";
import { evidenceReviewHref } from "@/lib/evidence-review";
import { positiveId } from "@/lib/audit-schedule";
import { catalogBackHref, catalogDetailHref } from "@/lib/control-catalog-return";
import { eccImplementationGuideUrl, eccOfficialControlsUrl, getEccStrategyExample } from "@/lib/ecc-strategy-example";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { frequencyLabels, cycleStage, cycleStageLabels } from "@/lib/grc";
import "./detail.css";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; official_text_ar:string|null; hierarchy_level:string; parent_control_id:number|null; applicability:string|null; source_page:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; audit_frequency:string; next_audit_date:string|null; frameworks:{code:string,name_ar:string,version:string,is_active:boolean,source_url:string|null}|null; };
type HierarchyPeer = { id:number; control_code:string; title_ar:string; official_text_ar:string|null; implementation_status:string };
const applicabilityLabel=(value:string|null|undefined)=>value==="CSP"?"مقدم الخدمة CSP":value==="CST"?"المشترك CST":null;
type Evidence = { link_id:number|null;source_control_id:number;version_number:number;valid_until:string|null;uploader_name:string|null;reviewer_display_name:string|null; is_current?:boolean; uploaded_at?:string|null; file_path?:string|null; review_notes?:string|null; reviewed_at?:string|null; id:number; evidence_name?:string|null; file_name?:string|null; description?:string|null; status?:string|null };
type AssessmentReflection = {source_framework:string;source_control_code:string;source_control_title:string;assessment_scope:string|null;compliance_status:string;notes:string|null;corrective_action:string|null;expected_compliance_date:string|null;updated_at:string|null};
type MappedControl = {control_id:number;framework_code:string;control_code:string;control_title:string;relationship_type:string;source_note:string|null};
type RequirementLink = {
 requirement_id:number; coverage_type:'full'|'partial'|'supporting'; mapping_confidence:'confirmed'|'probable';
 cybersecurity_requirements:{requirement_code:string;title_ar:string} | {requirement_code:string;title_ar:string}[] | null;
};
type ProjectRequirementLink = {
 requirement_id:number; project_id:number;
 cybersecurity_projects:{project_code:string;name_ar:string} | {project_code:string;name_ar:string}[] | null;
};
const tabs=['نظرة عامة','الأدلة','الارتباطات','السجل والمراجعات'];
const assessmentStatusText:Record<string,string>={implemented:'مطبق كليًا',partially_implemented:'مطبق جزئيًا',not_implemented:'غير مطبق',not_applicable:'لا ينطبق'};
const coverageText:Record<string,string>={full:'كاملة',partial:'جزئية',supporting:'داعمة'};
const mappingConfidenceText:Record<string,string>={confirmed:'مؤكد',probable:'محتمل'};
const single=<T,>(value:T|T[]|null):T|null=>Array.isArray(value)?value[0]??null:value;
function groupBy<T, K>(values: T[], key: (item:T)=>K) {
 const groups=new Map<K,T[]>();
 for(const item of values){const value=key(item);const group=groups.get(value);if(group)group.push(item);else groups.set(value,[item]);}
 return groups;
}
export default function ControlDetailsPage() {
 return <Suspense fallback={<main className="detail-page" role="status">جارٍ تحميل الضابط…</main>}><ControlDetailsRoute/></Suspense>;
}

function ControlDetailsRoute() {
 const {id}=useParams<{id:string}>();
 const params=useSearchParams();
 return <ControlDetailsContent key={`${id}:${params.get("auditRequest") ?? ''}:${params.get("auditCycle") ?? ''}`}/>;
}

function ControlDetailsContent() {
 const {id}=useParams<{id:string}>(); const router=useRouter();
 const params=useSearchParams();
 const fromCatalog=params.get("from")==="catalog";
 const auditRequestId=positiveId(params.get("auditRequest"));
 const auditCycleId=positiveId(params.get("auditCycle"));
 const [viewer,setViewer]=useState("");
 const [control,setControl]=useState<Control|null>(null),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[role,setRole]=useState<UserRole|null>(null);
 const [tab,setTab]=useState(()=>auditRequestId||auditCycleId||(typeof window!=="undefined"&&window.location.hash==="#control-review-cycle") ? 3 : 0);
 useEffect(()=>{
  const followHash=()=>{if(window.location.hash==="#control-review-cycle")setTab(3);};
  window.addEventListener("hashchange",followHash);
  return()=>window.removeEventListener("hashchange",followHash);
 },[]);

 const [reflections,setReflections]=useState<AssessmentReflection[]>([]);
 const [mappedControls,setMappedControls]=useState<MappedControl[]>([]);
 const [requirementLinks,setRequirementLinks]=useState<RequirementLink[]>([]);
 const [projectLinks,setProjectLinks]=useState<ProjectRequirementLink[]>([]);
 const [openCycleDue,setOpenCycleDue]=useState<string|null>(null);
 const [openCycleId,setOpenCycleId]=useState<number|null>(null);
 const [latestRequestStatus,setLatestRequestStatus]=useState<string|undefined>(undefined);
 const [reviewerName,setReviewerName]=useState<string|null>(null);
 const [parentControl,setParentControl]=useState<HierarchyPeer|null>(null);
 const [childControls,setChildControls]=useState<HierarchyPeer[]>([]);
 const [mappingRead,setMappingRead]=useState<'loading'|'ready'|'error'>('loading');
 const [activityVersion,setActivityVersion]=useState(0);
 useEffect(()=>{let active=true;(async()=>{try{
  const {user,profile}=await requireProfile();if(!active)return;setRole(profile.role);setViewer(user.id);
  const controlId=Number(id);if(!Number.isSafeInteger(controlId)||controlId<=0)throw new Error('رقم الضابط غير صحيح.');
  const [c,e,rc,cy]=await Promise.all([
   supabase.from('controls').select('*,frameworks(code,name_ar,version,is_active,source_url)').eq('id',controlId).single(),
   supabase.rpc('grc_evidence_register'),
   supabase.from('cybersecurity_requirement_controls').select('requirement_id,coverage_type,mapping_confidence,cybersecurity_requirements(requirement_code,title_ar)').eq('control_id',controlId).eq('mapping_status','active'),
   supabase.from('control_review_cycles').select('id,reviewer_id,due_date').eq('control_id',controlId).eq('status','open').limit(1)]);
  if(c.error||!c.data)throw new Error('الضابط غير موجود أو ليس ضمن صلاحيتك.');
  if(e.error)throw new Error('تعذر تحميل أدلة الضابط. أعد تحميل الصفحة.');
  if(active){
   setControl(c.data);
   const row=c.data as Control;
   if(row.parent_control_id){
    const p=await supabase.from('controls').select('id,control_code,title_ar,official_text_ar,implementation_status').eq('id',row.parent_control_id).single();
    if(active&&!p.error)setParentControl(p.data as HierarchyPeer);
   }else{
    const kids=await supabase.from('controls').select('id,control_code,title_ar,official_text_ar,implementation_status').eq('parent_control_id',controlId).order('control_code');
    if(active&&!kids.error)setChildControls((kids.data??[]) as HierarchyPeer[]);
   }
   setEvidence((e.data??[]).filter((row: {control_id:number})=>row.control_id===controlId));
   const links=(rc.data??[]) as unknown as RequirementLink[];
   setRequirementLinks(links);
   const requirementIds=links.map(l=>l.requirement_id);
   if(requirementIds.length){
    const pr=await supabase.from('cybersecurity_project_requirements').select('requirement_id,project_id,cybersecurity_projects(project_code,name_ar)').in('requirement_id',requirementIds);
    if(active&&!pr.error)setProjectLinks((pr.data??[]) as unknown as ProjectRequirementLink[]);
   }
   const cycle=(cy.data??[])[0] as {id:number;reviewer_id:string;due_date:string}|undefined;
   if(cycle){
    setOpenCycleId(cycle.id);setOpenCycleDue(cycle.due_date);
    const [rq,rv]=await Promise.all([
     supabase.from('evidence_requests').select('status').eq('cycle_id',cycle.id).order('id',{ascending:false}).limit(1),
     supabase.from('profiles').select('display_name').eq('user_id',cycle.reviewer_id).single()]);
    if(active){setLatestRequestStatus(!rq.error?(rq.data??[])[0]?.status:undefined);setReviewerName(!rv.error?rv.data?.display_name??null:null);}
   }else{setOpenCycleId(null);setOpenCycleDue(null);setLatestRequestStatus(undefined);setReviewerName(null);}
  }
 }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر التحميل');const {data}=await supabase.auth.getSession();if(!data.session)router.replace('/login');}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[id,router]);
 const archived=control?.frameworks?.is_active===false;
 const canReview=!archived&&(role==='admin'||role==='cybersecurity_team');
 const canUpload=!archived&&(canReview||role==='control_owner');
 useEffect(()=>{
  let active=true;
  if(!control||!canReview)return;
  void Promise.all([supabase.rpc('ecc_assessment_reflections',{p_ecc_control_id:control.id}),supabase.rpc('grc_control_mappings',{p_control_id:control.id})]).then(([reflectionResult,mappingResult])=>{
   if(!active)return;
   setReflections((reflectionResult.data??[]) as AssessmentReflection[]);
   setMappedControls((mappingResult.data??[]) as MappedControl[]);
   setMappingRead(mappingResult.error ? 'error' : 'ready');
  }).catch(()=>{if(active)setMappingRead('error');});
  return()=>{active=false;};
 },[control,canReview]);
 const backToControls=fromCatalog?catalogBackHref(viewer):"/controls";
 const relatedControlHref=(controlId:number)=>fromCatalog?catalogDetailHref(controlId):`/controls/${controlId}`;
 if(loading)return <main className="detail-page" role="status">جارٍ تحميل الضابط…</main>;
 if(error||!control)return <main className="detail-page"><p role="alert">{error}</p><Link href={backToControls}>العودة إلى الضوابط</Link></main>;
 const plan=controlPlan(control.control_code,control.description_ar||'',control.frameworks?.code);
 const strategyExample=control.frameworks?.code==='ECC'?getEccStrategyExample(control.control_code):undefined;
 const isEcc=control.frameworks?.code==='ECC';
 const isCcc=control.frameworks?.code==='CCC';
 const isCscc=control.frameworks?.code==='CSCC';
 const frameworkKey=control.frameworks?.code??'';
 const frameworkLabel=controlFrameworkLabel(frameworkKey,control.frameworks?.version);
 const title=controlHeading(frameworkKey,control.control_code,control.title_ar);
 const showsCsccNumberingNote=isCscc&&control.frameworks?.version==='2-2026'&&control.control_code==='2-9-1-3';
 const officialRequirement=control.official_text_ar||strategyExample?.requirement||(isCcc?control.title_ar:control.description_ar)||'لا يوجد وصف مسجل.';
 const officialSource=(archived||isCscc)&&control.frameworks?.source_url
  ? control.frameworks.source_url
  : isEcc ? eccOfficialControlsUrl : `https://nca.gov.sa/ar/regulatory-documents/controls-list/${(frameworkKey||'ECC').toLowerCase()}/`;
 const applicability=applicabilityLabel(control.applicability);
 const displayedEvidence=[...evidence].sort((a,b)=>(b.uploaded_at??'').localeCompare(a.uploaded_at??'')||b.id-a.id);
 const currentEvidence=displayedEvidence.filter(e=>e.is_current);
 const previousEvidence=displayedEvidence.filter(e=>!e.is_current);
 const latestEvidence=currentEvidence[0];
 const needsReview=currentEvidence.find(e=>['pending_review','under_review'].includes(e.status??''));
 const action=controlFollowUp({archived,implementation:control.implementation_status,evidence:control.evidence_status,verification:control.verification_status});
 const stage=cycleStage(!!openCycleId,latestRequestStatus);
 const mappingGroups=groupBy(
  [...mappedControls].sort((a,b)=>a.framework_code.localeCompare(b.framework_code)||a.control_code.localeCompare(b.control_code,'en',{numeric:true})),
  item=>item.framework_code,
 );
 const projectsByRequirement=groupBy(projectLinks.filter(p=>single(p.cybersecurity_projects)),item=>item.requirement_id);
 const scheduleHref=`/audit-schedule?control=${control.id}`;
 const evidenceHref=`/controls/${control.id}/evidence/new`;
 const periodicLabel=frequencyLabels[control.audit_frequency]??control.audit_frequency??'غير محدد';
 const goToTab=(index:number)=>{setTab(index);document.getElementById(`detail-tab-${index}`)?.focus();};
 const timeline=evidence.flatMap(e=>{
  const name=e.evidence_name||e.file_name||'دليل بدون اسم';
  const identity=`${e.id}-${e.link_id??'source'}`;
  return [
   ...(e.uploaded_at?[{key:`upload-${identity}`,time:e.uploaded_at,title:`رفع دليل · ${name}`,by:e.uploader_name,body:e.description}]:[]),
   ...(e.reviewed_at?[{key:`review-${identity}`,time:e.reviewed_at,title:`مراجعة الدليل · ${name}`,by:e.reviewer_display_name,body:e.review_notes}]:[])
  ];
 }).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));

 const nextAction=action==='evidence'&&canUpload
  ? <Link className="detail-button" href={evidenceHref}>رفع دليل</Link>
  : action==='evidence_review'&&canReview&&needsReview
   ? <Link className="detail-button" href={evidenceReviewHref(needsReview)}>مراجعة الدليل</Link>
   : action==='periodic'&&canReview&&!openCycleId
    ? <Link className="detail-button" href={scheduleHref}>فتح جدول التدقيق</Link>
    : action==='evidence'||action==='evidence_review'
     ? <button type="button" className="detail-button" onClick={()=>goToTab(1)}>عرض الأدلة</button>
     : <button type="button" className="detail-button" onClick={()=>goToTab(3)}>{openCycleId?'فتح دورة المراجعة':'فتح السجل'}</button>;

 const evidenceRow=(e:Evidence)=>{
  const name=e.evidence_name||e.file_name||'دليل بدون اسم';
  return <article className="detail-evidence-row" key={`${e.id}-${e.link_id??"source"}`}>
   <div className="detail-row-heading"><div><h3 dir="auto">{name}</h3>
    <div className="detail-evidence-meta"><span>إصدار <bdi>{e.version_number}</bdi></span>{e.link_id&&<span>دليل مشترك</span>}
     {e.uploaded_at&&<span>رُفع {formatRiyadhDateTime(e.uploaded_at)}</span>}
     {e.valid_until&&<span>الصلاحية حتى {formatRiyadhDate(e.valid_until)}</span>}
    </div>
   </div><StatusBadge status={e.status||''}/></div>
   <div className="detail-evidence-actions">
    <EvidenceDownload path={e.file_path} name={e.file_name}/>
    {canUpload&&e.is_current&&!e.link_id&&<Link className="detail-secondary" href={`${evidenceHref}?replace=${e.id}`}>رفع إصدار جديد</Link>}
    {canReview&&e.is_current&&['pending_review','under_review'].includes(e.status||'')&&<Link className="detail-button" href={evidenceReviewHref(e)}>مراجعة الدليل</Link>}
   </div>
   {(e.description||e.review_notes||e.uploader_name||e.reviewer_display_name||(e.file_name&&e.file_name!==name))&&<details className="detail-disclosure detail-evidence-disclosure">
    <summary>تفاصيل الدليل</summary>
    {e.file_name&&e.file_name!==name&&<p>الملف <bdi dir="auto">{e.file_name}</bdi></p>}
    {e.uploader_name&&<p>مقدّم الدليل <bdi>{e.uploader_name}</bdi></p>}
    {e.reviewer_display_name&&<p>المراجع <bdi>{e.reviewer_display_name}</bdi></p>}
    {e.description&&<p>{e.description}</p>}{e.review_notes&&<p>ملاحظات المراجع · {e.review_notes}</p>}
   </details>}
  </article>;
 };

 return <main className="detail-page detail-redesign" dir="rtl" aria-labelledby="detail-title">
  <nav className="detail-breadcrumb" aria-label="مسار الضوابط">
   <Link href={backToControls}>الضوابط</Link><span aria-hidden="true">‹</span><span>{control.domain_ar}</span>
   <span aria-hidden="true">‹</span><span aria-current="page">تفاصيل الضابط</span>
  </nav>
  {archived&&<p className="detail-archive" role="status"><strong>ضابط مؤرشف</strong> · متاح للرجوع التاريخي فقط.</p>}
  <header className="detail-hero">
   <div className="detail-heading-row">
    <div className="detail-identity">
     <div className="detail-tags"><bdi className="detail-code" dir="ltr">{control.control_code}</bdi>
      {frameworkLabel&&<bdi className="detail-framework-tag" dir="ltr">{frameworkLabel}</bdi>}
      <span className="detail-hierarchy-tag">{control.hierarchy_level==='sub_control'?'ضابط فرعي':'ضابط أساسي'}</span>
      {applicability&&<bdi className="catalog-applicability">{applicability}</bdi>}
     </div>
     <h1 id="detail-title">{title}</h1>
    </div>
    {canReview&&<details className="detail-actions-menu"><summary>إجراءات <span aria-hidden="true">⋯</span></summary>
     <div><Link href={`/controls/${control.id}/assign`}>{control.control_owner?"تغيير مالك الضابط":"تعيين مالك الضابط"}</Link></div>
    </details>}
   </div>
   <dl className="detail-meta">
    <div><dt>مالك الضابط</dt><dd><bdi>{control.control_owner||'غير معيّن'}</bdi></dd></div>
    <div><dt>استحقاق التطبيق</dt><dd>{formatRiyadhDate(control.due_date,'غير محدد')}</dd></div>
   </dl>
  </header>
  <ControlStateStrip implementation={control.implementation_status} evidence={control.evidence_status} verification={control.verification_status}/>
  <div className="detail-tabs" role="tablist" aria-label="تفاصيل الضابط">
   {tabs.map((label,index)=><button type="button" key={label} id={`detail-tab-${index}`} role="tab" aria-selected={tab===index} aria-controls={`detail-panel-${index}`} tabIndex={tab===index?0:-1}
    onClick={()=>setTab(index)} onKeyDown={event=>{
     let next=index;if(event.key==='ArrowLeft')next=(index+1)%tabs.length;
     else if(event.key==='ArrowRight')next=(index+tabs.length-1)%tabs.length;
     else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
     event.preventDefault();goToTab(next);
    }}>{label}{index===1&&currentEvidence.length>0&&<bdi className="detail-tab-count">{currentEvidence.length}</bdi>}</button>)}
  </div>
  {tabs.map((label,index)=>index!==tab&&<section key={label} id={`detail-panel-${index}`} role="tabpanel" aria-labelledby={`detail-tab-${index}`} hidden/>)}
  <section id={`detail-panel-${tab}`} role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className={`detail-columns${tab===0?' detail-with-aside':''}`}>
   <div className="detail-content">
    {tab===0&&<>
     <section className="detail-card detail-official-card">
      <h2>{archived?'النص الرسمي في الإصدار السابق':'النص الرسمي للضابط'}</h2>
      <p className="detail-official">{officialRequirement}</p>
      {showsCsccNumberingNote&&<p className="detail-hint">يظهر بند المعالجة الفورية للثغرات الحرجة في وثيقة 2026 بالرقم <bdi dir="ltr">2-1-9-3</bdi>. أُبقي رقم الضابط <bdi dir="ltr">2-9-1-3</bdi> في المنصة حفاظًا على الروابط إلى حين التحقق.</p>}
      {plan.requirements.length>0&&<details className="detail-disclosure"><summary>المتطلبات الفرعية المضمّنة</summary>{plan.requirements.map(r=><p className="detail-requirement" key={r.key}><bdi dir="ltr">{r.key}</bdi> {r.text}</p>)}</details>}
      <div className="detail-source"><a href={officialSource} target="_blank" rel="noreferrer">{archived?'وثيقة الإصدار السابق':'وثيقة الهيئة'} {frameworkLabel&&<>· <bdi dir="ltr">{frameworkLabel}</bdi></>}</a>
       {control.source_page&&<span>صفحة <bdi dir="ltr">{control.source_page}</bdi></span>}
       {isEcc&&<a href={eccImplementationGuideUrl} target="_blank" rel="noreferrer">الدليل الإرشادي</a>}
      </div>
     </section>
     {['CSCC','DCC','TCC','OSMACC'].includes(frameworkKey)&&<ControlAssessmentHistory controlId={control.id} framework={frameworkKey}/>}
    </>}

    {tab===1&&<>
     <section className="detail-card">
      <div className="detail-row-heading"><div><h2>الأدلة الحالية</h2></div>{canUpload&&<Link className="detail-button" href={evidenceHref}>رفع دليل</Link>}</div>
      {currentEvidence.length?currentEvidence.map(evidenceRow):<p className="detail-empty">لا توجد أدلة حالية ضمن صلاحياتك.</p>}
     </section>
     {previousEvidence.length>0&&<details className="detail-card detail-disclosure"><summary>الإصدارات السابقة <bdi>{previousEvidence.length}</bdi></summary>{previousEvidence.map(evidenceRow)}</details>}
    </>}

    {tab===2&&<>
     {(parentControl||childControls.length>0)&&<section className="detail-card"><h2>تسلسل الضابط</h2>
      {parentControl&&<p>الضابط الأعلى · <Link className="detail-inline-link" href={relatedControlHref(parentControl.id)}><bdi dir="ltr">{parentControl.control_code}</bdi> {controlHeading(frameworkKey,parentControl.control_code,parentControl.title_ar)}</Link></p>}
      {childControls.length>0&&<ul className="detail-children-list">{childControls.map(k=><li key={k.id}><Link href={relatedControlHref(k.id)}>
       <bdi dir="ltr">{k.control_code}</bdi><span>{controlHeading(frameworkKey,k.control_code,k.title_ar)}</span><StatusBadge status={k.implementation_status}/>
      </Link></li>)}</ul>}
     </section>}
     <section className="detail-card">
      <div className="detail-row-heading"><h2>المواءمات مع الأطر {canReview&&mappingRead==='ready'&&mappedControls.length>0&&<bdi className="detail-tab-count">{mappedControls.length}</bdi>}</h2>
       {canReview&&<Link className="detail-secondary" href={`/mappings?control=${control.id}`}>خريطة المواءمة</Link>}</div>
      {!canReview?<p className="detail-empty">تعرض المواءمات التفصيلية لفريق الامتثال ومدير النظام.</p>
       :mappingRead==='loading'?<p role="status" className="detail-empty">جارٍ تحميل المواءمات…</p>
       :mappingRead==='error'?<p role="alert" className="detail-empty">تعذّر تحميل المواءمات. أعد تحميل الصفحة للمحاولة.</p>
       :!mappedControls.length?<p className="detail-empty">لا توجد مواءمات معتمدة لهذا الضابط.</p>
       :<>
        <p className="detail-hint">المواءمة توضح العلاقة بين المتطلبات. لا تنقل نتيجة الالتزام أو اعتماد الدليل.</p>
        {[...mappingGroups].map(([framework,items])=><section className="detail-mapping-group" key={framework} aria-label={`مواءمات ${framework}`}>
         <h3><bdi dir="ltr">{framework}</bdi> <bdi className="detail-tab-count">{items.length}</bdi></h3>
         <ul className="detail-relationship-list">{items.map((item,index)=>{
          const matched=reflections.filter(result=>result.source_framework===item.framework_code&&result.source_control_code===item.control_code);
          return <li key={`${item.control_id}:${index}`} className="detail-relation-row">
           <div className="detail-rel-line"><Link className="detail-inline-link" href={relatedControlHref(item.control_id)}><bdi dir="ltr">{item.control_code}</bdi> · {controlHeading(item.framework_code,item.control_code,item.control_title)}</Link>
            <span className="detail-relation-kind">{crosswalkTypeLabels[item.relationship_type]??'نوع العلاقة غير موضح'}</span></div>
           {(item.source_note||matched.length>0)&&<details className="detail-disclosure"><summary>تفاصيل المواءمة</summary>
            {item.source_note&&<p>{item.source_note}</p>}
            {matched.length>0&&<ul className="detail-relation-outcomes">{matched.map((result,i)=><li key={i}>{result.assessment_scope||'نطاق غير مسمى'} · {assessmentStatusText[result.compliance_status]||'لم يُقيّم'}</li>)}</ul>}
           </details>}
          </li>;
         })}</ul>
        </section>)}
       </>}
     </section>
     <section className="detail-card"><h2>المتطلبات والمشاريع المرتبطة {requirementLinks.length>0&&<bdi className="detail-tab-count">{requirementLinks.length}</bdi>}</h2>
      {!requirementLinks.length?<p className="detail-empty">لا توجد متطلبات مرتبطة ضمن صلاحياتك.</p>:
       <ul className="detail-relationship-list">{requirementLinks.map(link=>{
        const requirement=single(link.cybersecurity_requirements);
        const projects=projectsByRequirement.get(link.requirement_id)??[];
        return <li className="detail-relation-row" key={link.requirement_id}>
         <div className="detail-rel-line"><strong>{requirement?<><bdi dir="ltr">{requirement.requirement_code}</bdi> · {requirement.title_ar}</>:'متطلب غير ظاهر ضمن صلاحياتك'}</strong>
          <div className="detail-relation-badges"><span className={`coverage-pill ${link.coverage_type}`}>تغطية {coverageText[link.coverage_type]}</span>
           <span className={`mapping-pill ${link.mapping_confidence}`}>ربط {mappingConfidenceText[link.mapping_confidence]}</span></div></div>
         {projects.length>0?<div className="detail-project-links"><span className="detail-hint">المشاريع</span>
          {projects.map(item=>{const project=single(item.cybersecurity_projects);return project&&<Link key={item.project_id} href={`/roadmap/${item.project_id}`}><bdi dir="ltr">{project.project_code}</bdi> · {project.name_ar}</Link>;})}
         </div>:<p className="detail-hint">لا يوجد مشروع ظاهر ضمن صلاحياتك.</p>}
        </li>;
       })}</ul>}
     </section>
    </>}

    {tab===3&&<>
     <ControlReviewPanel controlId={control.id} canManage={canReview} canSubmit={canUpload} readOnly={archived}
      targetRequestId={auditRequestId} targetCycleId={auditCycleId} reviewerName={reviewerName}
      nextReview={control.next_audit_date} lastReview={control.last_review_date} frequency={control.audit_frequency} onEvidence={()=>goToTab(1)} onCycleChange={()=>setActivityVersion(value=>value+1)}/>
     <GrcAuditTrail key={`${control.id}:${activityVersion}`} compact reliableRead controlId={control.id} legacyEntries={timeline}
      globalLink={role==="admin"||role==="cybersecurity_team"}/>
    </>}
   </div>

   {tab===0&&<aside className="detail-aside">
    <section className="detail-card detail-next-card"><h2>{action==='periodic'?'المراجعة الدورية':'المتابعة القادمة'}</h2>
     {action==='periodic'?<p>{periodicLabel} · {formatRiyadhDate(control.next_audit_date,'المراجعة القادمة غير مجدولة')}</p>:<p>{followUpText[action]}</p>}
     {!archived&&openCycleId&&<p className="detail-hint">دورة مفتوحة · {cycleStageLabels[stage]}{openCycleDue&&<> · حتى {formatRiyadhDate(openCycleDue)}</>}</p>}
     <div className="detail-next-action">{nextAction}</div>
    </section>
    <section className="detail-card">
     <div className="detail-row-heading"><h2>آخر دليل حالي</h2>{latestEvidence&&<StatusBadge status={latestEvidence.status||''}/>}</div>
     {latestEvidence?<><p className="detail-latest-title" dir="auto">{latestEvidence.evidence_name||latestEvidence.file_name||'دليل بدون اسم'}</p>
      <p className="detail-hint">إصدار {latestEvidence.version_number}{latestEvidence.uploaded_at&&<> · {formatRiyadhDate(latestEvidence.uploaded_at)}</>}</p>
      <button type="button" className="detail-text-button" onClick={()=>goToTab(1)}>عرض الأدلة</button></>:<p className="detail-empty">لا يوجد دليل حالي معروض.</p>}
    </section>
   </aside>}
  </section>
 </main>;
}

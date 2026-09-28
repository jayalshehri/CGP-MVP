"use client";
import { myControlsReturn } from '@/lib/my-controls-context';
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import StatusBadge from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import { Control360Activity, Control360Assessments, Control360Findings } from "@/components/Control360Sections";
import { controlTabs, controlContext, controlHref, controlRegisterHref, controlNextAction, type ControlTab, type ControlAuditEvent } from "@/lib/control360";
import { loadControlAssessments, loadControlFindings, loadControlActivity, loadControlEvidenceRegister, type ControlAssessment, type ControlFinding, type ControlAction } from "@/lib/control360-read";
import { loadEligibleFrameworkEvidence, type EligibleFrameworkEvidence } from "@/lib/framework-evidence";
import { assessmentLabels } from "@/lib/assessment";
import { assessmentContext, assessmentItemHref } from "@/lib/assessment-journey";
import ControlReviewPanel from "@/components/ControlReviewPanel";
import { controlPlan } from "@/lib/control-plan";
import { eccImplementationGuideUrl } from "@/lib/ecc-strategy-example";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { frequencyLabels, formatComplianceDate, formatComplianceDateTime, scheduleState, scheduleStateLabels, cycleStage, cycleStageLabels } from "@/lib/grc";
import "./detail.css";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; official_text_ar:string|null; hierarchy_level:string; parent_control_id:number|null; applicability:string|null; source_page:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; implementation_notes:string|null;control_owner_id:string|null;due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; audit_frequency:string; next_audit_date:string|null; frameworks:{code:string,name_ar:string,version:string,is_active:boolean,source_url:string|null}|null; };
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

const date=(value:string)=>formatComplianceDateTime(value);

const assessmentStatusText:Record<string,string>={implemented:'مطبق كليًا',partially_implemented:'مطبق جزئيًا',not_implemented:'غير مطبق',not_applicable:'لا ينطبق'};
const coverageText:Record<string,string>={full:'كاملة',partial:'جزئية',supporting:'داعمة'};
const mappingConfidenceText:Record<string,string>={confirmed:'مؤكد',probable:'محتمل'};
const single=<T,>(value:T|T[]|null):T|null=>Array.isArray(value)?value[0]??null:value;
// title_ar is stored as "{subdomain label} - {control_code}" (a list-display
// convention, not a header title) -- stripping the trailing code here both
// recovers the subdomain label for the breadcrumb and avoids ever rendering
// a bare digit/hyphen code sequence inside RTL prose, which the browser's
// BiDi algorithm can visually reorder.
const cleanTitle=(value:string)=>value.replace(/\s*[-–]\s*[\d-]+\s*$/,"").trim();

export default function ControlDetailsPage() {
 return <Suspense fallback={<main className="detail-page" role="status">جاري تحميل الضابط…</main>}><ControlDetailsRoute/></Suspense>;
}

function ControlDetailsRoute(){const {id}=useParams<{id:string}>();return <ControlDetailsContent key={id} id={id}/>;}

function ControlDetailsContent({id}:{id:string}) {
 const router=useRouter();
 const searchParams=useSearchParams();
 const [control,setControl]=useState<Control|null>(null),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[role,setRole]=useState<UserRole|null>(null);
 const tab:ControlTab=controlTabs.find(item=>item.key===searchParams.get('tab'))?.key??'overview';
 const setTab=(next:ControlTab)=>{const query=new URLSearchParams(searchParams.toString());query.set('tab',next);router.push('/controls/'+id+'?'+query,{scroll:false});};
 const [actor,setActor]=useState('');
 const [eligible,setEligible]=useState<EligibleFrameworkEvidence[]>([]);
 const [assessments,setAssessments]=useState<ControlAssessment[]>([]);
 const [findings,setFindings]=useState<ControlFinding[]>([]),[actions,setActions]=useState<ControlAction[]>([]);
 const [activity,setActivity]=useState<ControlAuditEvent[]>([]);
 const [issues,setIssues]=useState<Record<string,string>>({});
 const [reviewExpanded,setReviewExpanded]=useState(false);


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
 useEffect(()=>{let active=true;(async()=>{try{
  const {user,profile}=await requireProfile(['admin','cybersecurity_team','control_owner','nca_external_auditor']);if(!active)return;setRole(profile.role);setActor(user.id);
  const controlId=Number(id);if(!Number.isSafeInteger(controlId)||controlId<=0)throw new Error('رقم الضابط غير صحيح.');
  const read=async<T,>(fn:()=>Promise<T>)=>{try{return {data:await fn(),error:''};}catch{return {data:null,error:'تعذر تحميل هذا القسم. أعد تحميل الصفحة.'};}};
  const [c,e,rc,cy,a,f,events]=await Promise.all([
   supabase.from('controls').select('*,frameworks(code,name_ar,version,is_active,source_url)').eq('id',controlId).single(),
   read(()=>loadControlEvidenceRegister(controlId)),
   supabase.from('cybersecurity_requirement_controls').select('requirement_id,coverage_type,mapping_confidence,cybersecurity_requirements(requirement_code,title_ar)').eq('control_id',controlId).eq('mapping_status','active'),
   supabase.from('control_review_cycles').select('id,reviewer_id,due_date').eq('control_id',controlId).eq('status','open').limit(1),read(()=>loadControlAssessments(controlId)),read(()=>loadControlFindings(controlId)),read(()=>loadControlActivity(controlId))]);
  if(c.error||!c.data)throw new Error('الضابط غير موجود أو ليس ضمن صلاحيتك.');

  if(active){
   const row={...c.data,frameworks:single(c.data.frameworks)} as Control;
   if(!row.frameworks)throw new Error('تعذر تحديد إطار الضابط ضمن صلاحياتك.');
   setControl(row);
   setAssessments(a.data??[]);setFindings(f.data?.findings??[]);setActions(f.data?.actions??[]);setActivity(events.data??[]);
   const links=(rc.data??[]) as unknown as RequirementLink[];
   const cycle=(cy.data??[])[0] as {id:number;reviewer_id:string;due_date:string}|undefined;
   const [eligibility,hierarchy,pr,rq,rv]=await Promise.all([
    row.frameworks?.is_active?read(()=>loadEligibleFrameworkEvidence(row.frameworks!.code,controlId)):Promise.resolve({data:[],error:''}),
    row.parent_control_id?supabase.from('controls').select('id,control_code,title_ar,official_text_ar,implementation_status').eq('id',row.parent_control_id):supabase.from('controls').select('id,control_code,title_ar,official_text_ar,implementation_status').eq('parent_control_id',controlId).order('control_code'),
    links.length?supabase.from('cybersecurity_project_requirements').select('requirement_id,project_id,cybersecurity_projects(project_code,name_ar)').in('requirement_id',links.map(l=>l.requirement_id)):Promise.resolve({data:[],error:null}),
    cycle?supabase.from('evidence_requests').select('status').eq('cycle_id',cycle.id).order('id',{ascending:false}).limit(1):Promise.resolve({data:[],error:null}),
    cycle&&['admin','cybersecurity_team'].includes(profile.role)?supabase.from('profiles').select('display_name').eq('user_id',cycle.reviewer_id).maybeSingle():Promise.resolve({data:null,error:null})
   ]);
   if(!active)return;
   setEligible(eligibility.data??[]);setEvidence((e.data??[]) as Evidence[]);
   setIssues({evidence:e.error||eligibility.error?'تعذر تحميل أدلة الضابط.':'',assessment:a.error,findings:f.error,activity:events.error,requirements:rc.error||pr.error?'تعذر تحميل العلاقات.':'',review:cy.error||rq.error?'تعذر تحميل حالة المراجعة.':'',hierarchy:hierarchy.error?'تعذر تحميل التسلسل الهرمي.':''});
   if(row.parent_control_id)setParentControl((hierarchy.data??[])[0] as HierarchyPeer??null);
   else setChildControls((hierarchy.data??[]) as HierarchyPeer[]);
   setRequirementLinks(links);setProjectLinks((pr.data??[]) as unknown as ProjectRequirementLink[]);
   setOpenCycleId(cycle?.id??null);setOpenCycleDue(cycle?.due_date??null);setLatestRequestStatus((rq.data??[])[0]?.status);setReviewerName(rv.data?.display_name??null);
  }
 }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر التحميل');const {data}=await supabase.auth.getSession();if(!data.session)router.replace('/login');}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[id,router]);
 const archived=control?.frameworks?.is_active===false;
 const canViewAudit=role==='admin'||role==='cybersecurity_team';
 const canReview=!archived&&canViewAudit;
 const canUpload=!archived&&(canReview||(role==='control_owner'&&control?.control_owner_id===actor));
 useEffect(()=>{let active=true;if(!control||!canReview)return()=>{active=false;};void Promise.all([supabase.rpc('ecc_assessment_reflections',{p_ecc_control_id:control.id}),supabase.rpc('grc_control_mappings',{p_control_id:control.id})]).then(([reflectionResult,mappingResult])=>{if(active){setReflections((reflectionResult.data??[]) as AssessmentReflection[]);setMappedControls((mappingResult.data??[]) as MappedControl[]);setIssues(prev=>({...prev,mappings:reflectionResult.error||mappingResult.error?'تعذر تحميل المواءمات.':''}));}});return()=>{active=false;};},[control,canReview]);
 if(loading)return <main className="detail-page" role="status">جاري تحميل الضابط…</main>;
 if(error||!control)return <main className="detail-page"><p role="alert">{error}</p><Link href="/controls">العودة إلى الضوابط</Link></main>;
 const plan=controlPlan(control.control_code,control.description_ar||'',control.frameworks?.code);
 const isEcc=control.frameworks?.code==='ECC';

 const officialRequirement=control.official_text_ar;
 const applicability=applicabilityLabel(control.applicability);
 const frameworkCode=(control.frameworks?.code||'').toLowerCase();
 const returnParams=new URLSearchParams();
 const domain=searchParams.get('domain');if(domain)returnParams.set('domain',domain);
 const view=searchParams.get('view');if(view==='followup')returnParams.set('view',view);
 const scope=searchParams.get('scope');if(scope==='provider'||scope==='tenant')returnParams.set('scope',scope);
 const status=searchParams.get('status');if(status&&['implemented','in_progress','not_started','not_applicable'].includes(status))returnParams.set('status',status);
 const assignment=searchParams.get('assignment');if(assignment==='assigned'||assignment==='unassigned')returnParams.set('assignment',assignment);
 const query=searchParams.get('q');if(query)returnParams.set('q',query);
 const fromWorkspace=searchParams.get('from')==='workspace';
 const assessmentReturn=assessmentContext(searchParams.get('assessment_context')??'');
 const assessmentBack=searchParams.get('from')==='assessment'&&assessmentReturn.has('cycle')&&assessmentReturn.has('item')?assessmentItemHref(frameworkCode.toUpperCase(),Number(assessmentReturn.get('cycle')),Number(assessmentReturn.get('item')),assessmentReturn.toString()):null;
 const personalBack=myControlsReturn(new URLSearchParams(searchParams.toString()));
 const backHref=personalBack??assessmentBack??(fromWorkspace?`/compliance/${frameworkCode.toUpperCase()}?tab=controls${returnParams.size?`&${returnParams.toString()}`:''}`:`/controls?framework=${frameworkCode.toUpperCase()}${returnParams.size?`&${returnParams.toString()}`:''}`);
 const context=controlContext(new URLSearchParams(searchParams.toString())).toString();
 const evidenceHref=controlRegisterHref('evidence',frameworkCode.toUpperCase(),control.id,context);
 const findingsHref=controlRegisterHref('findings',frameworkCode.toUpperCase(),control.id,context);
 const nextAction=controlNextAction(canUpload||canReview?role:null,archived,!!(control.control_owner_id||control.control_owner?.trim()),control.evidence_status,issues.evidence?null:eligible.length);
 const latest=assessments[0];
 return <main className="detail-page control360-page" dir="rtl">
  <Link className="detail-back" href={backHref}>{personalBack?'العودة إلى ضوابطي':assessmentBack?'العودة إلى بند التقييم':`العودة إلى ضوابط ${frameworkCode.toUpperCase()}`} ←</Link>
  <nav className="detail-breadcrumb" aria-label="مسار الضابط"><Link href="/compliance">مركز الامتثال</Link><span aria-hidden="true">←</span><Link href={'/compliance/'+frameworkCode.toUpperCase()}>{frameworkCode.toUpperCase()}</Link><span aria-hidden="true">←</span><Link href={backHref}>{personalBack?"ضوابطي":"الضوابط"}</Link><span aria-hidden="true">←</span><span aria-current="page" dir="ltr">{control.control_code}</span></nav>
  {archived&&<section className="detail-card" role="status"><h2>ضابط مؤرشف</h2><p>ينتمي إلى إصدار تنظيمي سابق، ومحفوظ للتتبع التاريخي فقط. لا يسمح بأي نشاط تشغيلي جديد.</p></section>}
  <header className="detail-hero"><div><span className="detail-code" dir="ltr">{control.control_code}</span><span className="detail-framework-tag" dir="ltr">{control.frameworks?.code} {control.frameworks?.version}</span><span className="detail-hierarchy-tag">{control.hierarchy_level==='sub_control'?'ضابط فرعي':'ضابط أساسي'}</span>{applicability&&<span className="catalog-applicability">{applicability}</span>}<h1>{cleanTitle(control.title_ar)||control.control_code}</h1><p>{control.frameworks?.name_ar} · {control.domain_ar}</p><div className="control360-owner"><span>المالك: <strong>{control.control_owner||(control.control_owner_id?'اسم المالك غير مسجل':'غير معيّن')}</strong></span>{control.due_date&&<span>الاستحقاق: {formatComplianceDate(control.due_date)}</span>}</div></div><div className="detail-hero-actions"><StatusBadge status={control.implementation_status}/>{canReview&&nextAction!=='assign'&&<Link className="detail-assign-owner" href={'/controls/'+control.id+'/assign'}>تغيير المالك ←</Link>}</div></header>
  {nextAction&&<section className="detail-next"><div><span>الإجراء التالي</span><strong>{nextAction==='assign'?'تعيين مسؤول للضابط':'رفع دليل للضابط'}</strong></div><Link className="detail-button" href={'/controls/'+control.id+'/'+(nextAction==='assign'?'assign':'evidence/new')+'?'+context}>{nextAction==='assign'?'تعيين المالك':'رفع دليل'} ←</Link></section>}
  <div className="detail-tabs" role="tablist" aria-label="مساحة الضابط">{controlTabs.map((item,index)=><button key={item.key} id={'detail-tab-'+item.key} role="tab" aria-selected={tab===item.key} aria-controls={'detail-panel-'+item.key} tabIndex={tab===item.key?0:-1} onClick={()=>setTab(item.key)} onKeyDown={event=>{let next=index;if(event.key==='ArrowLeft')next=(index+1)%controlTabs.length;else if(event.key==='ArrowRight')next=(index+controlTabs.length-1)%controlTabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=controlTabs.length-1;else return;event.preventDefault();setTab(controlTabs[next].key);document.getElementById('detail-tab-'+controlTabs[next].key)?.focus();}}>{item.label}</button>)}</div>
  <section id={'detail-panel-'+tab} role="tabpanel" aria-labelledby={'detail-tab-'+tab} className="control360-panel">
   {tab==='overview'&&<>
    <section className="detail-card"><h2>ملخص العمل على الضابط</h2><div className="control360-summary">
     <div><small>حالة التطبيق</small><StatusBadge status={control.implementation_status}/></div><div><small>حالة التحقق</small><StatusBadge status={control.verification_status}/></div>
     <div><small>المالك</small><strong>{control.control_owner||(control.control_owner_id?'اسم المالك غير مسجل':'غير معيّن')}</strong></div>
     <div><small>الأدلة</small>{issues.evidence?<span role="alert">تعذر التحميل</span>:eligible.length?<button className="control360-text-action" onClick={()=>setTab('evidence')}>{eligible.length} إصدارًا مؤهلًا ضمن صلاحياتك ←</button>:<span>لا يوجد دليل مؤهل ضمن صلاحياتك</span>}</div>
     {issues.assessment?<div role="alert">تعذر تحميل التقييمات.</div>:latest&&<div><small>أحدث بند تقييم — {latest.cycle?.scope_name??'النطاق غير متاح'}</small><strong>{assessmentLabels[latest.compliance_status??'']??'لم يُقيّم'}</strong>{latest.cycle&&!['approved','closed'].includes(latest.cycle.status)&&<small>نتيجة غير معتمدة</small>}<button className="control360-text-action" onClick={()=>setTab('assessment')}>عرض الدورات والنطاقات ←</button></div>}
     {issues.findings?<div role="alert">تعذر تحميل الملاحظات.</div>:findings.length>0&&<div><small>ملاحظات غير مغلقة ضمن صلاحياتك</small><button className="control360-text-action" onClick={()=>setTab('findings')}>{findings.filter(f=>f.status!=='closed').length} من {findings.length} ←</button></div>}
    </div>{!latest&&!findings.length&&!issues.assessment&&!issues.findings&&<p className="detail-hint">لا توجد بنود تقييم أو ملاحظات مرتبطة متاحة ضمن صلاحياتك حاليًا.</p>}{control.implementation_notes&&<details><summary>ملاحظات التطبيق</summary><p className="control360-prewrap">{control.implementation_notes}</p></details>}</section>
    <section className="detail-card"><h2>المراجعة الدورية للضابط</h2>{issues.review?<p role="alert">{issues.review}</p>:<div className="detail-schedule-strip"><div><small>التكرار</small><strong>{frequencyLabels[control.audit_frequency]??control.audit_frequency}</strong></div><div><small>آخر مراجعة</small><strong>{formatComplianceDate(control.last_review_date)}</strong></div><div><small>المراجعة القادمة</small><strong>{formatComplianceDate(control.next_audit_date)}</strong><span>{scheduleStateLabels[scheduleState(control.next_audit_date)]}</span></div><div><small>الدورة الحالية</small><strong>{cycleStageLabels[cycleStage(!!openCycleId,latestRequestStatus)]}</strong>{openCycleDue&&<small>الاستحقاق: {formatComplianceDate(openCycleDue)}</small>}{reviewerName&&<small>المراجع: {reviewerName}</small>}</div></div>}<p className="detail-hint">مراجعة تشغيلية دورية مستقلة عن دورة تقييم الإطار.</p><details onToggle={event=>setReviewExpanded(event.currentTarget.open)}><summary>{archived?'تاريخ المراجعة الدورية':'تفاصيل المراجعة والطلبات'}</summary>{reviewExpanded&&<ControlReviewPanel controlId={control.id} canManage={canReview} canSubmit={canUpload} returnContext={context}/>}</details>{canReview&&<Link className="control360-text-action" href={'/audit-schedule?control='+control.id}>فتح جدول المراجعة الدورية ←</Link>}</section>
       <details className="detail-card requirements-projects-card"><summary>المتطلبات والمشاريع المرتبطة</summary>

    <p className="detail-hint">علاقة للقراءة فقط، مصدرها ربط المتطلبات السيبرانية الحالي — لا منطق ربط جديد ولا تكرار للبيانات.</p>
    {issues.requirements?<p role="alert">{issues.requirements}</p>:!requirementLinks.length?<p>لا يدعم هذا الضابط أي متطلب سيبراني مسجل حاليًا.</p>:
    <div className="req-proj-table-wrap"><table className="req-proj-table"><thead><tr><th>المتطلب</th><th>التغطية</th><th>جودة الربط</th><th>رمز المشروع</th><th>المشروع</th></tr></thead><tbody>
     {requirementLinks.map(link=>{
      const requirement=single(link.cybersecurity_requirements);
      const projectLink=projectLinks.find(p=>p.requirement_id===link.requirement_id);
      const project=projectLink?single(projectLink.cybersecurity_projects):null;
      return <tr key={link.requirement_id}>
       <td>{requirement?.title_ar??'—'}{requirement?.requirement_code&&<details className="req-internal-id"><summary>تفاصيل إضافية</summary><span>المعرّف الداخلي: <b dir="ltr">{requirement.requirement_code}</b></span></details>}</td>
       <td><span className={`coverage-pill ${link.coverage_type}`}>{coverageText[link.coverage_type]??link.coverage_type}</span></td>
       <td><span className={`mapping-pill ${link.mapping_confidence}`}>{mappingConfidenceText[link.mapping_confidence]??link.mapping_confidence}</span></td>
       <td dir="ltr">{project?.project_code??'—'}</td>
       <td>{project?<Link href={`/roadmap/${projectLink!.project_id}`}>{project.name_ar}</Link>:'غير مرتبط بمشروع'}</td>
      </tr>;
     })}
    </tbody></table></div>}
   </details>

    <details className="detail-card"><summary>المواءمات والضوابط المرتبطة</summary><p className="detail-hint">هذه علاقات مواءمة راجعها واعتمدها الفريق؛ نوع العلاقة وحدود تغطيتها موثقان في خريطة المواءمة. يمكن رفع الدليل مرة واحدة ثم اختياره للضوابط المرتبطة؛ ويظل قرار القبول مستقلًا لكل ضابط.</p>{!canReview?<p>تظهر المواءمات التفصيلية لمدير الامتثال والمراجعة ومدير النظام.</p>:issues.mappings?<p role="alert">{issues.mappings}</p>:!mappedControls.length?<p>لا توجد علاقات مواءمة معتمدة لهذا الضابط.</p>:<div className="detail-timeline">{mappedControls.map(item=>{const matchedReflections=reflections.filter(result=>result.source_framework===item.framework_code&&result.source_control_code===item.control_code);return <article key={item.control_id}><strong><span dir="ltr">{item.framework_code} · {item.control_code}</span> — {item.control_title}</strong><small>{matchedReflections.length?matchedReflections.map(result=>`${result.assessment_scope}: ${assessmentStatusText[result.compliance_status]||'لم يُقيّم'}`).join(' | '):'لا توجد نتيجة معتمدة ضمن علاقة موثقة'}</small><p>{item.source_note||'راجع مصدر العلاقة وحدودها في خريطة المواءمة.'}</p><Link className="detail-back" href={`/controls/${item.control_id}`}>فتح الضابط المرتبط ←</Link></article>})}</div>}{canReview&&<p style={{marginTop:18}}><Link className="detail-button" href="/mappings">فتح خريطة المواءمة ←</Link></p>}</details>
   </>}
   {tab==='official'&&<>
    <section className="detail-card"><h2>{archived?'النص الرسمي في الإصدار السابق':'النص الرسمي'}</h2>{officialRequirement?<p className="detail-official">{officialRequirement}</p>:<div className="control360-empty">لا يوجد نص رسمي موثق في الحقل المخصص لهذا الضابط.</div>}<p className="detail-hint">{control.frameworks?.name_ar} · <span dir="ltr">{control.frameworks?.code} {control.frameworks?.version}</span>{control.source_page&&' · الصفحة '+control.source_page}</p>{control.frameworks?.source_url&&<a href={control.frameworks.source_url} target="_blank" rel="noreferrer">فتح الوثيقة المرجعية المحفوظة ↗</a>}</section>
    {control.description_ar&&control.description_ar!==officialRequirement&&<details className="detail-card"><summary>وصف / إرشاد داخلي</summary><p className="detail-hint">ليس بديلًا عن النص الرسمي ولا معيار تقييم مستقلًا.</p><p className="control360-prewrap">{control.description_ar}</p></details>}
    {issues.hierarchy&&<p role="alert">{issues.hierarchy}</p>}{parentControl&&<section className="detail-card"><h2>الضابط الأساسي</h2><Link href={controlHref(parentControl.id,context,'official')}><span dir="ltr">{parentControl.control_code}</span> — {cleanTitle(parentControl.title_ar)}</Link>{parentControl.official_text_ar&&<p className="control360-prewrap">{parentControl.official_text_ar}</p>}</section>}
       {childControls.length>0&&<section className="detail-card"><h2>الضوابط الفرعية ({childControls.length})</h2><p className="detail-hint">الضوابط الفرعية المرتبطة بهذا الضابط وفق الفهرس التنظيمي المحفوظ.</p><ul className="detail-children-list">{childControls.map(k=><li key={k.id}><Link href={controlHref(k.id,context,"official")}><span dir="ltr">{k.control_code}</span> <span>{k.official_text_ar||k.title_ar}</span><StatusBadge status={k.implementation_status}/></Link></li>)}</ul></section>}

    {isEcc&&<details className="detail-card"><summary>دليل التطبيق الإرشادي</summary><p>مرجع للاستئناس؛ يبقى نص الإصدار الحالي هو المتطلب الملزم.</p><a href={eccImplementationGuideUrl} target="_blank" rel="noreferrer">فتح الدليل الإرشادي ↗</a></details>}
   </>}
   {tab==='evidence'&&<>
    <section className="detail-card"><div className="control360-section-heading"><h2>الأدلة المؤهلة لهذا الضابط</h2><Link href={evidenceHref}>فتح في مستودع الأدلة ←</Link></div><p className="detail-hint">الإصدارات الحالية المؤهلة ضمن صلاحياتك؛ الدليل المشترك متاح عبر مواءمة معتمدة.</p>{issues.evidence?<p role="alert">{issues.evidence}</p>:!eligible.length?<div className="control360-empty">{archived?'الضابط مؤرشف؛ تاريخ الأدلة محفوظ أدناه.':'لا يوجد دليل مؤهل حاليًا ضمن صلاحياتك.'}</div>:<div className="control360-table-wrap"><table className="workflow-table"><thead><tr><th>الدليل</th><th>العلاقة</th><th>الإصدار</th><th>المراجعة</th><th>الصلاحية</th></tr></thead><tbody>{eligible.map(e=><tr key={e.evidence_id}><td>{e.evidence_name||e.file_name||'دليل مسجل'}</td><td>{e.association==='direct'?'مباشر':'مشترك عبر مواءمة معتمدة'}</td><td>{e.version_number} · الحالي</td><td><StatusBadge status={e.review_status}/></td><td>{e.valid_until?formatComplianceDate(e.valid_until):'غير محددة'}</td></tr>)}</tbody></table></div>}{canUpload&&nextAction!=='upload'&&<Link className="control360-text-action" href={'/controls/'+control.id+'/evidence/new?'+context}>رفع دليل جديد ←</Link>}</section>
    <details className="detail-card"><summary>جميع الأدلة والإصدارات وقرارات المراجعة</summary>{issues.evidence&&<p role="alert">{issues.evidence}</p>}{!issues.evidence&&!evidence.length&&<p>لا توجد أدلة مرفوعة بعد.</p>}{evidence.map(e=><article className="control-evidence-item" key={`${e.id}-${e.link_id??"source"}`}><small>{e.is_current?'الإرسال الحالي':'إصدار سابق'} · إصدار {e.version_number}{e.link_id?' · مشترك':''}</small><h3>{e.evidence_name||e.file_name}</h3><p>{e.file_name} · {e.uploader_name||"رافع غير موثق بالاسم"}</p>{e.valid_until&&<p>الصلاحية: {formatComplianceDate(e.valid_until)}</p>}{canUpload&&e.is_current&&!e.link_id&&<Link href={`/controls/${control.id}/evidence/new?replace=${e.id}&${context}`}>رفع إصدار جديد</Link>}<StatusBadge status={e.status||''}/>{e.uploaded_at&&<p>{date(e.uploaded_at)}</p>}{e.description&&<p>{e.description}</p>}{e.review_notes&&<p>ملاحظات المراجع: {e.review_notes}</p>}<EvidenceDownload path={e.file_path} name={e.file_name}/>{canReview&&e.is_current&&['pending_review','under_review'].includes(e.status||'')&&<Link className="detail-button" href={`/review#evidence-${e.id}`}>مراجعة الدليل</Link>}</article>)}</details>
    {plan.evidence.length>0&&<details className="detail-card"><summary>أمثلة إرشادية داخلية للأدلة</summary><p className="detail-hint">أمثلة مساعدة وليست نصًا رسميًا أو معايير تقييم؛ تُحدد الكفاية وفق المتطلب ونطاق التطبيق.</p><ul>{plan.evidence.map(item=><li key={item}>{item}</li>)}</ul></details>}
   </>}
   {tab==='assessment'&&<Control360Assessments rows={assessments} framework={frameworkCode.toUpperCase()} error={issues.assessment}/>}
   {tab==='findings'&&<Control360Findings rows={findings} actions={actions} href={findingsHref} error={issues.findings}/>}
   {tab==='activity'&&<Control360Activity rows={activity} canViewCentral={canViewAudit} error={issues.activity}/>}
  </section>
 </main>;
}

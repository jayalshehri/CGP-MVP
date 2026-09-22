"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import StatusBadge, { statusText } from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import ControlAssessmentHistory from "@/components/ControlAssessmentHistory";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import ControlReviewPanel from "@/components/ControlReviewPanel";
import { controlPlan } from "@/lib/control-plan";
import { eccImplementationGuideUrl, eccOfficialControlsUrl, getEccOfficialTitle, getEccStrategyExample } from "@/lib/ecc-strategy-example";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { frequencyLabels, formatGrcDate, scheduleState, scheduleStateLabels, cycleStage, cycleStageLabels } from "@/lib/grc";
import "./detail.css";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; official_text_ar:string|null; hierarchy_level:string; parent_control_id:number|null; applicability:string|null; source_page:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; audit_frequency:string; next_audit_date:string|null; frameworks:{code:string,name_ar:string,version:string}|null; };
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
const tabs=['نظرة عامة','الأدلة المطلوبة','الضوابط المرتبطة','السجل والمراجعات'];
const date=(value:string)=>new Date(value).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'});
const goodStatus=(value:string)=>['verified','approved','accepted','compliant'].includes(value);
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
 const {id}=useParams<{id:string}>(); const router=useRouter();
 const [control,setControl]=useState<Control|null>(null),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[role,setRole]=useState<UserRole|null>(null);
 const [tab,setTab]=useState(0);

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
  const {profile}=await requireProfile();if(!active)return;setRole(profile.role);
  const controlId=Number(id);if(!Number.isSafeInteger(controlId)||controlId<=0)throw new Error('رقم الضابط غير صحيح.');
  const [c,e,rc,cy]=await Promise.all([
   supabase.from('controls').select('*,frameworks(code,name_ar,version)').eq('id',controlId).single(),
   supabase.rpc('grc_evidence_register'),
   supabase.from('cybersecurity_requirement_controls').select('requirement_id,coverage_type,mapping_confidence,cybersecurity_requirements(requirement_code,title_ar)').eq('control_id',controlId),
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
 const canReview=role==='admin'||role==='cybersecurity_team';
 const canUpload=canReview||role==='control_owner';
 useEffect(()=>{let active=true;if(!control||!canReview)return()=>{active=false;};void Promise.all([supabase.rpc('ecc_assessment_reflections',{p_ecc_control_id:control.id}),supabase.rpc('grc_control_mappings',{p_control_id:control.id})]).then(([reflectionResult,mappingResult])=>{if(active){setReflections((reflectionResult.data??[]) as AssessmentReflection[]);setMappedControls((mappingResult.data??[]) as MappedControl[]);}});return()=>{active=false;};},[control,canReview]);
 if(loading)return <main className="detail-page" role="status">جاري تحميل الضابط…</main>;
 if(error||!control)return <main className="detail-page"><p role="alert">{error}</p><Link href="/controls">العودة إلى الضوابط</Link></main>;
 const plan=controlPlan(control.control_code,control.description_ar||'',control.frameworks?.code);
 const strategyExample=control.frameworks?.code==='ECC'?getEccStrategyExample(control.control_code):undefined;
 const isEcc=control.frameworks?.code==='ECC';
 const isCcc=control.frameworks?.code==='CCC';
 // official_text_ar is the validated NCA regulatory text — the source of truth.
 // Older per-framework fallbacks only apply on the handful of rows a future
 // catalog refresh has not yet reached (none, as of this correction pass).
 const officialRequirement=control.official_text_ar||strategyExample?.requirement||(isCcc?control.title_ar:control.description_ar)||'لا يوجد وصف مسجل.';
 const applicability=applicabilityLabel(control.applicability);
 const frameworkCode=(control.frameworks?.code||'ECC').toLowerCase();
 const timeline=[...evidence.flatMap(e=>[
  ...(e.uploaded_at?[{key:`upload-${e.id}`,time:e.uploaded_at,title:`رفع دليل: ${e.evidence_name||e.file_name}`,body:e.description}]:[]),
  ...(e.reviewed_at?[{key:`review-${e.id}`,time:e.reviewed_at,title:`قرار المراجعة: ${statusText(e.status||'')}`,body:e.review_notes}]:[])
 ])].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 return <main className="detail-page" dir="rtl">
  <Link className="detail-back" href="/controls">← العودة إلى الضوابط</Link>
  <nav className="detail-breadcrumb" aria-label="مسار التصنيف الهرمي">
   <span>{control.domain_ar}</span>
   <span aria-hidden="true">←</span>
   <span>{cleanTitle(control.title_ar)}</span>
   {parentControl&&<><span aria-hidden="true">←</span><Link href={`/controls/${parentControl.id}`}><span dir="ltr">{parentControl.control_code}</span> {parentControl.official_text_ar||cleanTitle(parentControl.title_ar)}</Link></>}
  </nav>
  <header className="detail-hero"><div><span className="detail-code" dir="ltr">{control.control_code}</span>{control.frameworks&&<span className="detail-framework-tag" dir="ltr">{control.frameworks.code} {control.frameworks.version}</span>}{control.hierarchy_level==='sub_control'?<span className="detail-hierarchy-tag">ضابط فرعي</span>:<span className="detail-hierarchy-tag">ضابط أساسي</span>}{applicability&&<span className="catalog-applicability">{applicability}</span>}<h1>{control.official_text_ar||(isEcc?getEccOfficialTitle(control.control_code):undefined)||strategyExample?.title||cleanTitle(control.title_ar)}</h1><p>{control.domain_ar}</p></div><div className="detail-hero-actions"><StatusBadge status={control.implementation_status}/>{canReview&&<Link className="detail-assign-owner" href={`/controls/${control.id}/assign`}>{control.control_owner?"تغيير مالك الضابط":"تعيين مالك الضابط"} ←</Link>}</div></header>
  <div className="detail-metrics"><section><small>حالة التطبيق</small><StatusBadge status={control.implementation_status}/></section><section><small>حالة الدليل</small><StatusBadge status={control.evidence_status}/></section><section><small>حالة التحقق</small><StatusBadge status={control.verification_status}/></section><section><small>موعد الاستحقاق</small><strong>{control.due_date||'غير محدد'}</strong></section></div>
  <section className="detail-next"><div><span>{canUpload?'الإجراء التالي':'وضع المراجعة'}</span><strong>{canUpload?(control.evidence_status==='not_uploaded'?'رفع الدليل المطلوب للضابط':!goodStatus(control.verification_status)?'متابعة مراجعة الدليل والتحقق':'مراجعة الضابط دوريًا والمحافظة على الأدلة'):'تستطيع معاينة الدليل والسجل فقط ضمن نطاق التدقيق الممنوح لك.'}</strong></div>{canUpload&&control.evidence_status==='not_uploaded'?<Link className="detail-button" href={`/controls/${control.id}/evidence/new`}>رفع دليل ←</Link>:<button className="detail-button" onClick={()=>setTab(3)}>فتح السجل ←</button>}</section>
  <section className="detail-schedule-strip">
   <div><small>تكرار المراجعة</small><strong>{frequencyLabels[control.audit_frequency]??control.audit_frequency}</strong></div>
   <div><small>آخر مراجعة</small><strong>{formatGrcDate(control.last_review_date)}</strong></div>
   <div><small>المراجعة القادمة</small><strong>{formatGrcDate(control.next_audit_date)}</strong><span className={`audit-state ${scheduleState(control.next_audit_date)}`}>{scheduleStateLabels[scheduleState(control.next_audit_date)]}</span></div>
   <div><small>مرحلة الدورة الحالية</small><span className={`audit-stage ${cycleStage(!!openCycleId,latestRequestStatus)}`}>{cycleStageLabels[cycleStage(!!openCycleId,latestRequestStatus)]}</span>{openCycleDue&&<small className="detail-schedule-due">حتى {formatGrcDate(openCycleDue)}</small>}</div>
   {openCycleId&&reviewerName&&<div><small>المراجع المكلف</small><strong>{reviewerName}</strong></div>}
  </section>
  <div className="detail-tabs" role="tablist" aria-label="تفاصيل الضابط">{tabs.map((label,index)=><button key={label} id={`detail-tab-${index}`} role="tab" aria-selected={tab===index} aria-controls={`detail-panel-${index}`} tabIndex={tab===index?0:-1} onClick={()=>setTab(index)} onKeyDown={event=>{let next=index;if(event.key==='ArrowLeft')next=(index+1)%tabs.length;else if(event.key==='ArrowRight')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setTab(next);document.getElementById(`detail-tab-${next}`)?.focus();}}>{label}</button>)}</div>
  <section id={`detail-panel-${tab}`} role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="detail-columns">
   <div className="detail-content">
   {tab===0&&<><ControlReviewPanel controlId={control.id} canManage={canReview} canSubmit={canUpload}/>
   <section className="detail-card requirements-projects-card">
    <h2>المتطلبات والمشاريع المرتبطة</h2>
    <p className="detail-hint">علاقة للقراءة فقط، مصدرها ربط المتطلبات السيبرانية الحالي — لا منطق ربط جديد ولا تكرار للبيانات.</p>
    {!requirementLinks.length?<p>لا يدعم هذا الضابط أي متطلب سيبراني مسجل حاليًا.</p>:
    <div className="req-proj-table-wrap"><table className="req-proj-table"><thead><tr><th>رمز المتطلب</th><th>المتطلب</th><th>التغطية</th><th>جودة الربط</th><th>رمز المشروع</th><th>المشروع</th></tr></thead><tbody>
     {requirementLinks.map(link=>{
      const requirement=single(link.cybersecurity_requirements);
      const projectLink=projectLinks.find(p=>p.requirement_id===link.requirement_id);
      const project=projectLink?single(projectLink.cybersecurity_projects):null;
      return <tr key={link.requirement_id}>
       <td dir="ltr">{requirement?.requirement_code??'—'}</td>
       <td>{requirement?.title_ar??'—'}</td>
       <td><span className={`coverage-pill ${link.coverage_type}`}>{coverageText[link.coverage_type]??link.coverage_type}</span></td>
       <td><span className={`mapping-pill ${link.mapping_confidence}`}>{mappingConfidenceText[link.mapping_confidence]??link.mapping_confidence}</span></td>
       <td dir="ltr">{project?.project_code??'—'}</td>
       <td>{project?<Link href={`/roadmap/${projectLink!.project_id}`}>{project.name_ar}</Link>:'غير مرتبط بمشروع'}</td>
      </tr>;
     })}
    </tbody></table></div>}
   </section>
   <section className="detail-card"><h2>المتطلب الرسمي</h2><p className="detail-official">{officialRequirement}</p>{control.source_page&&<p className="detail-hint">المصدر: {control.frameworks?.code} {control.frameworks?.version} — الصفحة {control.source_page} من الوثيقة الرسمية الصادرة عن الهيئة الوطنية للأمن السيبراني.</p>}{plan.requirements.length>0&&<><h3>المتطلبات الفرعية</h3>{plan.requirements.map(r=><p className="detail-requirement" key={r.key}><b dir="ltr">{r.key}</b> {r.text}</p>)}</>}<a className="detail-back" href={isEcc?eccOfficialControlsUrl:`https://nca.gov.sa/ar/regulatory-documents/controls-list/${frameworkCode}/`} target="_blank" rel="noreferrer">مرجع الضوابط الرسمية للهيئة ↗</a></section>
   {childControls.length>0&&<section className="detail-card"><h2>الضوابط الفرعية ({childControls.length})</h2><p className="detail-hint">بنود تنظيمية رسمية مستقلة ضمن هذا الضابط، كل منها قابل للتقييم بشكل مستقل.</p><ul className="detail-children-list">{childControls.map(k=><li key={k.id}><Link href={`/controls/${k.id}`}><span dir="ltr">{k.control_code}</span> <span>{k.official_text_ar||k.title_ar}</span><StatusBadge status={k.implementation_status}/></Link></li>)}</ul></section>}
   {isEcc&&<section className="detail-card"><h2>الإرشاد المرجعي للهيئة</h2><p>يوجد دليل إرشادي مستقل لتطبيق ECC. يُستخدم للاستئناس بمنهج التطبيق، بينما يبقى نص ECC الحالي هو المتطلب الملزم عند اختلاف الإصدار أو الصياغة.</p><a className="detail-back" href={eccImplementationGuideUrl} target="_blank" rel="noreferrer">فتح الدليل الإرشادي ↗</a></section>}{["CSCC","DCC","TCC","OSMACC"].includes(frameworkCode)&&<ControlAssessmentHistory controlId={control.id} framework={frameworkCode}/>}</>}
   {tab===1&&<><section className="detail-card"><h2>الأدلة المقترحة</h2><p className="detail-hint">أمثلة مساعدة؛ تُحدد كفايتها وفق نص الضابط ونطاق التطبيق.</p><ul>{plan.evidence.map(item=><li key={item}>{item}</li>)}</ul>{canUpload&&<Link className="detail-button" href={`/controls/${control.id}/evidence/new`}>+ رفع دليل</Link>}</section><section className="detail-card"><h2>الأدلة والإصدارات</h2>{!evidence.length&&<p>لا توجد أدلة مرفوعة بعد.</p>}{evidence.map(e=><article className="control-evidence-item" key={`${e.id}-${e.link_id??"source"}`}><small>{e.is_current?'الإرسال الحالي':'إصدار سابق'} · إصدار {e.version_number}{e.link_id?' · مشترك':''}</small><h3>{e.evidence_name||e.file_name}</h3><p>{e.file_name} · {e.uploader_name||"رافع غير موثق بالاسم"}</p>{e.valid_until&&<p>الصلاحية: {e.valid_until}</p>}{canUpload&&e.is_current&&!e.link_id&&<Link href={`/controls/${control.id}/evidence/new?replace=${e.id}`}>رفع إصدار جديد</Link>}<StatusBadge status={e.status||''}/>{e.uploaded_at&&<p>{date(e.uploaded_at)}</p>}{e.description&&<p>{e.description}</p>}{e.review_notes&&<p>ملاحظات المراجع: {e.review_notes}</p>}<EvidenceDownload path={e.file_path} name={e.file_name}/>{canReview&&e.is_current&&['pending_review','under_review'].includes(e.status||'')&&<Link className="detail-button" href={`/review#evidence-${e.id}`}>مراجعة الدليل</Link>}</article>)}</section></>}
   {tab===2&&<section className="detail-card"><h2>الضوابط المرتبطة</h2><p className="detail-hint">هذه علاقات مواءمة راجعها واعتمدها الفريق؛ نوع العلاقة وحدود تغطيتها موثقان في خريطة المواءمة. يمكن رفع الدليل مرة واحدة ثم اختياره للضوابط المرتبطة؛ ويظل قرار القبول مستقلًا لكل ضابط.</p>{!canReview?<p>تظهر المواءمات التفصيلية لمدير الامتثال والمراجعة ومدير النظام.</p>:!mappedControls.length?<p>لا توجد علاقات مواءمة معتمدة لهذا الضابط.</p>:<div className="detail-timeline">{mappedControls.map(item=>{const matchedReflections=reflections.filter(result=>result.source_framework===item.framework_code&&result.source_control_code===item.control_code);return <article key={item.control_id}><strong><span dir="ltr">{item.framework_code} · {item.control_code}</span> — {item.control_title}</strong><small>{matchedReflections.length?matchedReflections.map(result=>`${result.assessment_scope}: ${assessmentStatusText[result.compliance_status]||'لم يُقيّم'}`).join(' | '):'لا توجد نتيجة معتمدة ضمن علاقة موثقة'}</small><p>{item.source_note||'راجع مصدر العلاقة وحدودها في خريطة المواءمة.'}</p><Link className="detail-back" href={`/controls/${item.control_id}`}>فتح الضابط المرتبط ←</Link></article>})}</div>}{canReview&&<p style={{marginTop:18}}><Link className="detail-button" href="/mappings">فتح خريطة المواءمة ←</Link></p>}</section>}
   {tab===3&&<section className="detail-card"><h2>سجل الأدلة والملاحظات</h2>{!timeline.length&&<p>لا توجد أنشطة مسجلة بعد.</p>}<ol className="detail-timeline">{timeline.map(item=><li key={item.key}><strong>{item.title}</strong><small>{date(item.time)}</small>{item.body&&<p>{item.body}</p>}</li>)}</ol></section>}
   </div>
   <aside>{tab===3&&<GrcAuditTrail controlId={control.id}/>} {tab===0&&<section className="detail-card"><h2>التدقيق الدوري</h2><p className="detail-hint">تتم جدولة ومتابعة جميع التدقيقات من صفحة موحدة حسب سياسة الجهة.</p><p><strong>الموعد القادم:</strong> {control.next_audit_date||"غير مجدول"}</p><Link className="detail-button" href="/audit-schedule">فتح جدول التدقيق الدوري ←</Link></section>}</aside>
  </section>
 </main>;
}

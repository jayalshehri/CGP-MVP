"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import StatusBadge, { statusText } from "@/components/StatusBadge";
import EvidenceDownload from "@/components/EvidenceDownload";
import { controlPlan } from "@/lib/control-plan";
import { eccImplementationGuideUrl, eccOfficialControlsUrl, getEccOfficialTitle, getEccStrategyExample } from "@/lib/ecc-strategy-example";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import "./detail.css";

type Control = { id:number; control_code:string; title_ar:string; description_ar:string|null; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; last_review_date:string|null; control_owner:string|null; evidence_owner:string|null; audit_frequency:string; next_audit_date:string|null; frameworks:{code:string}|null; };
type Evidence = { is_current?:boolean; uploaded_at?:string|null; file_path?:string|null; review_notes?:string|null; reviewed_at?:string|null; id:number; evidence_name?:string|null; file_name?:string|null; description?:string|null; status?:string|null };
type AssessmentReflection = {source_framework:string;source_control_code:string;source_control_title:string;assessment_scope:string|null;compliance_status:string;notes:string|null;corrective_action:string|null;expected_compliance_date:string|null;updated_at:string|null};
type MappedControl = {control_id:number;framework_code:string;control_code:string;control_title:string;relationship_type:string;source_note:string|null};
const tabs=['نظرة عامة','الأدلة المطلوبة','الضوابط المرتبطة','السجل والمراجعات'];
const date=(value:string)=>new Date(value).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'});
const goodStatus=(value:string)=>['verified','approved','accepted','compliant'].includes(value);
const assessmentStatusText:Record<string,string>={implemented:'مطبق كليًا',partially_implemented:'مطبق جزئيًا',not_implemented:'غير مطبق',not_applicable:'لا ينطبق'};

export default function ControlDetailsPage() {
 const {id}=useParams<{id:string}>(); const router=useRouter();
 const [control,setControl]=useState<Control|null>(null),[evidence,setEvidence]=useState<Evidence[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[canAssign,setCanAssign]=useState(false);
 const [tab,setTab]=useState(0);

 const [reflections,setReflections]=useState<AssessmentReflection[]>([]);
 const [mappedControls,setMappedControls]=useState<MappedControl[]>([]);
 useEffect(()=>{let active=true;(async()=>{try{
  const {profile}=await requireProfile();if(!active)return;setCanAssign(profile.role!=='control_owner');
  const controlId=Number(id);if(!Number.isSafeInteger(controlId)||controlId<=0)throw new Error('رقم الضابط غير صحيح.');
  const [c,e]=await Promise.all([
   supabase.from('controls').select('*,frameworks(code)').eq('id',controlId).single(),
   supabase.from('evidence').select('*').eq('control_id',controlId).order('uploaded_at',{ascending:false})]);
  if(c.error||!c.data)throw new Error('الضابط غير موجود أو ليس ضمن صلاحيتك.');
  if(e.error)throw new Error('تعذر تحميل أدلة الضابط. أعد تحميل الصفحة.');
  if(active){setControl(c.data);setEvidence(e.data??[]);}
 }catch(e){if(active)setError(e instanceof Error?e.message:'تعذر التحميل');const {data}=await supabase.auth.getSession();if(!data.session)router.replace('/login');}
 finally{if(active)setLoading(false);}})();return()=>{active=false;};},[id,router]);
 useEffect(()=>{let active=true;if(!control||control.frameworks?.code!=='ECC'||!canAssign)return()=>{active=false;};void Promise.all([supabase.rpc('ecc_assessment_reflections',{p_ecc_control_id:control.id}),supabase.rpc('ecc_control_mappings',{p_ecc_control_id:control.id})]).then(([reflectionResult,mappingResult])=>{if(active){setReflections((reflectionResult.data??[]) as AssessmentReflection[]);setMappedControls((mappingResult.data??[]) as MappedControl[]);}});return()=>{active=false;};},[control,canAssign]);
 if(loading)return <main className="detail-page" role="status">جاري تحميل الضابط…</main>;
 if(error||!control)return <main className="detail-page"><p role="alert">{error}</p><Link href="/controls">العودة إلى الضوابط</Link></main>;
 const plan=controlPlan(control.control_code,control.description_ar||'',control.frameworks?.code);
 const strategyExample=control.frameworks?.code==='ECC'?getEccStrategyExample(control.control_code):undefined;
 const isEcc=control.frameworks?.code==='ECC';
 const isCcc=control.frameworks?.code==='CCC';
 const officialRequirement=strategyExample?.requirement||(isCcc?control.title_ar:control.description_ar)||'لا يوجد وصف مسجل.';
 const frameworkCode=(control.frameworks?.code||'ECC').toLowerCase();
 const timeline=[...evidence.flatMap(e=>[
  ...(e.uploaded_at?[{key:`upload-${e.id}`,time:e.uploaded_at,title:`رفع دليل: ${e.evidence_name||e.file_name}`,body:e.description}]:[]),
  ...(e.reviewed_at?[{key:`review-${e.id}`,time:e.reviewed_at,title:`قرار المراجعة: ${statusText(e.status||'')}`,body:e.review_notes}]:[])
 ])].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
 return <main className="detail-page" dir="rtl">
  <Link className="detail-back" href="/controls">← العودة إلى الضوابط</Link>
  <header className="detail-hero"><div><span className="detail-code">{control.control_code}</span><h1>{getEccOfficialTitle(control.control_code)||strategyExample?.title||control.title_ar}</h1><p>{control.domain_ar}</p></div><StatusBadge status={control.implementation_status}/></header>
  <section className="detail-next"><div><span>الإجراء التالي</span><strong>{control.evidence_status==='not_uploaded'?'رفع الدليل المطلوب للضابط':!goodStatus(control.verification_status)?'متابعة مراجعة الدليل والتحقق':'مراجعة الضابط دوريًا والمحافظة على الأدلة'}</strong></div>{control.evidence_status==='not_uploaded'?<Link className="detail-button" href={`/controls/${control.id}/evidence/new`}>رفع دليل ←</Link>:<button className="detail-button" onClick={()=>setTab(3)}>فتح السجل ←</button>}</section>
  <div className="detail-metrics"><section><small>حالة التطبيق</small><StatusBadge status={control.implementation_status}/></section><section><small>حالة الدليل</small><StatusBadge status={control.evidence_status}/></section><section><small>حالة التحقق</small><StatusBadge status={control.verification_status}/></section><section><small>موعد الاستحقاق</small><strong>{control.due_date||'غير محدد'}</strong></section></div>
  <div className="detail-tabs" role="tablist" aria-label="تفاصيل الضابط">{tabs.map((label,index)=><button key={label} id={`detail-tab-${index}`} role="tab" aria-selected={tab===index} aria-controls={`detail-panel-${index}`} tabIndex={tab===index?0:-1} onClick={()=>setTab(index)} onKeyDown={event=>{let next=index;if(event.key==='ArrowLeft')next=(index+1)%tabs.length;else if(event.key==='ArrowRight')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();setTab(next);document.getElementById(`detail-tab-${next}`)?.focus();}}>{label}</button>)}</div>
  <section id={`detail-panel-${tab}`} role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="detail-columns">
   <div className="detail-content">
   {tab===0&&<><section className="detail-card"><h2>المتطلب الرسمي</h2><p className="detail-official">{officialRequirement}</p>{plan.requirements.length>0&&<><h3>المتطلبات الفرعية</h3>{plan.requirements.map(r=><p className="detail-requirement" key={r.key}><b dir="ltr">{r.key}</b> {r.text}</p>)}</>}<a className="detail-back" href={isEcc?eccOfficialControlsUrl:`https://nca.gov.sa/ar/regulatory-documents/controls-list/${frameworkCode}/`} target="_blank" rel="noreferrer">مرجع الضوابط الرسمية للهيئة ↗</a></section>{isEcc&&<section className="detail-card"><h2>الإرشاد المرجعي للهيئة</h2><p>يوجد دليل إرشادي مستقل لتطبيق ECC. يُستخدم للاستئناس بمنهج التطبيق، بينما يبقى نص ECC الحالي هو المتطلب الملزم عند اختلاف الإصدار أو الصياغة.</p><a className="detail-back" href={eccImplementationGuideUrl} target="_blank" rel="noreferrer">فتح الدليل الإرشادي ↗</a></section>}</>}
   {tab===1&&<><section className="detail-card"><h2>الأدلة المقترحة</h2><p className="detail-hint">أمثلة مساعدة؛ تُحدد كفايتها وفق نص الضابط ونطاق التطبيق.</p><ul>{plan.evidence.map(item=><li key={item}>{item}</li>)}</ul><Link className="detail-button" href={`/controls/${control.id}/evidence/new`}>+ رفع دليل</Link></section><section className="detail-card"><h2>الأدلة والإصدارات</h2>{!evidence.length&&<p>لا توجد أدلة مرفوعة بعد.</p>}{evidence.map(e=><article className="control-evidence-item" key={e.id}><small>{e.is_current?'الإرسال الحالي':'إصدار سابق'}</small><h3>{e.evidence_name||e.file_name}</h3><StatusBadge status={e.status||''}/>{e.uploaded_at&&<p>{date(e.uploaded_at)}</p>}{e.description&&<p>{e.description}</p>}{e.review_notes&&<p>ملاحظات المراجع: {e.review_notes}</p>}<EvidenceDownload path={e.file_path} name={e.file_name}/>{canAssign&&e.is_current&&['pending_review','under_review'].includes(e.status||'')&&<Link className="detail-button" href="/review">مراجعة الدليل</Link>}</article>)}</section></>}
   {tab===2&&<section className="detail-card"><h2>الضوابط المرتبطة</h2><p className="detail-hint">هذه مواءمات صريحة مستخرجة من مراجع NCA. يمكن رفع الدليل مرة واحدة من ضابط ECC ثم اختياره للضوابط المرتبطة؛ ويظل قرار القبول مستقلًا لكل ضابط.</p>{!canAssign?<p>تعرض المواءمات لفريق الأمن السيبراني ومدير النظام.</p>:!mappedControls.length?<p>لا توجد مواءمات رسمية مسجلة لهذا الضابط.</p>:<div className="detail-timeline">{mappedControls.map(item=>{const reflection=reflections.find(result=>result.source_framework===item.framework_code&&result.source_control_code===item.control_code);return <article key={item.control_id}><strong><span dir="ltr">{item.framework_code} · {item.control_code}</span> — {item.control_title}</strong><small>{reflection?`نتيجة الأداة: ${assessmentStatusText[reflection.compliance_status]||'لم يُقيّم'}`:'لم تُسجل نتيجة تقييم بعد'}</small><p>{item.source_note||'مواءمة مرجعية رسمية.'}</p><Link className="detail-back" href={`/controls/${item.control_id}`}>فتح الضابط المرتبط ←</Link></article>})}</div>}<p style={{marginTop:18}}><Link className="detail-button" href="/mappings">فتح خريطة المواءمة ←</Link></p></section>}
   {tab===3&&<section className="detail-card"><h2>سجل الأدلة والملاحظات</h2>{!timeline.length&&<p>لا توجد أنشطة مسجلة بعد.</p>}<ol className="detail-timeline">{timeline.map(item=><li key={item.key}><strong>{item.title}</strong><small>{date(item.time)}</small>{item.body&&<p>{item.body}</p>}</li>)}</ol></section>}
   </div>
   <aside>{tab===0&&<section className="detail-card"><h2>التدقيق الدوري</h2><p className="detail-hint">تتم جدولة ومتابعة جميع التدقيقات من صفحة موحدة حسب سياسة الجهة.</p><p><strong>الموعد القادم:</strong> {control.next_audit_date||"غير مجدول"}</p><Link className="detail-button" href="/audit-schedule">فتح جدول التدقيق الدوري ←</Link></section>}</aside>
  </section>
 </main>;
}

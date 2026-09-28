'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {AssessmentCycle,AssessmentFinding,AssessmentItem,assessmentLabels,Person,reviewLabels} from '@/lib/assessment';
import {formatComplianceDate,formatComplianceDateTime} from '@/lib/grc';
import {ASSESSMENT_ROUTES} from '@/lib/compliance-frameworks';
import {assessmentContext,assessmentItemHref,itemNeedsInput} from '@/lib/assessment-journey';
import {loadAssessmentItemContext} from '@/lib/assessment-journey-read';

type Props={item:AssessmentItem;cycle:AssessmentCycle;people:Person[];projects:{id:number;name_ar:string}[];evidenceIds:number[];finding?:AssessmentFinding;actor:string;role:string;busy:boolean;context:string;returnHref:string;previousHref?:string;nextHref?:string;sharedCount:number;command:(action:string,data:Record<string,unknown>)=>Promise<boolean>};
export default function AssessmentItemEditor({item,cycle,people,projects,evidenceIds,finding,actor,role,busy,context,returnHref,previousHref,nextHref,sharedCount,command}:Props){
 const pathname=usePathname();
 const frameworkCode=ASSESSMENT_ROUTES.find(route=>route.href===pathname)?.code;
 const findingContext=new URLSearchParams({source:'assessment',source_id:String(item.id),cycle:String(cycle.id)});
 if(frameworkCode)findingContext.set('framework',frameworkCode);
 findingContext.set('assessment_context',assessmentContext(context).toString());
 const [data,setData]=useState<Awaited<ReturnType<typeof loadAssessmentItemContext>>|null>(null),[readError,setReadError]=useState(''),[reload,setReload]=useState(0),[saved,setSaved]=useState(false);
 const evidenceKey=evidenceIds.join(',');
 useEffect(()=>{let active=true;void loadAssessmentItemContext(frameworkCode??'',item.control_id,evidenceKey?evidenceKey.split(',').map(Number):[]).then(result=>{if(active){setData(result);setReadError('');}}).catch(()=>{if(active)setReadError('تعذر تحميل النص والأدلة المتاحة. أعد المحاولة قبل حفظ ارتباطات الأدلة.');});return()=>{active=false;};},[frameworkCode,item.control_id,evidenceKey,reload]);
 const evidence=data?.eligible??[];
 const [form,setForm]=useState({compliance_status:item.compliance_status??'',notes:item.notes??'',corrective_action:item.corrective_action??'',expected_compliance_date:item.expected_compliance_date??'',owner_id:item.owner_id??''});
 const [ids,setIds]=useState(evidenceIds),[reason,setReason]=useState('');
 const [gap,setGap]=useState({status:finding?.status??'open',severity:finding?.severity??'unclassified',owner_id:finding?.owner_id??'',due_date:finding?.due_date??'',action_plan:finding?.action_plan??'',project_id:finding?.project_id?.toString()??'',evidence_id:''});
 const team=['admin','cybersecurity_team'].includes(role);
 const editable=team&&actor===cycle.assessor_id&&['draft','in_progress','evidence_collection'].includes(cycle.status);
 const canFollow=team||(role==='control_owner'&&finding?.owner_id===actor);
 const reviewable=team&&actor===cycle.reviewer_id&&actor!==cycle.assessor_id&&cycle.status==='under_review';
 const original={compliance_status:item.compliance_status??'',notes:item.notes??'',corrective_action:item.corrective_action??'',expected_compliance_date:item.expected_compliance_date??'',owner_id:item.owner_id??''};
 const dirty=JSON.stringify(form)!==JSON.stringify(original)||[...ids].sort().join(',')!==[...evidenceIds].sort().join(',');
 const incomplete=itemNeedsInput({...item,...form,compliance_status:(form.compliance_status||null) as AssessmentItem['compliance_status']});
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const leave=(event:React.MouseEvent<HTMLAnchorElement>)=>{if(dirty&&!window.confirm('توجد تعديلات غير محفوظة. هل تريد مغادرة البند؟'))event.preventDefault();};
 const controlContext=new URLSearchParams({from:'assessment',assessment_context:assessmentContext(context).toString()});
 return <div className="ae-detail">
 <nav className="ae-links" aria-label="مسار بند التقييم"><Link onClick={leave} href={returnHref}>{assessmentContext(context).get('from')==='review'?'العودة إلى مركز المراجعة':'العودة إلى دورة التقييم'} ←</Link><Link onClick={leave} href={assessmentItemHref(frameworkCode??'',cycle.id,null,context)??pathname}>دورة #{cycle.id} · {cycle.scope_name}</Link><b dir="ltr">{item.control_code}</b></nav>
 <header className="ae-heading"><div><h2>بند التقييم <b dir="ltr">{item.control_code}</b></h2><p>{item.title_ar}</p></div><p role="status">{!editable?'عرض فقط':busy?'جاري الحفظ…':dirty?'تعديلات غير محفوظة':saved?'تم الحفظ':'محفوظ'} · {incomplete?'بيانات النتيجة غير مكتملة':'بيانات النتيجة مكتملة — الإرسال من الدورة'}</p></header>
 <section className="ae-section"><h3>المتطلب التنظيمي</h3>{data?.officialText?<p className="ae-regulatory">{data.officialText}</p>:<p className="ae-muted">{data?'النص الرسمي غير متاح هنا؛ راجع صفحة الضابط.':'جاري تحميل النص الرسمي…'}</p>}
 <Link onClick={leave} href={`/controls/${item.control_id}?${controlContext}`}>فتح Control 360 ←</Link>
 <details><summary>النص المحفوظ ضمن دورة التقييم</summary><p className="ae-regulatory">{item.description_ar||item.title_ar}</p></details></section>
 {readError&&<p className="ae-error" role="alert">{readError} <button onClick={()=>setReload(v=>v+1)}>إعادة المحاولة</button></p>}
 <form onSubmit={async e=>{e.preventDefault();if(!data||readError)return;const ok=await command('save',{item_id:item.id,revision:item.revision,...form,evidence_ids:ids});if(ok)setSaved(true);}}>
 <fieldset disabled={!editable||busy}><legend>نتيجة المتطلب</legend><div className="ae-form-grid">
 <label>النتيجة<select value={form.compliance_status} onChange={e=>setForm({...form,compliance_status:e.target.value})}><option value="">لم يُقيّم</option>{Object.entries(assessmentLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>مالك المعالجة<select value={form.owner_id} onChange={e=>setForm({...form,owner_id:e.target.value})}><option value="">غير محدد</option>{people.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}</select></label>
 <label>المبرر / نتيجة الفحص<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
 <label>إجراء المعالجة<textarea value={form.corrective_action} onChange={e=>setForm({...form,corrective_action:e.target.value})}/></label>
 <label>موعد المعالجة<input type="date" value={form.expected_compliance_date} onChange={e=>setForm({...form,expected_compliance_date:e.target.value})}/></label>
 </div></fieldset><fieldset disabled={!editable||busy||!data||!!readError}><legend>الأدلة</legend><p className="ae-muted">الإصدارات المتاحة لهذا الضابط ضمن صلاحياتك. تحقق الاستقلالية عند المراجعة يتم بواسطة المحرك.</p>{!data&&!readError?<p role="status">جاري تحميل الأدلة…</p>:evidence.length===0?<p>لا توجد أدلة مؤهلة متاحة حاليًا.</p>:evidence.map(e=><label className="ae-check" key={e.evidence_id}><input type="checkbox" checked={ids.includes(e.evidence_id)} onChange={ev=>setIds(v=>ev.target.checked?[...v,e.evidence_id]:v.filter(id=>id!==e.evidence_id))}/><span>{e.file_name||e.evidence_name} · الإصدار {e.version_number}<small>{e.association==='direct'?'دليل مباشر':'دليل مشترك عبر مواءمة معتمدة'}{e.valid_until?` · الصلاحية ${formatComplianceDate(e.valid_until)}`:''}</small></span></label>)}
 {evidenceIds.filter(id=>!evidence.some(e=>e.evidence_id===id)).map(id=>{const version=data?.linked.find(e=>e.id===id);return <label className="ae-check" key={id}><input type="checkbox" checked={ids.includes(id)} onChange={e=>setIds(v=>e.target.checked?[...v,id]:v.filter(value=>value!==id))}/><span>{version?.file_name||'ارتباط محفوظ في دورة التقييم'} · إصدار {version?.version_number??'غير متاح'}<small>ليس ضمن الإصدارات المؤهلة الحالية؛ لا يُعد دليلًا صالحًا بمجرد بقاء الارتباط.</small></span></label>;})}
 </fieldset><div className="ae-links"><Link onClick={leave} href={`/evidence?${new URLSearchParams({framework:frameworkCode??'',control:String(item.control_id),from:'workspace'})}`}>فتح مستودع الأدلة ←</Link>{editable&&<Link onClick={leave} href={`/controls/${item.control_id}/evidence/new`}>تقديم دليل ←</Link>}</div>
 {editable&&<button disabled={busy||!data||!!readError||!dirty} className="cgp-primary-button" type="submit">حفظ نتيجة المتطلب</button>}</form>
 <section className="ae-section"><h3>المراجعة</h3><p>{reviewLabels[item.review_status]} {item.review_reason&&`— ${item.review_reason}`}</p>{item.reviewed_at&&<p>تاريخ القرار: {formatComplianceDateTime(item.reviewed_at)} · المراجع: {people.find(p=>p.user_id===item.reviewed_by)?.display_name||'مسجّل في تاريخ القرار'}</p>}
 {(reviewable||(finding&&canFollow))&&<label>سبب القرار<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="اشرح سبب قبول النتيجة أو إعادتها أو التحقق من المعالجة"/></label>}
 {reviewable&&<div className="ae-actions"><button className="cgp-primary-button" disabled={busy||!reason.trim()} onClick={()=>void command('review',{item_id:item.id,revision:item.revision,decision:'accepted',reason})}>قبول النتيجة</button><button disabled={busy||!reason.trim()} onClick={()=>void command('review',{item_id:item.id,revision:item.revision,decision:'changes_requested',reason})}>طلب استكمال</button></div>}</section>
 <section className="ae-section"><h3>الملاحظات والإجراءات المشتركة</h3><p>{sharedCount?`${sharedCount} ملاحظة مرتبطة بهذا البند ضمن صلاحياتك.`:'لا توجد ملاحظات مشتركة مرتبطة بهذا البند ضمن صلاحياتك.'}</p><Link onClick={leave} href={`/findings?${findingContext.toString()}`}>الملاحظات والإجراءات لهذا البند ←</Link><p className="ae-muted">إنشاء الملاحظة قرار صريح، ولا يحدث تلقائيًا من نتيجة التقييم.</p></section>
 {finding&&<details className="ae-section"><summary>فجوة التقييم السابقة — سجل مستقل · {finding.status==='closed'?'مغلقة':'مفتوحة'}</summary><form onSubmit={e=>{e.preventDefault();void command('finding',{item_id:item.id,revision:finding.revision,...gap,reason});}}><fieldset disabled={busy||!canFollow||finding.status==='closed'}><div className="ae-form-grid">
 <label>الحالة<select value={gap.status} onChange={e=>setGap({...gap,status:e.target.value})}>{[['open','مفتوحة'],['in_progress','قيد المعالجة'],['verification','بانتظار التحقق'],['closed','إغلاق بعد التحقق']].map(([v,l])=><option key={v} value={v} disabled={v==='closed'&&actor!==cycle.reviewer_id}>{l}</option>)}</select></label>
 <label>الخطورة<select disabled={!team} value={gap.severity} onChange={e=>setGap({...gap,severity:e.target.value})}>{[['unclassified','غير مصنفة'],['low','منخفضة'],['medium','متوسطة'],['high','عالية'],['critical','حرجة']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>المالك<select disabled={!team} value={gap.owner_id} onChange={e=>setGap({...gap,owner_id:e.target.value})}><option value="">غير محدد</option>{people.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}</select></label>
 <label>الموعد<input type="date" value={gap.due_date} onChange={e=>setGap({...gap,due_date:e.target.value})}/></label>
 <label>خطة المعالجة<textarea value={gap.action_plan} onChange={e=>setGap({...gap,action_plan:e.target.value})}/></label>
 <label>مشروع معالجة — اختياري<select disabled={!team} value={gap.project_id} onChange={e=>setGap({...gap,project_id:e.target.value})}><option value="">إجراء تشغيلي دون مشروع</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
 <label>دليل التحقق من المعالجة<select disabled={!data||!!readError} value={gap.evidence_id} onChange={e=>setGap({...gap,evidence_id:e.target.value})}><option value="">اختر دليلًا مؤهلًا</option>{evidence.map(e=><option key={e.evidence_id} value={e.evidence_id}>{e.file_name} · v{e.version_number} · {e.association==='shared'?'مشترك':'مباشر'}</option>)}</select></label>
 </div><button type="submit">حفظ متابعة الفجوة</button></fieldset></form>{finding.verified_at&&<p>تم التحقق: {finding.verified_at} · {finding.verification_reason}</p>}</details>}
 {item.legacy_source!=null&&<p className="ae-muted">نتيجة موروثة محفوظة؛ لا تمثل اعتمادًا سابقًا.</p>}
 <nav className="ae-actions" aria-label="التنقل بين بنود الدورة">{previousHref&&<Link onClick={leave} href={previousHref}>البند السابق ←</Link>}{nextHref&&<Link onClick={leave} href={nextHref}>البند التالي ←</Link>}</nav>
 </div>;
}

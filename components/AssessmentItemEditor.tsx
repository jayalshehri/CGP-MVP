'use client';
import {useState} from 'react';
import Link from 'next/link';
import {AssessmentCycle,AssessmentFinding,AssessmentItem,assessmentLabels,Person,reviewLabels} from '@/lib/assessment';
import {EvidenceRecord} from '@/lib/grc';

type Props={item:AssessmentItem;cycle:AssessmentCycle;people:Person[];projects:{id:number;name_ar:string}[];evidence:EvidenceRecord[];evidenceIds:number[];finding?:AssessmentFinding;actor:string;role:string;busy:boolean;command:(action:string,data:Record<string,unknown>)=>Promise<boolean>};
export default function AssessmentItemEditor({item,cycle,people,projects,evidence,evidenceIds,finding,actor,role,busy,command}:Props){
 const [form,setForm]=useState({compliance_status:item.compliance_status??'',notes:item.notes??'',corrective_action:item.corrective_action??'',expected_compliance_date:item.expected_compliance_date??'',owner_id:item.owner_id??''});
 const [ids,setIds]=useState(evidenceIds),[reason,setReason]=useState('');
 const [gap,setGap]=useState({status:finding?.status??'open',severity:finding?.severity??'unclassified',owner_id:finding?.owner_id??'',due_date:finding?.due_date??'',action_plan:finding?.action_plan??'',project_id:finding?.project_id?.toString()??'',evidence_id:''});
 const editable=actor===cycle.assessor_id&&['draft','in_progress','evidence_collection'].includes(cycle.status);
 const team=['admin','cybersecurity_team'].includes(role);
 const canFollow=team||(role==='control_owner'&&finding?.owner_id===actor);
 const reviewable=actor===cycle.reviewer_id&&cycle.status==='under_review';
 return <div className="ae-detail">
 <p>{item.description_ar||item.title_ar}</p><div className="ae-links"><Link href={`/controls/${item.control_id}`}>فتح الضابط والأدلة والسجل ←</Link>{role!=='nca_external_auditor'&&<Link href={`/controls/${item.control_id}/evidence/new`}>تقديم دليل</Link>}</div>
 <form onSubmit={e=>{e.preventDefault();void command('save',{item_id:item.id,revision:item.revision,...form,evidence_ids:ids});}}>
 <fieldset disabled={!editable||busy}><legend>نتيجة المتطلب</legend><div className="ae-form-grid">
 <label>النتيجة<select value={form.compliance_status} onChange={e=>setForm({...form,compliance_status:e.target.value})}><option value="">لم يُقيّم</option>{Object.entries(assessmentLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>مالك المعالجة<select value={form.owner_id} onChange={e=>setForm({...form,owner_id:e.target.value})}><option value="">غير محدد</option>{people.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}</select></label>
 <label>المبرر / نتيجة الفحص<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
 <label>إجراء المعالجة<textarea value={form.corrective_action} onChange={e=>setForm({...form,corrective_action:e.target.value})}/></label>
 <label>موعد المعالجة<input type="date" value={form.expected_compliance_date} onChange={e=>setForm({...form,expected_compliance_date:e.target.value})}/></label>
 </div><fieldset><legend>إصدارات الأدلة المرتبطة بالضابط</legend>{evidence.length===0?<p>لا توجد أدلة مرتبطة. استخدم نظام الأدلة المركزي أعلاه.</p>:evidence.map(e=><label className="ae-check" key={e.id}><input type="checkbox" checked={ids.includes(e.id)} onChange={ev=>setIds(v=>ev.target.checked?[...v,e.id]:v.filter(id=>id!==e.id))}/>{e.file_name||e.evidence_name} · إصدار {e.version_number} · {({pending_review:'بانتظار المراجعة',under_review:'قيد المراجعة',accepted:'مقبول',approved:'معتمد',rejected:'مرفوض',changes_requested:'يحتاج استكمالًا',withdrawn:'مسحوب'} as Record<string,string>)[e.status]??e.status} {e.is_current?'':'· سابق'} {e.valid_until?`· صالح حتى ${e.valid_until}`:''}</label>)}</fieldset>
 <button className="cgp-primary-button" type="submit">حفظ نتيجة المتطلب</button></fieldset></form>
 <p>المراجعة: {reviewLabels[item.review_status]} {item.review_reason&&`— ${item.review_reason}`}</p>
 {(reviewable||(finding&&canFollow))&&<label>سبب القرار<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="اشرح سبب قبول النتيجة أو إعادتها أو التحقق من المعالجة"/></label>}
 {reviewable&&<div className="ae-actions"><button disabled={busy||!reason.trim()} onClick={()=>void command('review',{item_id:item.id,revision:item.revision,decision:'accepted',reason})}>قبول النتيجة</button><button disabled={busy||!reason.trim()} onClick={()=>void command('review',{item_id:item.id,revision:item.revision,decision:'changes_requested',reason})}>طلب استكمال</button></div>}
 {finding&&<details><summary>الفجوة وإجراءات المعالجة · {finding.status==='closed'?'مغلقة':'مفتوحة'}</summary><form onSubmit={e=>{e.preventDefault();void command('finding',{item_id:item.id,revision:finding.revision,...gap,reason});}}><fieldset disabled={busy||!canFollow||finding.status==='closed'}><div className="ae-form-grid">
 <label>الحالة<select value={gap.status} onChange={e=>setGap({...gap,status:e.target.value})}>{[['open','مفتوحة'],['in_progress','قيد المعالجة'],['verification','بانتظار التحقق'],['closed','إغلاق بعد التحقق']].map(([v,l])=><option key={v} value={v} disabled={v==='closed'&&actor!==cycle.reviewer_id}>{l}</option>)}</select></label>
 <label>الخطورة<select disabled={!team} value={gap.severity} onChange={e=>setGap({...gap,severity:e.target.value})}>{[['unclassified','غير مصنفة'],['low','منخفضة'],['medium','متوسطة'],['high','عالية'],['critical','حرجة']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
 <label>المالك<select disabled={!team} value={gap.owner_id} onChange={e=>setGap({...gap,owner_id:e.target.value})}><option value="">غير محدد</option>{people.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}</select></label>
 <label>الموعد<input type="date" value={gap.due_date} onChange={e=>setGap({...gap,due_date:e.target.value})}/></label>
 <label>خطة المعالجة<textarea value={gap.action_plan} onChange={e=>setGap({...gap,action_plan:e.target.value})}/></label>
 <label>مشروع معالجة — اختياري<select disabled={!team} value={gap.project_id} onChange={e=>setGap({...gap,project_id:e.target.value})}><option value="">إجراء تشغيلي دون مشروع</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
 <label>دليل التحقق من المعالجة<select value={gap.evidence_id} onChange={e=>setGap({...gap,evidence_id:e.target.value})}><option value="">اختر دليلًا مقبولًا</option>{evidence.filter(e=>e.is_current&&['accepted','approved'].includes(e.status)).map(e=><option key={e.id} value={e.id}>{e.file_name} · v{e.version_number}</option>)}</select></label>
 </div><button type="submit">حفظ متابعة الفجوة</button></fieldset></form>{finding.verified_at&&<p>تم التحقق: {finding.verified_at} · {finding.verification_reason}</p>}</details>}
 {item.legacy_source!=null&&<p className="ae-muted">نتيجة موروثة محفوظة؛ لا تمثل اعتمادًا سابقًا.</p>}
 </div>;
}

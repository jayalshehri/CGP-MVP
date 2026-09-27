'use client';

import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {FormEvent, Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import {requireProfile, type UserRole} from '@/lib/auth';
import {formatComplianceDate, todayRiyadh} from '@/lib/grc';
import {
  actionStatusLabels, findingStatusLabels, severityLabels, sourceLabels,
  type CorrectiveAction, type FindingSource, type SharedFinding,
} from '@/lib/findings';
import {supabase} from '@/lib/supabase';
import {ASSESSMENT_ROUTES, assessmentHrefFor} from '@/lib/compliance-frameworks';
import {WorkflowHeading, WorkflowMetric} from '@/components/WorkflowUI';
import './findings.css';

type Person = {user_id:string;display_name:string|null;role:string};
type EvidenceOption = {id:number;file_name:string|null;evidence_name:string|null;version_number:number;valid_until:string|null;uploaded_by:string;association:'direct'|'shared'};
const roleCanWork = (role:UserRole) => role==='admin'||role==='cybersecurity_team'||role==='control_owner';
const teamRole = (role:UserRole) => role==='admin'||role==='cybersecurity_team';
const validSource = (value:string|null):FindingSource =>
  value==='assessment'||value==='risk'||value==='vulnerability' ? value : 'assessment';
const errorMessage = (value:unknown) => value instanceof Error ? value.message : 'تعذر إكمال العملية. أعد المحاولة.';

export default function FindingsPage(){
  return <Suspense fallback={<main className="workflow-page" dir="rtl" role="status">جاري تحميل الملاحظات…</main>}>
    <FindingsRoute/>
  </Suspense>;
}

function FindingsRoute(){
  const params=useSearchParams();
  const context=new URLSearchParams(params.toString());
  context.delete('finding');
  return <FindingsContent key={context.toString()} params={params}/>;
}

function FindingsContent({params}:{params:ReturnType<typeof useSearchParams>}){
  const router=useRouter();
  const sourceFromUrl=validSource(params.get('source'));
  const idFromUrl=Number(params.get('source_id'));
  const frameworkCode=params.get('framework')?.toUpperCase()??'';
  const origin=params.get('from')==='workspace'?params.get('origin')?.toUpperCase():null;
  const originCode=origin&&ASSESSMENT_ROUTES.some(route=>route.code===origin)?origin:null;
  const findingFromUrl=Number(params.get('finding'));
  const assessmentHref=assessmentHrefFor(frameworkCode);
  const cycleFromUrl=Number(params.get('cycle'));
  const hasAssessmentContext=sourceFromUrl==='assessment'&&assessmentHref&&Number.isSafeInteger(cycleFromUrl)&&cycleFromUrl>0;
  const [actor,setActor]=useState('');
  const [role,setRole]=useState<UserRole>('control_owner');
  const [findings,setFindings]=useState<SharedFinding[]>([]);
  const [actions,setActions]=useState<CorrectiveAction[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [sourceFilter,setSourceFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('all');
  const [severityFilter,setSeverityFilter]=useState('all');
  const [createOpen,setCreateOpen]=useState(false);
  const [newFinding,setNewFinding]=useState({
    source_type:sourceFromUrl,source_record_id:Number.isSafeInteger(idFromUrl)&&idFromUrl>0?String(idFromUrl):'',
    title:'',description:'',severity:'unclassified',owner_id:'',due_date:'',
  });

  const load=useCallback(async(team:boolean)=>{
    // Paging avoids treating Supabase's per-response row cap as a compliance total.
    const allFindings:SharedFinding[]=[];
    const allActions:CorrectiveAction[]=[];
    for(let from=0;;from+=500){
      const result=await supabase.from('grc_findings').select('*').order('id',{ascending:false}).range(from,from+499);
      if(result.error)throw result.error;
      allFindings.push(...(result.data??[]) as SharedFinding[]);
      if((result.data??[]).length<500)break;
    }
    for(let from=0;;from+=500){
      const result=await supabase.from('grc_corrective_actions').select('*').order('id').range(from,from+499);
      if(result.error)throw result.error;
      allActions.push(...(result.data??[]) as CorrectiveAction[]);
      if((result.data??[]).length<500)break;
    }
    const directory=team?await supabase.from('profiles').select('user_id,display_name,role').eq('is_active',true):null;
    if(directory?.error)throw directory.error;
    setFindings(allFindings);
    setActions(allActions);
    setPeople((directory?.data??[]) as Person[]);
    setSelectedId(previous=>Number.isSafeInteger(findingFromUrl)&&findingFromUrl>0&&allFindings.some(f=>f.id===findingFromUrl)?findingFromUrl:previous&&allFindings.some(f=>f.id===previous)?previous:
      allFindings.find(f=>f.source_type===sourceFromUrl&&f.source_record_id===idFromUrl)?.id??
      (Number.isSafeInteger(idFromUrl)&&idFromUrl>0?null:allFindings[0]?.id??null));
  },[sourceFromUrl,idFromUrl,findingFromUrl]);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const {user,profile}=await requireProfile(['admin','cybersecurity_team','control_owner','nca_external_auditor']);
        if(!active)return;
        setActor(user.id);setRole(profile.role);
        setNewFinding(previous=>({...previous,owner_id:teamRole(profile.role)?'':user.id}));
        await load(teamRole(profile.role));
      }catch(cause){if(active)setError(errorMessage(cause));}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[load]);

  const selected=findings.find(f=>f.id===selectedId)??null;
  const selectedActions=actions.filter(a=>a.finding_id===selectedId);
  const visible=useMemo(()=>findings.filter(f=>{
    const query=search.trim().toLocaleLowerCase();
    return (!query||`${f.reference_code} ${f.title} ${f.description}`.toLocaleLowerCase().includes(query))
      &&(sourceFilter==='all'||f.source_type===sourceFilter)
      &&(statusFilter==='all'||f.status===statusFilter)
      &&(severityFilter==='all'||f.severity===severityFilter)
      &&(!Number.isSafeInteger(idFromUrl)||idFromUrl<=0||
         (f.source_type===sourceFromUrl&&f.source_record_id===idFromUrl));
  }),[findings,search,sourceFilter,statusFilter,severityFilter,idFromUrl,sourceFromUrl]);
  const openFindings=findings.filter(f=>f.status!=='closed');
  const overdue=openFindings.filter(f=>f.due_date&&f.due_date<todayRiyadh());
  const canCreate=roleCanWork(role)&&
    (teamRole(role)||!Number.isSafeInteger(idFromUrl)||idFromUrl<=0||sourceFromUrl==='assessment');
  const selectFinding=(findingId:number)=>{const next=new URLSearchParams(params.toString());next.set('finding',String(findingId));router.push(`/findings?${next.toString()}`,{scroll:false});};

  async function run(action:string,finding:SharedFinding|null,payload:Record<string,unknown>){
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try{
      const {data,error:commandError}=await supabase.rpc('cgp_finding_command',{
        p_action:action,p_finding_id:finding?.id??null,
        p_data:finding?{finding_revision:finding.revision,...payload}:payload,
      });
      if(commandError)throw commandError;
      await load(teamRole(role));
      if(action==='create_finding'&&data?.id)selectFinding(Number(data.id));
      setNotice('حُفظ الإجراء في سجل الملاحظات والتدقيق.');
      return true;
    }catch(cause){setError(errorMessage(cause));return false;}
    finally{setBusy(false);}
  }

  async function createFinding(event:FormEvent){
    event.preventDefault();
    const sourceId=Number(newFinding.source_record_id);
    if(!Number.isSafeInteger(sourceId)||sourceId<1){setError('اختر معرّف مصدر صحيحًا.');return;}
    const saved=await run('create_finding',null,{
      ...newFinding,source_record_id:sourceId,owner_id:newFinding.owner_id||null,
      due_date:newFinding.due_date||null,
    });
    if(saved){setCreateOpen(false);setNewFinding(previous=>({...previous,title:'',description:'',due_date:''}));}
  }

  if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الملاحظات…</main>;
  return <main className="workflow-page findings-page" dir="rtl">
    {originCode&&<p className="findings-context"><Link href={`/compliance/${originCode}?tab=findings`}>العودة إلى ملاحظات {originCode} ←</Link></p>}
    <WorkflowHeading title="الملاحظات والإجراءات التصحيحية"
      description="سجل مشترك يربط مصدر الملاحظة بالمعالجة والتحقق والإغلاق؛ نتائج التقييم القديمة باقية كما هي."
      action={canCreate?<button className="workflow-button workflow-primary" onClick={()=>setCreateOpen(v=>!v)}>+ تسجيل ملاحظة</button>:undefined}/>
    {error&&<p className="findings-error" role="alert">{error} <button onClick={()=>router.refresh()}>تحديث الصفحة</button></p>}
    {notice&&<p className="findings-success" role="status">{notice}</p>}
    <div className="workflow-metrics">
      <WorkflowMetric label="مفتوحة ضمن نطاقك" value={openFindings.length}/>
      <WorkflowMetric label="متأخرة" value={overdue.length} tone={overdue.length?'danger':'neutral'}/>
      <WorkflowMetric label="بانتظار التحقق" value={findings.filter(f=>f.status==='pending_verification').length}/>
      <WorkflowMetric label="إجراءات مكتملة" value={actions.filter(a=>a.status==='completed').length}/>
    </div>
    {createOpen&&canCreate&&<form className="findings-panel findings-create" onSubmit={createFinding}>
      <h2>ملاحظة جديدة</h2><p>لا تُنشأ الملاحظة تلقائيًا من درجة الامتثال؛ يلزم قرار بشري صريح.</p>
      <div className="findings-form-grid">
        <label>المصدر<select value={newFinding.source_type} onChange={e=>setNewFinding({...newFinding,source_type:e.target.value as FindingSource,source_record_id:''})}>
          <option value="assessment">بند تقييم</option><option value="risk" disabled={!teamRole(role)}>خطر</option>
          <option value="vulnerability" disabled={!teamRole(role)}>ثغرة</option>
          <option value="internal_audit" disabled>تدقيق داخلي — بعد إنشاء سجله المستقل</option>
        </select></label>
        <label>معرّف سجل المصدر<input type="number" min="1" required dir="ltr" value={newFinding.source_record_id}
          onChange={e=>setNewFinding({...newFinding,source_record_id:e.target.value})}/></label>
        <label>العنوان<input required minLength={2} maxLength={300} value={newFinding.title}
          onChange={e=>setNewFinding({...newFinding,title:e.target.value})}/></label>
        <label>الخطورة<select value={newFinding.severity} disabled={!teamRole(role)} onChange={e=>setNewFinding({...newFinding,severity:e.target.value})}>
          {Object.entries(severityLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select></label>
        <label className="findings-wide">الوصف<textarea required value={newFinding.description}
          onChange={e=>setNewFinding({...newFinding,description:e.target.value})}/></label>
        <label>المالك<select value={newFinding.owner_id} disabled={!teamRole(role)} onChange={e=>setNewFinding({...newFinding,owner_id:e.target.value})}>
          <option value="">غير محدد</option>{people.filter(p=>['admin','cybersecurity_team','control_owner'].includes(p.role)).map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}
          {!teamRole(role)&&<option value={actor}>أنا</option>}
        </select></label>
        <label>موعد الاستحقاق<input type="date" value={newFinding.due_date}
          onChange={e=>setNewFinding({...newFinding,due_date:e.target.value})}/></label>
      </div><div className="findings-buttons"><button className="workflow-button workflow-primary" disabled={busy}>حفظ الملاحظة</button>
        <button type="button" className="workflow-button" onClick={()=>setCreateOpen(false)}>إلغاء</button></div>
    </form>}
    <section className="findings-panel">
      <div className="findings-filter">
        <label>بحث<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="المعرف أو العنوان أو الوصف"/></label>
        <label>المصدر<select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">الكل</option>
          {(['assessment','risk','vulnerability'] as const).map(value=><option key={value} value={value}>{sourceLabels[value]}</option>)}</select></label>
        <label>الحالة<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">الكل</option>
          {Object.entries(findingStatusLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
        <label>الخطورة<select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}><option value="all">الكل</option>
          {Object.entries(severityLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
      </div>
      {Number.isSafeInteger(idFromUrl)&&idFromUrl>0&&<p className="findings-context">{hasAssessmentContext?<><Link href={`/compliance/${frameworkCode}`}>{frameworkCode}</Link> ← <Link href={`${assessmentHref}?cycle=${cycleFromUrl}`}>دورة التقييم #{cycleFromUrl}</Link> ← <Link href={`${assessmentHref}?cycle=${cycleFromUrl}&item=${idFromUrl}`}>العودة إلى بند التقييم #{idFromUrl} ←</Link></>:<>المصدر: {sourceLabels[sourceFromUrl]} #{idFromUrl}</>} · <Link href="/findings">عرض كل الملاحظات</Link></p>}
      <p role="status">{visible.length} ملاحظة ضمن هذه التصفية وصلاحياتك.</p>
      <div className="findings-table-wrap"><table className="workflow-table findings-table"><thead><tr>
        <th>الملاحظة</th><th>المصدر</th><th>الخطورة</th><th>الحالة</th><th>المالك</th><th>الاستحقاق</th><th>الإجراءات</th>
      </tr></thead><tbody>{visible.map(f=><tr key={f.id} className={selectedId===f.id?'findings-selected':''}>
        <td><b dir="ltr">{f.reference_code}</b><span>{f.title}</span></td>
        <td>{sourceLabels[f.source_type]} #{f.source_record_id}</td>
        <td>{severityLabels[f.severity]}</td><td>{findingStatusLabels[f.status]}</td>
        <td>{f.owner_id===actor?'أنا':people.find(p=>p.user_id===f.owner_id)?.display_name||f.owner_id?.slice(0,8)||'غير محدد'}</td>
        <td>{formatComplianceDate(f.due_date,true)}{f.due_date&&f.due_date<todayRiyadh()&&f.status!=='closed'&&<strong className="findings-overdue"> متأخرة</strong>}</td>
        <td><button onClick={()=>selectFinding(f.id)}>فتح</button></td>
      </tr>)}</tbody></table></div>
      {visible.length===0&&<p className="workflow-empty">لا توجد ملاحظات مطابقة. تبقى نتائج التقييم القديمة متاحة في صفحات التقييم نفسها.</p>}
    </section>
    {selected&&<FindingDetail key={`${selected.id}-${selected.revision}`} finding={selected}
      actions={selectedActions} actor={actor} role={role} people={people} busy={busy} run={run}/>}
  </main>;
}

function FindingDetail({finding,actions,actor,role,people,busy,run}:{
  finding:SharedFinding;actions:CorrectiveAction[];actor:string;role:UserRole;people:Person[];
  busy:boolean;run:(action:string,finding:SharedFinding,payload:Record<string,unknown>)=>Promise<boolean>;
}){
  const [actionOpen,setActionOpen]=useState(false);
  const [findingDraft,setFindingDraft]=useState({title:finding.title,description:finding.description,
    severity:finding.severity,due_date:finding.due_date??''});
  const [newAction,setNewAction]=useState({title:'',description:'',owner_id:teamRole(role)?'':actor,due_date:'',reference_note:''});
  const [reason,setReason]=useState('');
  const [findingEvidence,setFindingEvidence]=useState('');
  const [evidence,setEvidence]=useState<EvidenceOption[]>([]);
  const [evidenceError,setEvidenceError]=useState('');
  const canFollow=teamRole(role)||(role==='control_owner'&&finding.owner_id===actor);
  const canVerify=teamRole(role)&&actor!==finding.created_by&&actor!==finding.owner_id;
  useEffect(()=>{
    let active=true;
    if(!finding.control_id)return;
    void supabase.rpc('cgp_finding_evidence_options',{p_finding_id:finding.id})
      .then(({data,error})=>{
        if(!active)return;
        setEvidenceError(error?.message??'');
        setEvidence(error?[]:(data??[]) as EvidenceOption[]);
      });
    return()=>{active=false;};
  },[finding.id,finding.control_id,finding.revision]);
  const verifierEvidence=evidence.filter(e=>e.uploaded_by!==actor);
  const evidenceLabel=(item:EvidenceOption)=>`${item.file_name||item.evidence_name||`دليل #${item.id}`} · v${item.version_number} · ${item.association==='direct'?'دليل مباشر':'دليل مشترك عبر مواءمة معتمدة'}`;
  async function addAction(event:FormEvent){event.preventDefault();
    const saved=await run('add_action',finding,{...newAction,due_date:newAction.due_date||null});
    if(saved){setActionOpen(false);setNewAction({title:'',description:'',owner_id:teamRole(role)?'':actor,due_date:'',reference_note:''});}
  }
  return <section className="findings-panel findings-detail" aria-label="تفاصيل الملاحظة">
    <header><div><small dir="ltr">{finding.reference_code}</small><h2>{finding.title}</h2>
      <p>{sourceLabels[finding.source_type]} #{finding.source_record_id} · {findingStatusLabels[finding.status]}</p></div>
      {finding.control_id&&<Link href={`/controls/${finding.control_id}`}>فتح الضابط ←</Link>}</header>
    <p className="findings-description">{finding.description}</p>
    {evidenceError&&<p className="findings-error" role="alert">تعذر تحميل الأدلة المؤهلة: {evidenceError}</p>}
    {canFollow&&['open','in_treatment'].includes(finding.status)&&<details className="findings-edit">
      <summary>تعديل تفاصيل الملاحظة</summary>
      <form className="findings-form-grid" onSubmit={event=>{event.preventDefault();void run('update_finding',finding,
        {...findingDraft,due_date:findingDraft.due_date||null});}}>
        <label>العنوان<input required minLength={2} maxLength={300} value={findingDraft.title}
          onChange={event=>setFindingDraft({...findingDraft,title:event.target.value})}/></label>
        <label>الخطورة<select disabled={!teamRole(role)} value={findingDraft.severity}
          onChange={event=>setFindingDraft({...findingDraft,severity:event.target.value as SharedFinding['severity']})}>
          {Object.entries(severityLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
        <label className="findings-wide">الوصف<textarea required value={findingDraft.description}
          onChange={event=>setFindingDraft({...findingDraft,description:event.target.value})}/></label>
        <label>الاستحقاق<input type="date" value={findingDraft.due_date}
          onChange={event=>setFindingDraft({...findingDraft,due_date:event.target.value})}/></label>
        <button className="workflow-button" disabled={busy}>حفظ التعديل</button>
      </form>
    </details>}
    <dl className="findings-facts"><div><dt>تاريخ التحديد</dt><dd>{formatComplianceDate(finding.identified_date)}</dd></div>
      <div><dt>الخطورة</dt><dd>{severityLabels[finding.severity]}</dd></div>
      <div><dt>الاستحقاق</dt><dd>{formatComplianceDate(finding.due_date)}</dd></div>
      <div><dt>التحقق</dt><dd>{finding.verification_status==='accepted'?'مقبول':finding.verification_status==='rejected'?'مرفوض':finding.verification_status==='pending'?'بانتظار القرار':'لم يُقدم'}</dd></div></dl>
    {finding.verification_reason&&<p>قرار التحقق: {finding.verification_reason} {finding.verified_at&&`· ${formatComplianceDate(finding.verified_at)}`}</p>}
    {finding.closure_reason&&<p>قرار الإغلاق: {finding.closure_reason} · {formatComplianceDate(finding.closed_at)}</p>}
    {teamRole(role)&&<Link href="/audit">عرض سجل النشاط والتغييرات الكامل ←</Link>}
    <div className="findings-section-heading"><h3>الإجراءات التصحيحية ({actions.length})</h3>
      {canFollow&&['open','in_treatment'].includes(finding.status)&&<button onClick={()=>setActionOpen(v=>!v)}>+ إضافة إجراء</button>}</div>
    {actionOpen&&<form onSubmit={addAction} className="findings-action-form findings-form-grid">
      <label>عنوان الإجراء<input required minLength={2} value={newAction.title} onChange={e=>setNewAction({...newAction,title:e.target.value})}/></label>
      <label>المالك<select required value={newAction.owner_id} disabled={!teamRole(role)} onChange={e=>setNewAction({...newAction,owner_id:e.target.value})}>
        <option value="">اختر المالك</option>{people.filter(p=>['admin','cybersecurity_team'].includes(p.role)||p.user_id===finding.owner_id).map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}
        {!teamRole(role)&&<option value={actor}>أنا</option>}</select></label>
      <label className="findings-wide">الوصف<textarea required value={newAction.description} onChange={e=>setNewAction({...newAction,description:e.target.value})}/></label>
      <label>موعد الاستحقاق<input type="date" value={newAction.due_date} onChange={e=>setNewAction({...newAction,due_date:e.target.value})}/></label>
      <label>مرجع خارجي، إن وجد<input value={newAction.reference_note} onChange={e=>setNewAction({...newAction,reference_note:e.target.value})}/></label>
      <button className="workflow-button workflow-primary" disabled={busy}>حفظ الإجراء</button>
    </form>}
    {actions.length===0?<p className="workflow-empty">لا توجد إجراءات مرتبطة. يمكن التحقق من الملاحظة بلا إجراء فقط بقرار صريح ومبرر.</p>:
      <div className="findings-actions">{actions.map(action=><CorrectiveActionCard key={`${action.id}-${action.revision}`}
        action={action} finding={finding} actor={actor} role={role} busy={busy}
        evidence={evidence} run={run}/>)}</div>}
    {canFollow&&finding.status!=='closed'&&<div className="findings-lifecycle">
      <h3>دورة الملاحظة</h3>
      <label>سبب القرار<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {finding.status==='open'&&<button disabled={busy} onClick={()=>void run('start_treatment',finding,{})}>بدء المعالجة</button>}
      {['open','in_treatment'].includes(finding.status)&&<button disabled={busy||!reason.trim()||actions.some(a=>a.status!=='completed')}
        onClick={()=>void run('submit_verification',finding,{reason})}>إرسال للتحقق</button>}
      {finding.status==='pending_verification'&&canVerify&&<>
        <label>دليل تحقق مقبول، إن وجد<select value={findingEvidence} onChange={e=>setFindingEvidence(e.target.value)}><option value="">بدون دليل إضافي</option>
          {verifierEvidence.map(e=><option key={e.id} value={e.id}>{evidenceLabel(e)}</option>)}</select></label>
        {finding.verification_status!=='accepted'&&<><button disabled={busy||!reason.trim()||actions.some(a=>a.verification_status!=='accepted')}
          onClick={()=>void run('verify_finding',finding,{reason,evidence_id:findingEvidence||null})}>قبول التحقق</button>
          <button disabled={busy||!reason.trim()} onClick={()=>void run('reject_finding',finding,{reason})}>إعادة للمعالجة</button></>}
      </>}
      {finding.status==='pending_verification'&&finding.verification_status==='accepted'&&finding.verified_by===actor&&
        <button className="workflow-button workflow-primary" disabled={busy||!reason.trim()}
          onClick={()=>void run('close_finding',finding,{reason})}>إغلاق بقرار مستقل</button>}
      <p className="findings-hint">اكتمال الإجراءات لا يغلق الملاحظة. يلزم تحقق مستقل ثم قرار إغلاق منفصل.</p>
    </div>}
    {role==='nca_external_auditor'&&<p className="findings-hint">عرض تاريخي فقط ضمن نطاق التدقيق المصرّح به.</p>}
  </section>;
}

function CorrectiveActionCard({action,finding,actor,role,busy,evidence,run}:{
  action:CorrectiveAction;finding:SharedFinding;actor:string;role:UserRole;busy:boolean;
  evidence:EvidenceOption[];run:(command:string,finding:SharedFinding,payload:Record<string,unknown>)=>Promise<boolean>;
}){
  const [note,setNote]=useState('');
  const [reason,setReason]=useState('');
  const [evidenceId,setEvidenceId]=useState('');
  const [draft,setDraft]=useState({title:action.title,description:action.description,
    due_date:action.due_date??'',status:action.status});
  const canEdit=(teamRole(role)||action.owner_id===actor)&&['open','in_treatment'].includes(finding.status)
    &&action.status!=='completed';
  const canComplete=(teamRole(role)||action.owner_id===actor)&&['open','in_treatment'].includes(finding.status)&&action.status!=='completed';
  const canReview=teamRole(role)&&finding.status==='pending_verification'&&action.status==='completed'
    &&action.owner_id!==actor&&action.completed_by!==actor&&finding.created_by!==actor;
  return <article className="findings-action-card"><header><div><h4>{action.title}</h4><p>{actionStatusLabels[action.status]} · التحقق: {action.verification_status==='accepted'?'مقبول':action.verification_status==='rejected'?'مرفوض':action.verification_status==='pending'?'بانتظار القرار':'لم يبدأ'}</p></div>
    <span>#{action.id}</span></header><p>{action.description}</p>
    <small>الاستحقاق: {formatComplianceDate(action.due_date)}{action.completed_at&&` · أُكمل ${formatComplianceDate(action.completed_at)}`}</small>
    {action.completion_note&&<p>إفادة الإكمال: {action.completion_note}</p>}
    {action.verification_reason&&<p>قرار التحقق: {action.verification_reason}</p>}
    {action.verification_evidence_id&&<Link href="/evidence">دليل التحقق #{action.verification_evidence_id} في المستودع المركزي</Link>}
    {canEdit&&<details className="findings-edit"><summary>تعديل الإجراء</summary>
      <form className="findings-form-grid" onSubmit={event=>{event.preventDefault();void run('update_action',finding,
        {...draft,due_date:draft.due_date||null,action_id:action.id,action_revision:action.revision});}}>
        <label>العنوان<input required minLength={2} maxLength={300} value={draft.title}
          onChange={event=>setDraft({...draft,title:event.target.value})}/></label>
        <label>الحالة<select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value as CorrectiveAction['status']})}>
          <option value="open">مفتوح</option><option value="in_progress">قيد التنفيذ</option></select></label>
        <label className="findings-wide">الوصف<textarea required value={draft.description}
          onChange={event=>setDraft({...draft,description:event.target.value})}/></label>
        <label>الاستحقاق<input type="date" value={draft.due_date}
          onChange={event=>setDraft({...draft,due_date:event.target.value})}/></label>
        <button className="workflow-button" disabled={busy}>حفظ التعديل</button>
      </form>
    </details>}
    {canComplete&&<div className="findings-action-controls"><label>إفادة الإكمال<textarea value={note} onChange={e=>setNote(e.target.value)}/></label>
      <label>دليل مرتبط بالضابط، إن وجد<select value={evidenceId} onChange={e=>setEvidenceId(e.target.value)}><option value="">بدون دليل</option>
        {evidence.map(e=><option key={e.id} value={e.id}>{e.file_name||e.evidence_name||`دليل #${e.id}`} · v{e.version_number} · {e.association==='direct'?'دليل مباشر':'دليل مشترك عبر مواءمة معتمدة'}</option>)}</select></label>
      <button disabled={busy||!note.trim()} onClick={()=>void run('complete_action',finding,{action_id:action.id,action_revision:action.revision,completion_note:note,evidence_id:evidenceId||null})}>إكمال الإجراء</button>
    </div>}
    {canReview&&action.verification_status!=='accepted'&&<div className="findings-action-controls"><label>سبب التحقق<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <div className="findings-buttons"><button disabled={busy||!reason.trim()} onClick={()=>void run('verify_action',finding,{action_id:action.id,action_revision:action.revision,reason})}>قبول الإجراء</button>
        <button disabled={busy||!reason.trim()} onClick={()=>void run('reject_action',finding,{action_id:action.id,action_revision:action.revision,reason})}>إعادة الإجراء</button></div>
    </div>}
  </article>;
}

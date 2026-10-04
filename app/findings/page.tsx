'use client';

import Link from 'next/link';
import { myControlsReturn } from "@/lib/my-controls-context";
import {useRouter, useSearchParams} from 'next/navigation';
import {FormEvent, Suspense, useCallback, useEffect, useMemo, useState} from 'react';
import {requireProfile, type UserRole} from '@/lib/auth';
import {formatComplianceDate, todayRiyadh} from '@/lib/grc';
import {
  actionStatusLabels, findingStatusLabels, severityLabels, sourceLabels,
  type CorrectiveAction, type FindingSource, type SharedFinding,
} from '@/lib/findings';
import {supabase} from '@/lib/supabase';
import {controlHref} from '@/lib/control360';
import {ASSESSMENT_ROUTES, assessmentHrefFor} from '@/lib/compliance-frameworks';
import {assessmentItemHref} from '@/lib/assessment-journey';
import {WorkflowHeading, WorkflowMetric} from '@/components/WorkflowUI';
import {loadFindingSourceOptions,type FindingSourceOption} from '@/lib/finding-source-options';
import './findings.css';
import { reviewContextReturn } from '@/lib/review-context';

type Person = {user_id:string;display_name:string|null;role:string};
type EvidenceOption = {id:number;file_name:string|null;evidence_name:string|null;version_number:number;valid_until:string|null;uploaded_by:string;association:'direct'|'shared'};
type LinkedEvidence = {id:number;version_number:number;file_name:string|null;evidence_name:string|null;link_id:number|null};
type SourceContext = {state:'loading'|'available'|'unavailable';frameworkCode:string|null;controlCode:string|null;controlTitle:string|null;controlAvailable:boolean};
const roleCanWork = (role:UserRole) => role==='admin'||role==='cybersecurity_team'||role==='control_owner';
const teamRole = (role:UserRole) => role==='admin'||role==='cybersecurity_team';
const findingDisplayStatus = (finding:SharedFinding) => finding.status==='pending_verification'&&finding.verification_status==='accepted'?'بانتظار الإغلاق':findingStatusLabels[finding.status];
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
  const controlId=Number(params.get('control'));
  const hasControl=params.has('control');
  const returnToControl=params.get('from')==='control'&&Number.isSafeInteger(controlId)&&controlId>0?controlHref(controlId,params.get('return_context')??'','findings'):null;
 const personalReturn=myControlsReturn(new URLSearchParams(params.toString()))??myControlsReturn(new URLSearchParams(params.get("return_context")??""));
  const origin=params.get('from')==='workspace'?params.get('origin')?.toUpperCase():null;
  const originCode=origin&&origin===frameworkCode&&(ASSESSMENT_ROUTES.some(route=>route.code===origin)||origin==='QA_SYNTH')?origin:null;
  const findingFromUrl=Number(params.get('finding'));
  const hasRequestedFinding=params.has('finding');
  const actionFromUrl=Number(params.get('action'));
  const decisionFromUrl=params.get('decision');
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
  const pinnedSource=params.has('source_id');
  const [sourceOptions,setSourceOptions]=useState<{kind:FindingSource;state:'loading'|'ready'|'unavailable';rows:FindingSourceOption[]}>({kind:sourceFromUrl,state:'loading',rows:[]});
  const [ownerSourceAllowed,setOwnerSourceAllowed]=useState<{actor:string;id:number}|null>(null);
  const [newFinding,setNewFinding]=useState({
    source_type:sourceFromUrl,source_record_id:Number.isSafeInteger(idFromUrl)&&idFromUrl>0?String(idFromUrl):'',
    title:'',description:'',severity:'unclassified',owner_id:'',due_date:'',
  });

  const load=useCallback(async(team:boolean)=>{
    if(hasControl&&(!Number.isSafeInteger(controlId)||controlId<1))throw new Error('سياق الضابط غير صحيح.');
    // The framework parameter is a database filter, not just return context.
    // Never fall back to the global register when a code is unknown/inaccessible.
    let frameworkId:number|null=null;
    if(frameworkCode){
      const framework=await supabase.from('frameworks').select('id').eq('code',frameworkCode).eq('is_active',true).maybeSingle();
      if(framework.error)throw framework.error;
      frameworkId=framework.data?.id??-1;
    }
    // Paging avoids treating Supabase's per-response row cap as a compliance total.
    const allFindings:SharedFinding[]=[];
    const allActions:CorrectiveAction[]=[];
    for(let from=0;;from+=500){
      let query=supabase.from('grc_findings').select('*').order('id',{ascending:false}).range(from,from+499);
      if(frameworkId!==null)query=query.eq('framework_id',frameworkId);
      if(hasControl)query=query.eq('control_id',controlId);
      if(sourceFromUrl==='assessment'&&Number.isSafeInteger(idFromUrl)&&idFromUrl>0)query=query.eq('source_type','assessment').eq('assessment_item_id',idFromUrl);
      const result=await query;
      if(result.error)throw result.error;
      allFindings.push(...(result.data??[]) as SharedFinding[]);
      if((result.data??[]).length<500)break;
    }
    if(allFindings.length){
      for(let offset=0;offset<allFindings.length;offset+=200){
       const findingIds=allFindings.slice(offset,offset+200).map(f=>f.id);
       for(let from=0;;from+=500){
        const result=await supabase.from('grc_corrective_actions').select('*').in('finding_id',findingIds).order('id').range(from,from+499);
        if(result.error)throw result.error;
        allActions.push(...(result.data??[]) as CorrectiveAction[]);
        if((result.data??[]).length<500)break;
       }
      }
    }
    const directory=team?await supabase.from('profiles').select('user_id,display_name,role').eq('is_active',true):null;
    if(directory?.error)throw directory.error;
    setFindings(allFindings);
    setActions(allActions);
    setPeople((directory?.data??[]) as Person[]);
    setSelectedId(previous=>hasRequestedFinding?(Number.isSafeInteger(findingFromUrl)&&findingFromUrl>0&&allFindings.some(f=>f.id===findingFromUrl)?findingFromUrl:null):previous&&allFindings.some(f=>f.id===previous)?previous:
      allFindings.find(f=>f.source_type===sourceFromUrl&&f.source_record_id===idFromUrl)?.id??
      (Number.isSafeInteger(idFromUrl)&&idFromUrl>0?null:allFindings[0]?.id??null));
  },[sourceFromUrl,idFromUrl,findingFromUrl,hasRequestedFinding,frameworkCode,controlId,hasControl]);

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
  const exactAction=Number.isSafeInteger(actionFromUrl)&&actionFromUrl>0&&selectedActions.some(a=>a.id===actionFromUrl);
  useEffect(()=>{
    if(!selected||!hasRequestedFinding)return;
    const target=exactAction?`finding-action-${actionFromUrl}`:decisionFromUrl==='closure'?'finding-closure':decisionFromUrl==='verification'?'finding-decision':null;
    if(!target)return;
    const frame=requestAnimationFrame(()=>document.getElementById(target)?.scrollIntoView({block:'start'}));
    return()=>cancelAnimationFrame(frame);
  },[selected,exactAction,actionFromUrl,decisionFromUrl,hasRequestedFinding]);
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
  const inTreatment=findings.filter(f=>f.status==='in_treatment');
  const awaitingVerification=findings.filter(f=>f.status==='pending_verification'&&f.verification_status!=='accepted');
  const closedFindings=findings.filter(f=>f.status==='closed');
  useEffect(()=>{
    let active=true;
    if(role!=='control_owner'||sourceFromUrl!=='assessment'||!Number.isSafeInteger(idFromUrl)||idFromUrl<1)return;
    void supabase.from('assessment_items').select('id,cycle:assessment_cycles!cycle_id!inner(status)')
      .eq('id',idFromUrl).eq('owner_id',actor).in('cycle.status',['draft','in_progress','evidence_collection']).maybeSingle()
      .then(({data,error})=>{if(active)setOwnerSourceAllowed(!error&&data?{actor,id:idFromUrl}:null);});
    return()=>{active=false;};
  },[role,sourceFromUrl,idFromUrl,actor]);
  const canCreate=roleCanWork(role)&&(teamRole(role)||(sourceFromUrl==='assessment'&&ownerSourceAllowed?.actor===actor&&ownerSourceAllowed?.id===idFromUrl));
  useEffect(()=>{
    if(!createOpen||!canCreate)return;
    let active=true;
    const kind=newFinding.source_type;
    void (async()=>{
      try{
        const rows=await loadFindingSourceOptions(kind,pinnedSource?idFromUrl:null);
        if(active)setSourceOptions({kind,state:'ready',rows});
      }catch{if(active)setSourceOptions({kind,state:'unavailable',rows:[]});}
    })();
    return()=>{active=false;};
  },[createOpen,canCreate,newFinding.source_type,pinnedSource,idFromUrl]);
  const resolvedSource=sourceOptions.kind===newFinding.source_type&&sourceOptions.state==='ready'
    ?sourceOptions.rows.find(option=>String(option.id)===newFinding.source_record_id):undefined;
  const selectFinding=(findingId:number)=>{const next=new URLSearchParams(params.toString());next.set('finding',String(findingId));next.delete('action');next.delete('decision');router.push(`/findings?${next.toString()}`,{scroll:false});};

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
    if(!Number.isSafeInteger(sourceId)||sourceId<1||!resolvedSource){setError('اختر سجل مصدر متاحًا ضمن صلاحياتك.');return;}
    const saved=await run('create_finding',null,{
      ...newFinding,source_record_id:sourceId,owner_id:newFinding.owner_id||null,
      due_date:newFinding.due_date||null,
    });
    if(saved){setCreateOpen(false);setNewFinding(previous=>({...previous,title:'',description:'',due_date:''}));}
  }

  if(loading)return <main className="workflow-page" dir="rtl" role="status">جاري تحميل مساحة الملاحظات…</main>;
  return <main className="workflow-page findings-page" dir="rtl">
    {reviewContextReturn(new URLSearchParams(params.toString()))&&<p><Link href={reviewContextReturn(new URLSearchParams(params.toString()))!}>العودة إلى قائمة المراجعة والقرار ←</Link></p>}
    {personalReturn&&<p><Link href={personalReturn}>العودة إلى ضوابطي ←</Link></p>}
    {returnToControl&&<p className="findings-context"><Link href={returnToControl}>العودة إلى ملاحظات الضابط ←</Link></p>}
    {originCode&&<p className="findings-context"><Link href={`/compliance/${originCode}?tab=findings`}>العودة إلى ملاحظات {originCode} ←</Link></p>}
    <WorkflowHeading title={frameworkCode?`الملاحظات والإجراءات التصحيحية — ${frameworkCode}`:"الملاحظات والإجراءات التصحيحية"}
      description={frameworkCode?`الملاحظات المرتبطة فعليًا بإطار ${frameworkCode} ضمن صلاحياتك. نتائج التقييم القديمة مستقلة ومحفوظة في صفحاتها.`:"السجل المشترك المصرّح به يربط مصدر الملاحظة بالمعالجة والتحقق والإغلاق؛ نتائج التقييم القديمة باقية كما هي."}
      action={canCreate?<button className="workflow-button workflow-primary" onClick={()=>{if(!createOpen)setSourceOptions({kind:newFinding.source_type,state:'loading',rows:[]});setCreateOpen(v=>!v);}}>+ تسجيل ملاحظة</button>:undefined}/>
    {error&&<p className="findings-error" role="alert">{error} <button onClick={()=>router.refresh()}>تحديث الصفحة</button></p>}
    {notice&&<p className="findings-success" role="status">{notice}</p>}
    <div className="workflow-metrics" aria-label="ملخص الملاحظات">
      <WorkflowMetric label="مفتوحة ضمن نطاقك" value={openFindings.length}/>
      <WorkflowMetric label="قيد المعالجة" value={inTreatment.length}/>
      <WorkflowMetric label="بانتظار التحقق" value={awaitingVerification.length}/>
      <WorkflowMetric label="مغلقة" value={closedFindings.length}/>
    </div>
    {overdue.length>0&&<p className="findings-overdue findings-overdue-summary" role="status">{overdue.length} ملاحظة متأخرة ضمن الملاحظات غير المغلقة؛ التأخر ليس مرحلة منفصلة من دورة الملاحظة.</p>}
    {createOpen&&canCreate&&<form className="findings-panel findings-create" onSubmit={createFinding}>
      <header className="findings-create-heading"><h2>تسجيل ملاحظة</h2><p className="findings-context">سجّل المشكلة ومصدرها أولًا. تُضاف الإجراءات التصحيحية وتُتابع بعد حفظ الملاحظة؛ لا تُنشأ تلقائيًا من درجة الامتثال.</p></header>
      <fieldset className="findings-create-section"><legend><span className="findings-step-number">١</span> ما المشكلة؟</legend><p className="findings-step-hint">عنوان واضح ووصف يبيّن المشكلة المكتشفة.</p><div className="findings-form-grid">
        <label className="findings-wide">عنوان الملاحظة<input required minLength={2} maxLength={300} value={newFinding.title} onChange={e=>setNewFinding({...newFinding,title:e.target.value})} placeholder="وصف موجز للمشكلة المكتشفة"/></label>
        <label className="findings-wide">وصف المشكلة<textarea required value={newFinding.description} onChange={e=>setNewFinding({...newFinding,description:e.target.value})}/></label>
      </div></fieldset>
      <fieldset className="findings-create-section findings-source-step"><legend><span className="findings-step-number">٢</span> من أين اكتُشفت؟</legend><p className="findings-step-hint">اختر المصدر والسجل المرتبط ضمن صلاحياتك.</p><div className="findings-form-grid">
        <label>المصدر<select disabled={pinnedSource} value={newFinding.source_type} onChange={e=>{setSourceOptions({kind:e.target.value as FindingSource,state:'loading',rows:[]});setNewFinding({...newFinding,source_type:e.target.value as FindingSource,source_record_id:''});}}>
          <option value="assessment">بند تقييم</option><option value="risk" disabled={!teamRole(role)}>خطر</option>
          <option value="vulnerability" disabled={!teamRole(role)}>ثغرة</option>
          <option value="internal_audit" disabled>تدقيق داخلي — بعد إنشاء سجله المستقل</option>
        </select></label>
        <div className="findings-source-field"><span>السجل المرتبط</span>{pinnedSource?<p className="findings-source-reference" role="status">{resolvedSource?.label||(sourceOptions.state==='loading'?'جاري التحقق من المصدر…':'المصدر غير متاح للتسجيل ضمن صلاحياتك أو حالته الحالية.')}</p>:<label className="findings-source-select"><span className="findings-context">اختر السجل باسمه؛ يُحفظ الربط تلقائيًا.</span><select aria-label="السجل المرتبط" required disabled={sourceOptions.state!=='ready'||sourceOptions.kind!==newFinding.source_type} value={newFinding.source_record_id} onChange={e=>setNewFinding({...newFinding,source_record_id:e.target.value})}><option value="">{sourceOptions.state==='loading'?'جاري تحميل المصادر…':sourceOptions.state==='unavailable'?'المصادر غير متاحة حاليًا':'اختر سجل المصدر'}</option>{sourceOptions.kind===newFinding.source_type&&sourceOptions.rows.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}</div>
      </div>{!pinnedSource&&sourceOptions.state==='ready'&&!sourceOptions.rows.length&&<p className="findings-context">لا توجد مصادر متاحة للتسجيل ضمن هذا النوع وصلاحياتك.</p>}{sourceOptions.state==='unavailable'&&<p className="findings-unavailable" role="status">تعذر عرض مصدر قابل للاختيار. أعد فتح النموذج أو انتقل إلى سجل المصدر؛ لن يُستخدم مصدر بديل.</p>}<p className="findings-context">يرتبط بند التقييم بضابطه ودورته تلقائيًا. الربط بالتدقيق الداخلي غير مفعّل حاليًا.</p></fieldset>
      <fieldset className="findings-create-section findings-severity-step"><legend><span className="findings-step-number">٣</span> ما خطورتها؟</legend><p className="findings-step-hint">تقدير الفريق بحسب الأثر والسياق المتاح.</p><div className="findings-form-grid">
        <label>الخطورة<select aria-describedby="finding-severity-guidance" value={newFinding.severity} disabled={!teamRole(role)} onChange={e=>setNewFinding({...newFinding,severity:e.target.value})}>
          {Object.entries(severityLabels).map(([key,value])=><option key={key} value={key}>{value}</option>)}
        </select></label>
        <details id="finding-severity-guidance" className="findings-severity-help"><summary>كيف أحدد الخطورة؟</summary><p>إرشاد داخلي في CGP لتوثيق تقدير الفريق، وليس منهجية تصنيف صادرة عن NCA أو حسابًا آليًا للمخاطر.</p><ul><li>غير مصنفة: يلزم استكمال التقييم قبل تحديد الخطورة.</li><li>منخفضة: أثر محدود يمكن معالجته ضمن المتابعة الاعتيادية.</li><li>متوسطة: أثر يستدعي خطة معالجة ومتابعة محددة.</li><li>عالية: أثر كبير يستدعي اهتمامًا ومعالجة ذات أولوية.</li><li>حرجة: أثر شديد يستدعي تصعيدًا عاجلًا وفق إجراءات الجهة.</li></ul><p>استند إلى الأثر والسياق والمعلومات المتاحة، ووثّق المبرر في وصف الملاحظة.</p></details>
      </div></fieldset>
      <fieldset className="findings-create-section"><legend><span className="findings-step-number">٤</span> من سيعالجها ومتى؟</legend><p className="findings-step-hint">يمكن تحديد المالك والموعد الآن أو استكمالهما لاحقًا.</p><div className="findings-form-grid">
        <label>مالك الملاحظة — اختياري<select value={newFinding.owner_id} disabled={!teamRole(role)} onChange={e=>setNewFinding({...newFinding,owner_id:e.target.value})}>
          <option value="">غير محدد</option>{people.filter(p=>['admin','cybersecurity_team','control_owner'].includes(p.role)).map(p=><option key={p.user_id} value={p.user_id}>{p.display_name||p.user_id}</option>)}
          {!teamRole(role)&&<option value={actor}>أنا</option>}
        </select></label>
        <label>موعد الاستحقاق — اختياري<input type="date" value={newFinding.due_date}
          onChange={e=>setNewFinding({...newFinding,due_date:e.target.value})}/></label>
      </div></fieldset><div className="findings-buttons"><button className="workflow-button workflow-primary" disabled={busy||!resolvedSource}>حفظ الملاحظة</button>
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
      {Number.isSafeInteger(idFromUrl)&&idFromUrl>0&&<p className="findings-context">{hasAssessmentContext?<><Link href={`/compliance/${frameworkCode}`}>{frameworkCode}</Link> ← <Link href={assessmentItemHref(frameworkCode,cycleFromUrl,null,params.get('assessment_context')??'')!}>دورة التقييم #{cycleFromUrl}</Link> ← <Link href={assessmentItemHref(frameworkCode,cycleFromUrl,idFromUrl,params.get('assessment_context')??'')!}>العودة إلى بند التقييم #{idFromUrl} ←</Link></>:<>المصدر: {sourceLabels[sourceFromUrl]} #{idFromUrl}</>} · <Link href="/findings">عرض كل الملاحظات</Link></p>}
      {frameworkCode&&!(Number.isSafeInteger(idFromUrl)&&idFromUrl>0)&&<p className="findings-context"><Link href="/findings">عرض السجل العام المصرّح به ←</Link></p>}
      <p role="status">{visible.length} ملاحظة ضمن هذه التصفية وصلاحياتك.</p>
      <div className="findings-table-wrap"><table className="workflow-table findings-table"><thead><tr>
        <th>الملاحظة</th><th>المصدر</th><th>الخطورة</th><th>الحالة</th><th>المالك</th><th>الاستحقاق</th><th>الإجراءات</th>
      </tr></thead><tbody>{visible.map(f=><tr key={f.id} className={selectedId===f.id?'findings-selected':''}>
        <td><b dir="ltr">{f.reference_code}</b><span>{f.title}</span></td>
        <td>{sourceLabels[f.source_type]}</td>
        <td>{severityLabels[f.severity]}</td><td>{findingDisplayStatus(f)}</td>
        <td>{f.owner_id===actor?'أنا':people.find(p=>p.user_id===f.owner_id)?.display_name||(f.owner_id?'مالك مسجل':'غير محدد')}</td>
        <td>{formatComplianceDate(f.due_date,true)}{f.due_date&&f.due_date<todayRiyadh()&&f.status!=='closed'&&<strong className="findings-overdue"> متأخرة</strong>}</td>
        <td><button onClick={()=>selectFinding(f.id)}>فتح</button></td>
      </tr>)}</tbody></table></div>
      {visible.length===0&&<p className="workflow-empty">لا توجد ملاحظات مطابقة. تبقى نتائج التقييم القديمة متاحة في صفحات التقييم نفسها.</p>}
    </section>
    {params.has('finding')&&!selected&&!loading&&<p role="alert" className="findings-error">السجل المطلوب غير متاح أو تغيرت حالته ضمن صلاحياتك. <Link href={reviewContextReturn(new URLSearchParams(params.toString()))??'/findings'}>العودة إلى القائمة ←</Link></p>}
    {selected&&params.has('action')&&!exactAction&&<p role="alert" className="findings-error">الإجراء المطلوب غير متاح داخل هذه الملاحظة. تحقق من حالة السجل قبل اتخاذ قرار.</p>}
    {selected&&decisionFromUrl==='verification'&&selected.verification_status!=='pending'&&<p role="status" className="findings-context">حالة الملاحظة تغيرت منذ إضافتها لقائمة التحقق. راجع السجل الحالي قبل أي قرار.</p>}
    {selected&&decisionFromUrl==='closure'&&(selected.status!=='pending_verification'||selected.verification_status!=='accepted')&&<p role="status" className="findings-context">لم تعد هذه الملاحظة في حالة انتظار الإغلاق. يعرض السجل حالتها المعتمدة الحالية.</p>}
    {selected&&<FindingDetail key={`${selected.id}-${selected.revision}`} finding={selected} navigationContext={params.get('return_context')??params.toString()}
      focusedActionId={exactAction?actionFromUrl:null}
      actions={selectedActions} actor={actor} role={role} people={people} busy={busy} run={run}/>}
  </main>;
}

function FindingDetail({finding,actions,actor,role,people,busy,run,navigationContext,focusedActionId=null}:{
  finding:SharedFinding;actions:CorrectiveAction[];actor:string;role:UserRole;people:Person[];navigationContext:string;
  focusedActionId?:number|null;
  busy:boolean;run:(action:string,finding:SharedFinding,payload:Record<string,unknown>)=>Promise<boolean>;
}){
  const [actionOpen,setActionOpen]=useState(false);
  const [findingDraft,setFindingDraft]=useState({title:finding.title,description:finding.description,
    severity:finding.severity,due_date:finding.due_date??''});
  const [newAction,setNewAction]=useState({title:'',description:'',owner_id:teamRole(role)?'':actor,due_date:'',reference_note:''});
  const [reason,setReason]=useState('');
  const [closureReason,setClosureReason]=useState('');
  const [findingEvidence,setFindingEvidence]=useState('');
  const [evidence,setEvidence]=useState<EvidenceOption[]>([]);
  const [evidenceError,setEvidenceError]=useState('');
  const [linkedEvidence,setLinkedEvidence]=useState<{state:'loading'|'ready';rows:LinkedEvidence[]}>({state:'loading',rows:[]});
  const [sourceContext,setSourceContext]=useState<SourceContext>({state:'loading',frameworkCode:null,controlCode:null,controlTitle:null,controlAvailable:false});
  const canFollow=teamRole(role)||(role==='control_owner'&&finding.owner_id===actor);
  const canVerify=teamRole(role)&&actor!==finding.created_by&&actor!==finding.owner_id
    &&!actions.some(action=>action.owner_id===actor||action.completed_by===actor);
  const sourceIsResolvable=finding.source_type!=='internal_audit'&&Number.isSafeInteger(finding.source_record_id)&&finding.source_record_id>0;
  const sourceState=sourceIsResolvable?sourceContext.state:'unavailable';
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
  const linkedEvidenceIds=[...new Set([finding.verification_evidence_id,...actions.map(action=>action.verification_evidence_id)].filter((id):id is number=>id!==null))];
  const linkedEvidenceKey=linkedEvidenceIds.join(',');
  useEffect(()=>{
    let active=true;
    const ids=linkedEvidenceKey.split(',').filter(Boolean).map(Number);
    if(!ids.length)return;
    void (async()=>{
      try{
        let query=supabase.rpc('grc_evidence_register').select('id,control_id,link_id,version_number,file_name,evidence_name').in('id',ids);
        if(finding.control_id)query=query.eq('control_id',finding.control_id);
        const result=await query;
        if(active)setLinkedEvidence({state:'ready',rows:result.error?[]:(result.data??[]) as LinkedEvidence[]});
      }catch{if(active)setLinkedEvidence({state:'ready',rows:[]});}
    })();
    return()=>{active=false;};
  },[linkedEvidenceKey,finding.control_id]);
  useEffect(()=>{
    let active=true;
    const sourceTable:Record<FindingSource,string|null>={assessment:'assessment_items',risk:'cyber_risks',vulnerability:'vulnerabilities',internal_audit:null};
    const table=sourceTable[finding.source_type];
    if(!table||!Number.isSafeInteger(finding.source_record_id)||finding.source_record_id<1)return;
    void (async()=>{
      try{
        const [source,control,framework]=await Promise.all([
          supabase.from(table).select('id').eq('id',finding.source_record_id).maybeSingle(),
          finding.control_id?supabase.from('controls').select('id,control_code,title_ar').eq('id',finding.control_id).maybeSingle():Promise.resolve({data:null,error:null}),
          finding.framework_id?supabase.from('frameworks').select('id,code').eq('id',finding.framework_id).maybeSingle():Promise.resolve({data:null,error:null}),
        ]);
        if(!active)return;
        const controlData=control.error?null:control.data;
        const frameworkData=framework.error?null:framework.data;
        setSourceContext({state:source.error||!source.data?'unavailable':'available',
          frameworkCode:frameworkData?.code??null,controlCode:controlData?.control_code??null,
          controlTitle:controlData?.title_ar??null,controlAvailable:!!controlData});
      }catch{if(active)setSourceContext({state:'unavailable',frameworkCode:null,controlCode:null,controlTitle:null,controlAvailable:false});}
    })();
    return()=>{active=false;};
  },[finding.id,finding.source_type,finding.source_record_id,finding.control_id,finding.framework_id]);
  const verifierEvidence=evidence.filter(e=>e.uploaded_by!==actor);
  const evidenceLabel=(item:EvidenceOption)=>`${item.file_name||item.evidence_name||`دليل #${item.id}`} · v${item.version_number} · ${item.association==='direct'?'دليل مباشر':'دليل مشترك عبر مواءمة معتمدة'}`;
  const sourceHref=sourceState==='available'&&finding.source_type==='assessment'&&sourceContext.frameworkCode&&finding.assessment_cycle_id?
    assessmentItemHref(sourceContext.frameworkCode,finding.assessment_cycle_id,finding.source_record_id,navigationContext):null;
  const ownerName=(userId:string|null)=>userId===actor?'أنا':people.find(person=>person.user_id===userId)?.display_name??(userId?'مالك مسجل':'غير محدد');
  const linkedEvidenceLabel=(id:number)=>{
    const row=linkedEvidence.rows.find(item=>item.id===id);
    if(!row)return linkedEvidence.state==='loading'?'جاري التحقق من الدليل…':'الدليل المرتبط غير متاح ضمن صلاحياتك.';
    return `${row.evidence_name||row.file_name||'دليل'} · الإصدار ${row.version_number} · ${row.link_id===null?'مباشر':'مشترك'} · #${row.id}`;
  };
  async function addAction(event:FormEvent){event.preventDefault();
    const saved=await run('add_action',finding,{...newAction,due_date:newAction.due_date||null});
    if(saved){setActionOpen(false);setNewAction({title:'',description:'',owner_id:teamRole(role)?'':actor,due_date:'',reference_note:''});}
  }
  return <section className="findings-panel findings-detail" aria-label="تفاصيل الملاحظة">
    <header><div><small dir="ltr">{finding.reference_code}</small><h2>{finding.title}</h2>
      <p className="findings-context">الملاحظة هي السجل الرئيسي؛ الإجراءات أدناه تعالجها، ولا يغلقها اكتمال الإجراء تلقائيًا.</p></div>
      <span className="findings-status">{findingDisplayStatus(finding)}</span></header>
    <p className="findings-description">{finding.description}</p>
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
    <dl className="findings-facts"><div><dt>الخطورة</dt><dd>{severityLabels[finding.severity]}</dd></div>
      <div><dt>المالك</dt><dd>{ownerName(finding.owner_id)}</dd></div>
      <div><dt>الاستحقاق</dt><dd>{formatComplianceDate(finding.due_date)}{finding.due_date&&finding.due_date<todayRiyadh()&&finding.status!=='closed'&&<span className="findings-overdue"> · متأخرة</span>}</dd></div>
      <div><dt>الحالة</dt><dd>{findingDisplayStatus(finding)}</dd></div></dl>
    <section className="findings-subsection" aria-label="مصدر الملاحظة وسياقها">
      <h3>المصدر والسياق</h3>
      {sourceState==='loading'?<p role="status">جاري التحقق من المصدر…</p>:sourceState==='unavailable'?<p className="findings-unavailable" role="status">سجل المصدر غير متاح أو خارج صلاحياتك. لا يمكن فتح مصدر بديل.</p>:<p>{sourceLabels[finding.source_type]} · السجل <b dir="ltr">#{finding.source_record_id}</b>{sourceHref&&<> · <Link href={sourceHref}>فتح بند التقييم المحدد ←</Link></>}{!sourceHref&&finding.source_type==='assessment'&&<span className="findings-context"> · لا يتوفر رابط دقيق لبند التقييم في هذا السياق.</span>}</p>}
      {(sourceContext.frameworkCode||finding.control_id)&&<p className="findings-context">{sourceContext.frameworkCode&&<>الإطار: {sourceContext.frameworkCode}</>}{finding.control_id&&sourceState==='loading'&&<> · <Link href={controlHref(finding.control_id,navigationContext,'findings')}>فتح الضابط المرتبط ←</Link></>}{finding.control_id&&sourceState!=='loading'&&sourceContext.controlAvailable&&<> · الضابط: <Link href={controlHref(finding.control_id,navigationContext,'findings')}>{sourceContext.controlCode} — {sourceContext.controlTitle}</Link></>}{finding.control_id&&sourceState!=='loading'&&!sourceContext.controlAvailable&&<> · الضابط المرتبط غير متاح ضمن صلاحياتك.</>}</p>}
      <small className="findings-context">تاريخ تحديد الملاحظة: {formatComplianceDate(finding.identified_date)}</small>
    </section>
    <div className="findings-section-heading"><h3>الإجراءات التصحيحية ({actions.length})</h3>
      {canFollow&&['open','in_treatment'].includes(finding.status)&&<button onClick={()=>setActionOpen(v=>!v)}>+ إضافة إجراء</button>}</div>
    <p className="findings-context">كل إجراء جزء من معالجة هذه الملاحظة؛ الإكمال لا يعني التحقق المستقل أو إغلاق الملاحظة.</p>
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
      <div className="findings-actions">{actions.map(action=><CorrectiveActionCard key={`${action.id}-${action.revision}-${focusedActionId===action.id}`}
        action={action} finding={finding} actor={actor} role={role} busy={busy}
        initiallyExpanded={focusedActionId===action.id}
        people={people} evidence={evidence} linkedEvidenceLabel={linkedEvidenceLabel} run={run}/>)}</div>}
    <section className="findings-subsection" aria-label="أدلة المعالجة والتحقق">
      <h3>الأدلة المرتبطة</h3>
      {finding.verification_evidence_id?<p>دليل تحقق الملاحظة: {linkedEvidenceLabel(finding.verification_evidence_id)}</p>:<p className="findings-context">لا يوجد دليل تحقق مرتبط بالملاحظة.</p>}
      {actions.some(action=>action.verification_evidence_id)&&<p className="findings-context">تظهر أدلة الإجراءات داخل كل إجراء مرتبط بها.</p>}
      <p className="findings-context">يُعرض الإصدار المرتبط بهذا القرار تحديدًا؛ لا يُستبدل بالإصدار الحالي عند وجود إصدار أحدث.</p>
      {evidenceError&&<p className="findings-unavailable">الأدلة المؤهلة غير متاحة الآن.</p>}
    </section>
    <section id="finding-decision" className="findings-subsection findings-verification" aria-label="التحقق المستقل">
      <h3>التحقق المستقل</h3>
      <p>حالة التحقق: <strong>{finding.verification_status==='accepted'?'مقبول':finding.verification_status==='rejected'?'مرفوض':finding.verification_status==='pending'?'بانتظار القرار':'لم يُقدم'}</strong></p>
      {finding.verified_by&&<p>المتحقق: {ownerName(finding.verified_by)}{finding.verified_at&&` · ${formatComplianceDate(finding.verified_at)}`}</p>}
      {finding.verification_reason&&<p>سبب قرار التحقق: {finding.verification_reason}</p>}
      {canFollow&&(finding.status==='open'||finding.status==='in_treatment'||finding.status==='pending_verification'&&canVerify&&finding.verification_status!=='accepted')&&<div className="findings-lifecycle">
      {(finding.status!=='pending_verification'||finding.verification_status!=='accepted')&&<label>سبب القرار<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>}
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
      </div>}
    </section>
    <section id="finding-closure" className="findings-subsection findings-closure" aria-label="إغلاق الملاحظة">
      <h3>الإغلاق</h3>
      {finding.status==='closed'?<p>أُغلقت الملاحظة بقرار منفصل{finding.closed_at&&` · ${formatComplianceDate(finding.closed_at)}`}{finding.closed_by&&` · بواسطة ${ownerName(finding.closed_by)}`}.</p>:<p className="findings-context">لا تُغلق الملاحظة تلقائيًا بعد إكمال الإجراءات أو اعتماد التحقق.</p>}
      {finding.closure_reason&&<p>سبب قرار الإغلاق: {finding.closure_reason}</p>}
      {canFollow&&finding.status==='pending_verification'&&finding.verification_status==='accepted'&&finding.verified_by===actor&&<div className="findings-lifecycle">
        <label>سبب قرار الإغلاق<textarea value={closureReason} onChange={e=>setClosureReason(e.target.value)}/></label>
        <button className="workflow-button workflow-primary" disabled={busy||!closureReason.trim()}
          onClick={()=>void run('close_finding',finding,{reason:closureReason})}>إغلاق بقرار مستقل</button>
      </div>}
    </section>
    {teamRole(role)&&<Link href="/audit">عرض سجل النشاط والتغييرات الكامل ←</Link>}
    {role==='nca_external_auditor'&&<p className="findings-hint">عرض تاريخي فقط ضمن نطاق التدقيق المصرّح به.</p>}
  </section>;
}

function CorrectiveActionCard({action,finding,actor,role,people=[],busy,evidence,linkedEvidenceLabel=()=>'',run,initiallyExpanded=false}:{
  action:CorrectiveAction;finding:SharedFinding;actor:string;role:UserRole;busy:boolean;
  initiallyExpanded?:boolean;
  people:Person[];linkedEvidenceLabel:(id:number)=>string;
  evidence:EvidenceOption[];run:(command:string,finding:SharedFinding,payload:Record<string,unknown>)=>Promise<boolean>;
}){
  const [note,setNote]=useState('');
  const [reason,setReason]=useState('');
  const [evidenceId,setEvidenceId]=useState('');
  const [expanded,setExpanded]=useState(initiallyExpanded);
  const [draft,setDraft]=useState({title:action.title,description:action.description,
    due_date:action.due_date??'',status:action.status});
  const canWork=teamRole(role)||(role==='control_owner'&&finding.owner_id===actor&&action.owner_id===actor);
  const canEdit=canWork&&['open','in_treatment'].includes(finding.status)
    &&action.status!=='completed';
  const canComplete=canWork&&['open','in_treatment'].includes(finding.status)&&action.status!=='completed';
  const canReview=teamRole(role)&&finding.status==='pending_verification'&&action.status==='completed'
    &&action.owner_id!==actor&&action.completed_by!==actor&&finding.created_by!==actor;
  const verificationLabel=action.verification_status==='accepted'?'مقبول':action.verification_status==='rejected'?'مرفوض':action.verification_status==='pending'?'بانتظار القرار':'لم يبدأ';
  const ownerLabel=action.owner_id===actor?'أنا':people.find(person=>person.user_id===action.owner_id)?.display_name??'مالك مسجل';
  const nextStep=action.status!=='completed'?'العمل التصحيحي لم يكتمل بعد':action.verification_status==='accepted'?'تم التحقق من الإجراء؛ حالة الملاحظة مستقلة':action.verification_status==='rejected'?'أُعيد الإجراء بعد التحقق':'بانتظار تحقق مستقل';
  return <article id={`finding-action-${action.id}`} className="findings-action-card"><header><div><h4>{action.title}</h4><p className="findings-context">إجراء تصحيحي تابع للملاحظة · <span dir="ltr">#{action.id}</span></p></div>
    <span className="findings-status">{action.status==='completed'?'مكتمل':actionStatusLabels[action.status]}</span></header>
    <dl className="findings-action-facts"><div><dt>المالك</dt><dd>{ownerLabel}</dd></div><div><dt>الاستحقاق</dt><dd>{formatComplianceDate(action.due_date)}</dd></div><div><dt>الإكمال</dt><dd>{action.completed_at?formatComplianceDate(action.completed_at):'لم يكتمل'}</dd></div><div><dt>التحقق</dt><dd>{verificationLabel}</dd></div></dl>
    <p className="findings-next-step">الخطوة التالية: {nextStep}</p>
    <details className="findings-action-details" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}>
      <summary aria-label={`${expanded?'إخفاء':'عرض'} تفاصيل الإجراء: ${action.title}`}>{expanded?'إخفاء التفاصيل':'عرض التفاصيل'}</summary>
      <div className="findings-action-detail-content">
    <p>{action.description}</p>
    {action.completion_note&&<p>إفادة الإكمال: {action.completion_note}</p>}
    {action.verification_reason&&<p>قرار التحقق: {action.verification_reason}</p>}
    {action.verification_evidence_id&&<p>الدليل المرتبط بهذا الإجراء: {linkedEvidenceLabel(action.verification_evidence_id)}</p>}
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
      <p className="findings-context">يعرض الخيار الإصدار المؤهل الآن؛ يحفظ القرار معرّف هذا الإصدار المحدد.</p>
      <button disabled={busy||!note.trim()} onClick={()=>void run('complete_action',finding,{action_id:action.id,action_revision:action.revision,completion_note:note,evidence_id:evidenceId||null})}>إكمال الإجراء</button>
    </div>}
    {canReview&&action.verification_status!=='accepted'&&<div className="findings-action-controls"><label>سبب التحقق<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <div className="findings-buttons"><button disabled={busy||!reason.trim()} onClick={()=>void run('verify_action',finding,{action_id:action.id,action_revision:action.revision,reason})}>قبول الإجراء</button>
        <button disabled={busy||!reason.trim()} onClick={()=>void run('reject_action',finding,{action_id:action.id,action_revision:action.revision,reason})}>إعادة الإجراء</button></div>
    </div>}
      </div>
    </details>
  </article>;
}

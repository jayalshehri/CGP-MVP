"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import { formatRiyadhDateTime, riyadhIsoDate } from "@/lib/dates";
import { readStrategyRows } from "@/lib/strategy-read";
import { NFCRM_RISK, likelihoodValues, nfcrmLevel, riskTone, severityValues } from "@/lib/register-methods";
import { applicableChecks, blockerCount, scopeComplete, accessLevels, kinds, stages, decisions, dataLevels, yesNo, type Scope, type CheckKey, type CheckValue } from "@/lib/third-party-assessment";
import { Area, Badge, DateCell, Drawer, Editor, Entry, Facts, Group, Input, RegisterScreen, Select, errorMessage, nullable, number, optionsFrom, opts, str, ui, type RecordRow } from "@/components/registers/RegisterUI";
import s from "./third-parties.module.css";

type Party = RecordRow & {
  name:string; service:string; relationship_owner:string|null; service_code:string|null; service_stage:string|null; contract_reference:string|null;
  risk_scenario:string|null; inherent_risk_score:number|null; residual_risk_score:number|null;
  assessment_status:string; decision:string; treatment_plan:string|null; next_review_date:string|null;
};
type Assessment = RecordRow & {
  service_id:number; state:"draft"|"submitted"|"decided"; scope:Scope; checks:Partial<Record<CheckKey,CheckValue>>;
  scenario:string|null; inherent_likelihood:number|null; inherent_impact:number|null; inherent_reason:string|null; inherent_score:number|null;
  expected_likelihood:number|null; expected_impact:number|null; expected_reason:string|null; expected_score:number|null;
  verified_likelihood:number|null; verified_impact:number|null; verified_reason:string|null; verified_reference:string|null; verified_score:number|null;
  decision:string|null; decision_authority:string|null; decision_reference:string|null; decision_reason:string|null; decided_at:string|null;
  condition_owner:string|null; condition_plan:string|null; condition_due:string|null; review_due:string|null;
  service_snapshot:{name:string;service:string;owner?:string;stage?:string;contract_reference?:string}|null;
  created_by:string; submitted_by:string|null; submitted_at:string|null; return_note:string|null;
};
type TableRow = Party & { assessment?:Assessment; history:Assessment[] };
type Mode = "new"|"edit"|"details"|"assess"|"decision"|"return";
const headings:Record<Mode,string>={new:"إضافة خدمة خارجية",edit:"تعديل بيانات الخدمة",details:"",assess:"تقييم مخاطر الخدمة",decision:"تسجيل القرار",return:"إعادة التقييم للتعديل"};
const legacyStates:Record<string,string>={draft:"مسودة",in_review:"قيد التقييم",completed:"مكتمل",expired:"منتهي"};
const scopedStatus=(r:TableRow)=>{
  const a=r.assessment;
  if(!a)return r.service_code?"لم يبدأ التقييم":"سجل سابق · يحتاج تقييمًا";
  if(a.state==="draft")return "مسودة تقييم";
  if(a.state==="submitted")return "بانتظار القرار";
  if(isOutdated(r))return "يحتاج إعادة تقييم";
  return decisions[a.decision??""]??"لم يُسجّل قرار";
};
function isOutdated(r:TableRow){
  const a=r.assessment?.service_snapshot;
  return !!a&&(a.name!==r.name||a.service!==r.service||a.contract_reference!==(r.contract_reference??null)||a.stage!==r.service_stage && r.service_stage==="renewal");
}
const nextDate=(a?:Assessment)=>a?.state==="decided"?(a.condition_due&&(!a.review_due||a.condition_due<a.review_due)?a.condition_due:a.review_due):null;
const recordDate=(r:TableRow)=>r.assessment?nextDate(r.assessment):r.next_review_date;
const impactValues: [string,string][] = severityValues.map(([key,label])=>[key,key==="5"?"5 — كارثي":label]);
const score=(v:number|null)=>v===null?"لم يُقيّم":`${nfcrmLevel(v)} · ${v}/25`;
const missingRole="tprm_role";
function messageFor(e:unknown){
  const textValue=e instanceof Error?e.message:e&&typeof e==="object"&&"message" in e?String(e.message):"";
  const errors:Record<string,string>={
    [missingRole]:"لا تملك صلاحية تنفيذ هذا الإجراء.",
    tprm_service:"أكمل مالك العلاقة ومرحلة التعاقد. لا يمكن تقييم خدمة منتهية.",
    tprm_scope:"أكمل فرز نطاق الخدمة وسجّل التقييم الكامن قبل الإرسال.",
    tprm_rating:"سجّل الاحتمالية والأثر معًا، وأضف مبرر التقييم. التحقق يتطلب مرجعًا.",
    tprm_blocker:"هناك متطلبات منطبقة غير مستوفاة أو لا يوجد لها مرجع. لا يمكن تسجيل اعتماد.",
    tprm_decision:"أضف صاحب الصلاحية ومرجع القرار ومبرره.",
    tprm_verification:"الاعتماد الكامل يتطلب تقييمًا متبقيًا بعد التحقق ومرجعًا له.",
    tprm_condition:"أكمل التقييم المتبقي والشروط والمسؤول والاستحقاق قبل موعد المراجعة.",
    tprm_review_due:"حدّد موعد مراجعة مستقبليًا.",
    tprm_independent:"يسجّل القرار مدير نظام مختلف عن معدّ التقييم ومرسله.",
    tprm_submission_locked:"التقييم قيد المراجعة. أعده للتعديل قبل تغيير بياناته.",
    tprm_immutable:"هذا القرار محفوظ في السجل ولا يمكن تعديله.",
    tprm_return:"اكتب سبب إعادة التقييم للتعديل.",
    tprm_transition:"حالة التقييم تغيّرت. حدّث السجل وأعد المحاولة.",
  };
  for(const [k,v] of Object.entries(errors))if(textValue.includes(k))return v;
  if(e&&typeof e==="object"&&"code" in e&&e.code==="23505")return "توجد دورة مفتوحة لهذه الخدمة. حدّث السجل.";
  return errorMessage(e);
}

async function read<T extends RecordRow>(table:string){
  const r=await readStrategyRows((from,to)=>supabase.from(table).select("*",{count:"exact"}).order("id").range(from,to),row=>Number((row as unknown as RecordRow).id));
  if(r.status!=="COMPLETE")throw new Error("read_incomplete");
  return r.data as unknown as T[];
}
async function write<T extends RecordRow>(table:string, values:Record<string,unknown>, prior?:T){
  await requireProfile(["admin","cybersecurity_team"]);
  const q=prior?supabase.from(table).update(values).eq("id",prior.id).eq("updated_at",prior.updated_at):supabase.from(table).insert(values);
  const {data,error}=await q.select("*").maybeSingle();
  if(error)throw error;
  if(!data)throw new Error("register_conflict");
  return data as T;
}

export default function ThirdPartiesPage(){
  const [parties,setParties]=useState<Party[]>([]),[assessments,setAssessments]=useState<Assessment[]>([]);
  const [account,setAccount]=useState<{id:string;role:string}|null>(null);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[revision,setRevision]=useState(0);
  const [current,setCurrent]=useState<number|null>(null),[mode,setMode]=useState<Mode|null>(null);
  const [newCycle,setNewCycle]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  useEffect(()=>{
    let live=true;
    void (async()=>{
      try {
        const session=await requireProfile(["admin","cybersecurity_team"]);
        const [p,a]=await Promise.all([read<Party>("third_parties"),read<Assessment>("third_party_service_assessments")]);
        if(live){setParties(p);setAssessments(a);setAccount({id:session.user.id,role:session.profile.role});setLoadError(false);}
      } catch {if(live)setLoadError(true);}
      finally {if(live)setLoading(false);}
    })();
    return ()=>{live=false;};
  },[revision]);
  const byId=new Map<number,Assessment[]>();
  for(const a of [...assessments].sort((a,b)=>b.id-a.id)){
    const values=byId.get(a.service_id)??[];values.push(a);byId.set(a.service_id,values);
  }
  const today=riyadhIsoDate();
  const late=(r:TableRow)=>r.service_stage!=="ended"&&!!recordDate(r)&&recordDate(r)!<today;
  const rows=parties.map(p=>{const history=byId.get(p.id)??[];return {...p,assessment:history[0],history};})
    .sort((a,b)=>Number(late(b))-Number(late(a))||Number(b.assessment?.state==="submitted")-Number(a.assessment?.state==="submitted")||b.id-a.id);
  const chosen=rows.find(r=>r.id===current);
  const a=chosen?.assessment;
  const displayedAssessment=mode==="assess"&&newCycle?undefined:a;
  const canReview=!!(a?.state==="submitted"&&account?.role==="admin"&&account.id!==a.submitted_by&&account.id!==a.created_by);
  const blocked=a?blockerCount(a.scope,a.checks):0;
  const begin=(m:Mode,id=current)=>{setMode(m);setCurrent(id);setError("");setNotice("");setNewCycle(false);};
  const dismiss=()=>{setCurrent(null);setMode(null);setError("");};
  const afterService=(p:Party)=>setParties(old=>old.some(x=>x.id===p.id)?old.map(x=>x.id===p.id?p:x):[...old,p]);
  const afterAssessment=(next:Assessment)=>setAssessments(old=>old.some(x=>x.id===next.id)?old.map(x=>x.id===next.id?next:x):[...old,next]);

  async function saveHeader(d:FormData){
    setBusy(true);setError("");
    try{
      const next=await write<Party>("third_parties",{ name:str(d,"name"),service:str(d,"service"),relationship_owner:str(d,"owner"),
        service_stage:str(d,"stage"),contract_reference:nullable(d,"contract") },mode==="edit"?chosen:undefined);
      afterService(next);begin("details",next.id);setNotice("تم حفظ بيانات الخدمة.");
    }catch(e){setError(messageFor(e));}finally{setBusy(false);}
  }
  async function saveAssessment(data:FormData, scope:Scope, checks:Assessment["checks"], submit:boolean){
    if(!chosen)return;
    if(submit&&(!scopeComplete(scope)||!number(data,"il")||!number(data,"ii")||!str(data,"scenario")||!str(data,"ir"))){
      setError("أكمل نطاق الخدمة والسيناريو والاحتمالية والأثر قبل الإرسال.");return;
    }
    const payload:Record<string,unknown>={
      scope,checks,scenario:nullable(data,"scenario"),inherent_likelihood:number(data,"il"),inherent_impact:number(data,"ii"),
      inherent_reason:nullable(data,"ir"),expected_likelihood:number(data,"el"),expected_impact:number(data,"ei"),expected_reason:nullable(data,"er"),
      verified_likelihood:number(data,"vl"),verified_impact:number(data,"vi"),verified_reference:nullable(data,"vr"),verified_reason:nullable(data,"vb"),
    };
    setBusy(true);setError("");
    try{
      const previous=displayedAssessment;
      let next=await write<Assessment>("third_party_service_assessments",
        previous?{...payload,state:submit?"submitted":"draft"}:{...payload,service_id:chosen.id},previous);
      afterAssessment(next);
      if(submit&&!previous){
        try{next=await write<Assessment>("third_party_service_assessments",{state:"submitted"},next);afterAssessment(next);}
        catch(e){setNewCycle(false);setError(messageFor(e));return;}
      }
      begin("details",chosen.id);setNotice(submit?"تم إرسال التقييم للمراجعة.":"تم حفظ مسودة التقييم.");
    }catch(e){setError(messageFor(e));}finally{setBusy(false);}
  }
  async function saveDecision(d:FormData) {
    if(!a||!canReview)return;
    setBusy(true);setError("");
    try{
      const next=await write<Assessment>("third_party_service_assessments",mode==="return"
        ?{state:"draft",return_note:str(d,"reason")}
        :{state:"decided",decision:str(d,"decision"),decision_authority:str(d,"authority"),decision_reference:str(d,"reference"),
          decision_reason:str(d,"reason"),review_due:nullable(d,"review"),condition_plan:nullable(d,"plan"),condition_owner:nullable(d,"owner"),condition_due:nullable(d,"due")},a);
      afterAssessment(next);begin("details",a.service_id);setNotice(mode==="return"?"أُعيد التقييم للتعديل.":"تم توثيق القرار في السجل.");
    }catch(e){setError(messageFor(e));}finally{setBusy(false);}
  }

  return <RegisterScreen title="مخاطر الأطراف الخارجية" description="تابع تقييم الخدمات وقرارات التعاقد ومواعيد المراجعة."
    rows={rows} loading={loading} error={loadError} reload={()=>{setLoading(true);setRevision(v=>v+1);}} notice={notice}
    add={account?{label:"إضافة خدمة خارجية",run:()=>begin("new",null)}:undefined}
    searchHint="اسم الطرف أو الخدمة أو المالك أو مرجع العقد"
    searchText={r=>[r.name,r.service,r.relationship_owner,r.service_code,r.contract_reference].join(" ")}
    quick={[{key:"pre",label:"قبل التعاقد",match:r=>r.service_stage==="pre_contract"},{key:"pending",label:"بانتظار القرار",match:r=>r.assessment?.state==="submitted"},
      {key:"late",label:"متابعة متأخرة",match:late},{key:"unassessed",label:"يحتاج تقييمًا",match:r=>r.service_stage!=="ended"&&(!r.assessment||isOutdated(r))}]}
    filters={[{label:"مرحلة العلاقة",options:[...opts(stages),["legacy","غير محددة"]],value:r=>r.service_stage??"legacy"},
      {label:"مالك العلاقة",options:optionsFrom(rows,r=>r.relationship_owner),value:r=>r.relationship_owner??""},
      {label:"الحالة أو القرار",options:optionsFrom(rows,scopedStatus),value:scopedStatus}]}
    columns={[
      {label:"الطرف والخدمة",view:r=><><Entry title={r.service} code={r.service_code??`سجل سابق ${r.id}`} open={()=>begin("details",r.id)}/><span className={ui.small}>{r.name}</span></>},
      {label:"مالك العلاقة",view:r=>r.relationship_owner??"غير معيّن"},
      {label:"الخطر المتبقي المتحقق",view:r=>r.assessment?.verified_score!=null&&!isOutdated(r)?
        <Badge value={score(r.assessment.verified_score)} tone={riskTone(r.assessment.verified_score,NFCRM_RISK)}/>:<Badge value="لم يُتحقق منه"/>},
      {label:"الحالة أو القرار",view:r=><><Badge value={scopedStatus(r)} tone={r.assessment?.state==="submitted"?"warn":r.assessment?.decision==="approved"&&!isOutdated(r)?"good":"neutral"}/>
        {r.assessment?.state==="submitted"&&blockerCount(r.assessment.scope,r.assessment.checks)>0&&<span className={s.flag}>متطلبات تمنع الاعتماد</span>}</>},
      {label:"الموعد القادم",view:r=><DateCell value={recordDate(r)} late={late(r)} label={r.assessment?.decision==="conditional"?"متابعة الشروط":!r.assessment&&r.next_review_date?"موعد سابق":undefined}/>},
    ]}>
    {(mode==="new"||mode==="edit")&&<Drawer key="header" title={headings[mode]} subtitle={chosen?.service_code??undefined} busy={busy} close={dismiss}>
      <Editor submit={saveHeader} close={dismiss} busy={busy} error={error} label="حفظ الخدمة">
        <div className={ui.fields}>
          <Input label="اسم الطرف الخارجي" name="name" value={chosen?.name} required maxLength={200}/>
          <Input label="الخدمة المقدمة" name="service" value={chosen?.service} required/>
          <Input label="مالك العلاقة" name="owner" value={chosen?.relationship_owner} required maxLength={200}/>
          <Select label="مرحلة التعاقد" name="stage" options={opts(stages)} value={chosen?.service_stage??"pre_contract"} required/>
        </div>
        <Group label="مرجع العقد أو طلب الشراء"><Input label="المرجع (إن وجد)" name="contract" value={chosen?.contract_reference}/></Group>
      </Editor>
    </Drawer>}
    {mode==="details"&&chosen&&<Drawer key="details" title={chosen.service} subtitle={chosen.service_code??undefined} close={dismiss}>
      <Facts entries={[["الطرف الخارجي",chosen.name],["مالك العلاقة",chosen.relationship_owner],["المرحلة",stages[chosen.service_stage??""]],["مرجع العقد",chosen.contract_reference],["الحالة",scopedStatus(chosen)],["الموعد القادم",<DateCell key="next" value={recordDate(chosen)} late={late(chosen)}/>]]}/>
      {isOutdated(chosen)&&<p className={s.blocker}>تغيّرت بيانات العلاقة أو بدأت مرحلة التجديد. القرار السابق مرجع تاريخي وليس اعتمادًا للتغييرات.</p>}
      {a?<AssessmentDetails a={a}/>:<p className={ui.note}>لا يوجد تقييم في المسار الجديد. حدّد نطاق الخدمة ثم سجّل تقييمها.</p>}
      {a?.state==="submitted"&&<p className={ui.note}>أُرسل في {formatRiyadhDateTime(a.submitted_at)}. يسجّل القرار مدير نظام مختلف عن معدّ التقييم ومرسله.</p>}
      {a?.return_note&&a.state==="draft"&&<p className={s.blocker}>سبب الإعادة للتعديل · {a.return_note}</p>}
      {chosen.history.filter(x=>x.id!==a?.id).length>0&&<Group label="التقييمات السابقة">
        <div className={s.history}>{chosen.history.filter(x=>x.id!==a?.id).map(h=><article key={h.id}>
          <h3>{decisions[h.decision??""]} · {formatRiyadhDateTime(h.decided_at)}</h3>
          <p>{h.decision_authority} · {h.decision_reference}</p><p>{h.decision_reason}</p>
          {h.condition_plan&&<p>{h.condition_plan} · {h.condition_owner} · <DateCell value={h.condition_due}/></p>}
        </article>)}</div>
      </Group>}
      {!chosen.service_code&&<Group label="البيانات السابقة">
        <div className={s.data}><Facts entries={[["الحالة السابقة",legacyStates[chosen.assessment_status]],["القرار السابق",decisions[chosen.decision]??"بانتظار القرار"],["الخطر الكامن السابق",chosen.inherent_risk_score],["المتبقي بالطريقة السابقة",chosen.residual_risk_score]]}/>
          <p>{chosen.risk_scenario}</p><p>{chosen.treatment_plan}</p><p className={ui.note}>لم تُرحّل الدرجات القديمة إلى التقييم المتحقق.</p>
        </div>
      </Group>}
      {account&&<div className={ui.actions}>
        {a?.state!=="submitted"&&<button className={ui.secondary} onClick={()=>begin("edit")}>تعديل بيانات الخدمة</button>}
        {chosen.service_stage&&chosen.service_stage!=="ended"&&a?.state!=="submitted"&&
          <button className={ui.primary} onClick={()=>{begin("assess");if(a?.state==="decided")setNewCycle(true);}}>{a?.state==="draft"?"إكمال التقييم":a?.state==="decided"?"بدء تقييم جديد":"بدء التقييم"}</button>}
        {canReview&&<><button className={ui.primary} onClick={()=>begin("decision")}>تسجيل القرار</button><button className={ui.secondary} onClick={()=>begin("return")}>إعادة للتعديل</button></>}
      </div>}
    </Drawer>}
    {mode==="assess"&&chosen&&<Drawer key="assess" title={headings[mode]} subtitle={chosen.service_code??undefined} busy={busy} close={dismiss}>
      <AssessmentEditor key={displayedAssessment?.id??"fresh"} initial={displayedAssessment} initialScope={newCycle?a?.scope:undefined} close={dismiss} busy={busy} error={error} save={saveAssessment}/>
    </Drawer>}
    {(mode==="decision"||mode==="return")&&chosen&&a&&canReview&&<Drawer key={mode} title={headings[mode]} subtitle={chosen.service_code??undefined} busy={busy} close={dismiss}>
      {mode==="return"?<Editor submit={saveDecision} close={dismiss} busy={busy} error={error} label="إعادة للتعديل"><Area name="reason" label="سبب الإعادة" required/></Editor>:
        <DecisionEditor a={a} blocked={blocked} close={dismiss} busy={busy} error={error} save={saveDecision}/>}
    </Drawer>}
  </RegisterScreen>;
}

function AssessmentDetails({a}:{a:Assessment}){
  const list=applicableChecks(a.scope);
  const blocked=blockerCount(a.scope,a.checks);
  return <>
    <Facts entries={[["الخطر الكامن",score(a.inherent_score)],["الخطر المتبقي المتوقع",score(a.expected_score)],["الخطر المتبقي بعد التحقق",score(a.verified_score)],["المنهجية","NFCRM‑1:2025"]]}/>
    <Group label="النطاق والتقييم">
      <div className={s.data}><Facts entries={[
        ["نوع الخدمة",kinds[a.scope.kind??""]],["الوصول",accessLevels[a.scope.access??""]],
        ["تصنيف البيانات",a.scope.data?dataLevels[a.scope.data_class??""]:"لا توجد بيانات ضمن النطاق"],
        ["النظام الحساس",a.scope.system_reference],["الاستضافة",a.scope.hosting_location],["المتعاقدون الفرعيون",a.scope.subcontractor_details],
        ["سيناريو الخطر",a.scenario],["مبرر التقييم الكامن",a.inherent_reason],["أساس المتبقي المتوقع",a.expected_reason],
        ["مرجع التحقق",a.verified_reference],["نتيجة التحقق",a.verified_reason]
      ]}/></div>
    </Group>
    <Group label={`المتطلبات والأدلة${blocked?` · ${blocked} غير مستوفاة`:""}`} open={a.state==="submitted"&&blocked>0?true:undefined}>
      <div className={s.checks}>
        {!list.length&&<p>لم تُحدد بنود إضافية من قائمة الفرز وفق هذا النطاق.</p>}
        {list.map(c=>{
          const v=a.checks[c.key],met=v?.status==="met"&&v.reference?.trim();
          return <article className={s.check} key={c.key}>
            <h3>{c.title} · <bdi>{c.reference}</bdi></h3>
            <Badge value={met?"مستوفى بمرجع":"يمنع الاعتماد"} tone={met?"good":"warn"}/>
            {v?.reference&&<p>{v.reference}</p>}
          </article>;
        })}
      </div>
    </Group>
    {a.state==="decided"&&<Group label="القرار والمتابعة" open>
      <div className={s.data}><Facts entries={[
        ["القرار",decisions[a.decision??""]],["صاحب الصلاحية / اللجنة",a.decision_authority],
        ["المرجع",a.decision_reference],["وقت التوثيق",formatRiyadhDateTime(a.decided_at)],["مبرر القرار",a.decision_reason],
        ["الشروط",a.condition_plan],["مسؤول الشروط",a.condition_owner],["استحقاق الشروط",<DateCell key="condition" value={a.condition_due}/>],
        ["المراجعة التالية",<DateCell key="review" value={a.review_due}/>],
      ]}/></div>
    </Group>}
  </>;
}

function AssessmentEditor({initial,initialScope,close,busy,error,save}:{
  initial?:Assessment;initialScope?:Scope;close:()=>void;busy:boolean;error:string;
  save:(form:FormData,scope:Scope,checks:Assessment["checks"],submit:boolean)=>void;
}){
  const [scope,setScope]=useState<Scope>(()=>initial?.scope??initialScope??{});
  const [checks,setChecks]=useState<Assessment["checks"]>(()=>initial?.checks??{});
  const list=applicableChecks(scope);
  const isManaged=scope.kind==="managed";
  const radioKeys = [
    ["data","هل يصل الطرف إلى بيانات الجهة أو يعالجها؟"],
    ["service_impact","هل يؤثر الطرف على استمرارية خدمة للجهة؟"],
    ["sensitive","هل الخدمة ضمن نطاق نظام حساس؟"],
    ["cloud","هل تشمل الخدمة استضافة أو حوسبة سحابية؟"],
    ["subcontractors","هل تشمل متعاقدين فرعيين؟"],
    ...(isManaged?[["remote_soc","هل تشمل تشغيلًا أو مراقبة أمنية عن بُعد؟"]]:[]),
  ] as [keyof Scope,string][];
  const updateScope=(delta:Partial<Scope>)=>setScope(x=>({...x,...delta}));
  const setCheck=(key:CheckKey,delta:Partial<CheckValue>)=>setChecks(old=>({...old,[key]:{status:"open",reference:"",...old[key],...delta}}));
  function changeKind(value:string){updateScope({kind:value,remote_soc:value==="managed"?scope.remote_soc:false});}
  return <form onSubmit={e=>{
    e.preventDefault();
    if(busy)return;
    const emit=(e.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="review";
    const sanitized:Scope={...scope,remote_soc:isManaged?scope.remote_soc:false,
      data_class:scope.data?scope.data_class:undefined,system_reference:scope.sensitive?scope.system_reference?.trim():undefined,
      hosting_location:scope.cloud?scope.hosting_location?.trim():undefined,
      subcontractor_details:scope.subcontractors?scope.subcontractor_details?.trim():undefined};
    const relevant=Object.fromEntries(list.filter(x=>checks[x.key]).map(x=>[x.key,checks[x.key]]));
    save(new FormData(e.currentTarget),sanitized,relevant,emit);
  }}>
    <fieldset className={ui.editor} disabled={busy}>
      <section className={s.fieldset} aria-label="نطاق الخدمة"><h3>١. نطاق الخدمة</h3>
        <div className={ui.fields}>
          <label>نوع الخدمة<select value={scope.kind??""} onChange={e=>changeKind(e.target.value)}><option value="">اختر النوع</option>{opts(kinds).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
          <label>مستوى الوصول<select value={scope.access??""} onChange={e=>updateScope({access:e.target.value})}><option value="">اختر المستوى</option>{opts(accessLevels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
          {radioKeys.map(([key,label])=><label key={key}>{label}<select value={String(scope[key]??"")} onChange={e=>updateScope({[key]:e.target.value===""?undefined:e.target.value==="true"})}>
            <option value="">لم يحدد</option>{yesNo.map(([k,v])=><option value={k} key={k}>{v}</option>)}
          </select></label>)}
          {scope.data&&<label>تصنيف البيانات<select value={scope.data_class??""} onChange={e=>updateScope({data_class:e.target.value})}><option value="">اختر التصنيف</option>{opts(dataLevels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>}
          {scope.sensitive&&<label>مرجع النظام الحساس<input maxLength={250} value={scope.system_reference??""} onChange={e=>updateScope({system_reference:e.target.value})}/></label>}
          {scope.cloud&&<label>موقع الاستضافة أو معالجة البيانات<input maxLength={250} value={scope.hosting_location??""} onChange={e=>updateScope({hosting_location:e.target.value})}/></label>}
          {scope.subcontractors&&<label className={ui.wide}>المتعاقدون الفرعيون ونطاقهم<textarea rows={2} maxLength={450} value={scope.subcontractor_details??""} onChange={e=>updateScope({subcontractor_details:e.target.value})}/></label>}
        </div>
      </section>
      <section className={s.fieldset} aria-label="التقييم الكامن"><h3>٢. التقييم الكامن</h3>
        <div className={ui.fields}>
          <Area label="سيناريو الخطر والسبب والأثر" name="scenario" value={initial?.scenario}/>
          <Select label="الاحتمالية الكامنة" name="il" options={likelihoodValues} value={initial?.inherent_likelihood} empty="غير مقيّمة"/>
          <Select label="الأثر الكامن" name="ii" options={impactValues} value={initial?.inherent_impact} empty="غير مقيّم"/>
          <Area label="مبرر تقدير الاحتمالية والأثر" name="ir" value={initial?.inherent_reason}/>
        </div>
      </section>
      <Group label="٣. المتبقي المتوقع وبعد التحقق">
        <p className={ui.wide}>سجّل المتوقع عند التخطيط. سجّل المتحقق فقط بعد مراجعة دليل الضوابط ونتيجتها.</p>
        <Select label="الاحتمالية المتوقعة" name="el" options={likelihoodValues} value={initial?.expected_likelihood} empty="غير مقيّمة"/>
        <Select label="الأثر المتوقع" name="ei" options={impactValues} value={initial?.expected_impact} empty="غير مقيّم"/>
        <Area label="أساس التقدير المتوقع" name="er" value={initial?.expected_reason}/>
        <Select label="الاحتمالية بعد التحقق" name="vl" options={likelihoodValues} value={initial?.verified_likelihood} empty="غير مقيّمة"/>
        <Select label="الأثر بعد التحقق" name="vi" options={impactValues} value={initial?.verified_impact} empty="غير مقيّم"/>
        <Input label="مرجع التحقق من الضوابط" name="vr" value={initial?.verified_reference}/>
        <Area label="نتيجة التحقق من الضوابط" name="vb" value={initial?.verified_reason}/>
      </Group>
      <Group label={`٤. المتطلبات والأدلة · ${list.length} بنود`}>
        <div className={s.checks}>{!list.length&&<p>أكمل نطاق الخدمة لتحديد البنود ذات العلاقة.</p>}{list.map(c=><article className={s.check} key={c.key}>
          <h3>{c.title} · <bdi>{c.reference}</bdi></h3>
          <div className={ui.fields}>
            <label>حالة البند<select value={checks[c.key]?.status??"open"} onChange={e=>setCheck(c.key,{status:e.target.value as CheckValue["status"]})}><option value="open">غير مستوفى</option><option value="met">مستوفى</option></select></label>
            <label>مرجع العقد أو الدليل<input maxLength={450} value={checks[c.key]?.reference??""} onChange={e=>setCheck(c.key,{reference:e.target.value})}/></label>
          </div>
        </article>)}</div>
      </Group>
    </fieldset>
    {error&&<p className={ui.danger} role="alert">{error}</p>}
    <div className={ui.formActions}>
      <button className={ui.primary} type="submit" value="review" disabled={busy}>إرسال للمراجعة</button>
      <button className={ui.secondary} type="submit" value="draft" disabled={busy}>حفظ مسودة</button>
      <button className={ui.secondary} type="button" disabled={busy} onClick={close}>إلغاء</button>
    </div>
  </form>;
}

function DecisionEditor({a,blocked,close,busy,error,save}:{
  a:Assessment;blocked:number;close:()=>void;busy:boolean;error:string;save:(f:FormData)=>void;
}){
  const [decision,setDecision]=useState("");
  const today=riyadhIsoDate();
  const acceptable=!blocked;
  return <Editor submit={save} close={close} busy={busy} error={error} label="توثيق القرار">
    {blocked>0&&<p className={s.blocker} role="status">{blocked} من المتطلبات المنطبقة بلا تحقق موثق. أعد التقييم للتعديل أو سجّل عدم الاعتماد.</p>}
    <div className={ui.fields}>
      <label>القرار<select name="decision" value={decision} onChange={e=>setDecision(e.target.value)} required>
        <option value="">اختر القرار</option>
        <option value="approved" disabled={!acceptable||a.verified_score===null}>معتمد</option>
        <option value="conditional" disabled={!acceptable||(a.verified_score===null&&a.expected_score===null)}>اعتماد مشروط</option>
        <option value="rejected">غير معتمد</option>
      </select></label>
      <Input label="اسم صاحب الصلاحية أو اللجنة" name="authority" required maxLength={200}/>
      <Input label="مرجع الاعتماد أو القرار" name="reference" required/>
      {decision&&decision!=="rejected"&&<Input label="موعد المراجعة القادمة" name="review" type="date" min={today} required/>}
      <Area label="مبرر القرار" name="reason" required/>
      {decision==="conditional"&&<>
        <Area label="شروط المعالجة والمتابعة" name="plan" required/>
        <Input label="المسؤول عن الشروط" name="owner" required maxLength={200}/>
        <Input label="استحقاق الشروط" name="due" type="date" min={today} required/>
      </>}
    </div>
  </Editor>;
}

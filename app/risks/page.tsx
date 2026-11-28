"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { riyadhIsoDate } from "@/lib/dates";
import { isCriticalOperationalRisk, isRiskTreatmentOverdue, riskNeedsAction } from "@/lib/operations-followup";
import { NFCRM_RISK, legacyLevel, likelihoodValues, recordId, riskLevel, riskTone, severityValues } from "@/lib/register-methods";
import { downloadRegister, riskHeaders } from "@/lib/register-exports";
import { Area, Badge, DateCell, Drawer, Editor, Entry, Facts, Group, Input, RegisterScreen, Select, assetOptions, errorMessage, nullable, number, optionsFrom, opts, str, ui, useRegister, type RecordRow } from "@/components/registers/RegisterUI";

type Risk = RecordRow & {
  risk_code:string; risk_title:string|null; risk_scope:string; risk_owner:string; risk_description:string; risk_method:string;
  identification_date:string; assessment_date:string|null; last_assessment_date:string|null; risk_cause:string|null; threat:string|null; risk_analysis:string|null;
  inherent_likelihood:number|null; inherent_impact:number|null; inherent_score:number|null; inherent_override:string|null;
  residual_likelihood:number|null; residual_impact:number|null; residual_score:number|null; residual_risk_description:string|null;
  treatment_result:string|null; treatment_type:string|null; treatment_owner:string|null; treatment_description:string|null; action_due_date:string|null; next_steps:string|null;
  asset_id:number|null; risk_status:string; notes:string|null; decision_reference:string|null; decision_reason:string|null; decision_review_date:string|null;
};
type Mode = "new"|"details"|"edit"|"measure"|"treatment"|"accept"|"close"|"reopen"|"matrix";
const scopes:Record<string,string> = {it_assets:"أصول تقنية",business_operations:"عمليات الأعمال",people:"العاملون"};
const states:Record<string,string> = {open:"مفتوح",treatment_in_progress:"قيد المعالجة",accepted:"مقبول",closed:"مغلق"};
const treatments:Record<string,string> = {mitigate:"الحد من المخاطر",avoid:"التجنب",transfer:"النقل",accept:"القبول"};
const scoreLabels:Record<string,string> = {very_low:"منخفض جدًا",low:"منخفض",medium:"متوسط",high:"مرتفع",critical:"حرج",not_applicable:"لا ينطبق"};
const title = (r:Risk) => r.risk_title || r.risk_description.slice(0,86) + (r.risk_description.length>86?"…":"");
const level = (r:Risk) => r.residual_score === null ? "لم يُعد تقييمه" : `${riskLevel(r.residual_score,r.risk_method)} · ${r.residual_score}/25`;
const needs = (r:Risk) => r.inherent_score === null && riskNeedsAction(r);
const highest = (r:Risk) => riskNeedsAction(r) && (r.residual_score ?? r.inherent_score ?? 0) >= (r.risk_method===NFCRM_RISK ? 15 : 11);
const state = (r:Risk) => needs(r)?"بانتظار التقييم":states[r.risk_status]??r.risk_status;
const headings:Record<Mode,string> = {new:"تسجيل خطر",details:"",edit:"تعديل بيانات الخطر",measure:"تقييم الخطر",treatment:"خطة المعالجة",accept:"توثيق قرار القبول",close:"إغلاق الخطر",reopen:"إعادة فتح الخطر",matrix:"تحليل المخاطر"};

export default function RisksPage() {
  return <Suspense fallback={<p role="status">جارٍ تحميل سجل المخاطر…</p>}><RiskRegister/></Suspense>;
}
function RiskRegister() {
  const params=useSearchParams();
  const riskId=recordId(params.get("risk")), assetId=recordId(params.get("asset")), focus=params.get("filter");
  const register=useRegister<Risk>("cyber_risks");
  const [selection,setSelection]=useState<number|null>(null);
  const [mode,setMode]=useState<Mode|null>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(""), [notice,setNotice]=useState("");
  const now=riyadhIsoDate();
  const all=register.rows.filter(r=>(!riskId||r.id===riskId)&&(!assetId||r.asset_id===assetId));
  const overdue=(r:Risk)=>isRiskTreatmentOverdue(r,now);
  const rows=[...all].sort((a,b)=>Number(overdue(b))-Number(overdue(a))||(b.residual_score??b.inherent_score??0)-(a.residual_score??a.inherent_score??0)||a.id-b.id);
  const chosen=register.rows.find(r=>r.id===selection);
  const asset=(id:number|null)=>register.assets.find(a=>a.id===id);
  const start=(next:Mode,id=selection)=>{setMode(next);setSelection(id);setError("");};
  const dismiss=()=>{setMode(null);setSelection(null);setError("");};
  const allowAccept=register.role==="admin";
  const locked=chosen?.risk_status==="accepted"||chosen?.risk_status==="closed";
  const refs=assetOptions(register.assets);

  async function save(data:FormData) {
    if (!mode || !["new","edit","measure","treatment","accept","close","reopen"].includes(mode)) return;
    if (mode!=="new"&&!chosen) return;
    const payload:Record<string,unknown>={};
    if(mode==="new"||mode==="edit"){
      Object.assign(payload,{risk_title:str(data,"title"),risk_scope:str(data,"scope"),risk_owner:str(data,"owner"),risk_description:str(data,"description")});
      if(!register.assetError) payload.asset_id=number(data,"asset");
      if(mode==="new") Object.assign(payload,{risk_method:NFCRM_RISK,identification_date:now});
    }
    if(mode==="measure"&&chosen){
      const stage=str(data,"stage");
      if(stage==="residual"){
        if(chosen.risk_method!==NFCRM_RISK||!chosen.inherent_score){setError("سجّل التقييم الكامن المحدث أولًا.");return;}
        Object.assign(payload,{residual_likelihood:number(data,"likelihood"),residual_impact:number(data,"impact"),residual_risk_description:str(data,"analysis"),treatment_result:str(data,"outcome"),last_assessment_date:now});
      } else {
        Object.assign(payload,{risk_method:NFCRM_RISK,risk_cause:str(data,"cause"),threat:str(data,"threat"),risk_analysis:str(data,"analysis"),inherent_likelihood:number(data,"likelihood"),inherent_impact:number(data,"impact"),assessment_date:now,last_assessment_date:now});
        if(chosen.risk_method!==NFCRM_RISK||chosen.inherent_likelihood!==payload.inherent_likelihood||chosen.inherent_impact!==payload.inherent_impact||chosen.risk_analysis!==payload.risk_analysis||chosen.risk_cause!==payload.risk_cause||chosen.threat!==payload.threat){
          Object.assign(payload,{residual_likelihood:null,residual_impact:null,residual_risk_description:null,treatment_result:null});
        }
      }
    }
    if(mode==="treatment"&&chosen) {
      const treatment=str(data,"treatment");
      Object.assign(payload,{treatment_type:treatment,treatment_description:str(data,"plan"),treatment_owner:str(data,"assignee"),action_due_date:str(data,"due"),next_steps:nullable(data,"next"),risk_status:treatment==="accept"?"open":"treatment_in_progress"});
    }
    if(mode==="accept") Object.assign(payload,{risk_status:"accepted",decision_reference:str(data,"reference"),decision_reason:str(data,"reason"),decision_review_date:str(data,"review")});
    if(mode==="close") Object.assign(payload,{risk_status:"closed",decision_reason:str(data,"reason")});
    if(mode==="reopen") Object.assign(payload,{risk_status:"open",decision_reason:str(data,"reason")});
    setBusy(true);setError("");
    try {const next=await register.save(payload,mode==="new"?undefined:chosen);start("details",next.id);setNotice("تم حفظ الخطر.");}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  function exportData(){
    downloadRegister("سجل المخاطر",`CGP-NCA-Risk-${now}.xlsx`,[riskHeaders,...rows.map(r=>[
      r.risk_code,scopes[r.risk_scope],r.risk_owner,r.identification_date,r.risk_description,r.risk_cause,r.threat,r.risk_analysis,r.assessment_date,
      r.inherent_likelihood,r.inherent_impact,r.inherent_score===null?null:legacyLevel(r.inherent_score),r.inherent_override?scoreLabels[r.inherent_override]:null,
      r.treatment_type?treatments[r.treatment_type]:null,r.treatment_description,r.treatment_owner,r.action_due_date,r.residual_risk_description,
      r.residual_likelihood,r.residual_impact,r.residual_score===null?null:legacyLevel(r.residual_score),r.next_steps,r.last_assessment_date,[r.notes,r.treatment_result,r.decision_reference,r.decision_reason].filter(Boolean).join("\n"),
    ])]);
  }
  return <RegisterScreen key={`${riskId??""}|${assetId??""}|${focus??""}`} title="سجل المخاطر" description="تابع تقييم المخاطر والمعالجات والقرارات المستحقة."
    rows={rows} loading={register.loading} error={register.error} reload={register.reload} notice={notice}
    initialQuick={focus==="critical"||focus==="overdue"?focus:"all"}
    add={register.manage?{label:"تسجيل خطر",run:()=>start("new",null)}:undefined}
    secondary={!register.loading&&!register.error&&<button className={ui.secondary} onClick={()=>start("matrix",null)}>تحليل المخاطر</button>}
    tools={<button type="button" className={ui.secondary} disabled={!rows.length} onClick={exportData}>تصدير قالب الهيئة</button>}
    context={(riskId||assetId)?<p className={ui.context}>{riskId?"الخطر المرتبط بالتنبيه":`مخاطر الأصل ${asset(assetId)?.name_ar??""}`} · <Link href="/risks">عرض السجل الكامل</Link></p>:undefined}
    quick={[{key:focus==="critical"?"critical":"priority",label:focus==="critical"?"حرجة ومفتوحة":"مرتفع فأعلى",match:focus==="critical"?isCriticalOperationalRisk:highest},{key:"overdue",label:"معالجة متأخرة",match:overdue},{key:"missing",label:"بانتظار التقييم",match:needs}]}
    filters={[{label:"الحالة",options:opts(states),value:r=>r.risk_status},{label:"نطاق الخطر",options:opts(scopes),value:r=>r.risk_scope},{label:"مالك الخطر",options:optionsFrom(rows,r=>r.risk_owner),value:r=>r.risk_owner},{label:"المستوى المتبقي",options:optionsFrom(rows,r=>riskLevel(r.residual_score,r.risk_method)),value:r=>riskLevel(r.residual_score,r.risk_method)}]}
    searchHint="عنوان الخطر أو رقمه أو مالكه" searchText={r=>[r.risk_title,r.risk_code,r.risk_description,r.risk_owner,asset(r.asset_id)?.name_ar].join(" ")}
    columns={[
      {label:"الخطر",view:r=><Entry title={title(r)} code={r.risk_code} open={()=>start("details",r.id)}/>},
      {label:"النطاق",mobile:false,view:r=>scopes[r.risk_scope]},
      {label:"مالك الخطر",view:r=>r.risk_owner},
      {label:"المستوى المتبقي",view:r=><Badge value={level(r)} tone={riskTone(r.residual_score,r.risk_method)}/>},
      {label:"الحالة",view:r=><Badge value={state(r)} tone={needs(r)?"warn":r.risk_status==="treatment_in_progress"?"info":"neutral"}/>},
      {label:"الموعد القادم",view:r=><DateCell value={r.risk_status==="accepted"?r.decision_review_date:r.action_due_date} late={overdue(r)} label={r.risk_status==="accepted"?"مراجعة القبول":undefined}/>},
    ]}>
    {mode==="matrix" && <Drawer title="تحليل المخاطر" close={dismiss}>
      <p>المصفوفة تعرض عدد المخاطر النشطة التي أُعيد تقييمها وفق NFCRM‑1:2025، ولا تخلطها بالتقييمات السابقة.</p>
      <div className={ui.matrix} aria-label="مصفوفة الأثر والاحتمالية">
        <span>احتمال / أثر</span>{[1,2,3,4,5].map(n=><span key={n}>{n}</span>)}
        {[5,4,3,2,1].map(l=><MatrixRow key={l} likelihood={l} rows={rows}/>)}
      </div>
      <p className={ui.note}>تقييمات أخرى أو لم تُحدّث بعد: {rows.filter(r=>riskNeedsAction(r)&&(r.risk_method!==NFCRM_RISK||r.residual_score===null)).length}</p>
    </Drawer>}
    {mode==="details"&&chosen&&<Drawer title={title(chosen)} subtitle={chosen.risk_code} close={dismiss}>
      <Facts entries={[["نطاق الخطر",scopes[chosen.risk_scope]],["مالك الخطر",chosen.risk_owner],["الحالة",state(chosen)],["الخطر المتبقي",level(chosen)],["الأصل المرتبط",asset(chosen.asset_id)?.name_ar??(chosen.asset_id?"أصل مرتبط":null)],["تاريخ التحديد",<DateCell key="id" value={chosen.identification_date}/>]]}/>
      <p>{chosen.risk_description}</p>
      {chosen.risk_method!==NFCRM_RISK&&<p className={ui.note}>تقييم سابق حسب قالب الهيئة. لم يُعد تصنيفه تلقائيًا.</p>}
      <Group label="التقييم والمعالجة"><div className={ui.wide}><Facts entries={[
        ["الخطر الكامن",chosen.inherent_score===null?"غير مقيّم":`${riskLevel(chosen.inherent_score,chosen.risk_method)} · ${chosen.inherent_score}/25`],
        ["سبب الخطر",chosen.risk_cause],["التهديد",chosen.threat],["التحليل والعواقب",chosen.risk_analysis],["الخطر المتبقي",chosen.residual_risk_description],
        ["خطة المعالجة",chosen.treatment_description],["نتيجة المعالجة أو الضوابط القائمة",chosen.treatment_result],["مسؤول المعالجة",chosen.treatment_owner],["الموعد",<DateCell key="due" value={chosen.action_due_date} late={overdue(chosen)}/>],
        ["الخطوات التالية",chosen.next_steps],["آخر تقييم",<DateCell key="review" value={chosen.last_assessment_date}/>],
        ["مرجع القرار",chosen.decision_reference],["مبرر القرار",chosen.decision_reason],["مراجعة القبول",<DateCell key="decision" value={chosen.decision_review_date}/>],
      ]}/></div></Group>
      {register.manage&&<div className={ui.actions}>
        {!locked&&<><button className={ui.primary} onClick={()=>start("measure")}>تقييم الخطر</button><button className={ui.secondary} onClick={()=>start("edit")}>تعديل البيانات</button>
          {chosen.inherent_score!==null&&<button className={ui.secondary} onClick={()=>start("treatment")}>خطة المعالجة</button>}
          {allowAccept&&chosen.risk_method===NFCRM_RISK&&chosen.treatment_type==="accept"&&chosen.residual_score!==null&&<button className={ui.secondary} onClick={()=>start("accept")}>توثيق قرار القبول</button>}
          {chosen.risk_status==="treatment_in_progress"&&chosen.risk_method===NFCRM_RISK&&chosen.residual_score!==null&&<button className={ui.secondary} onClick={()=>start("close")}>إغلاق الخطر</button>}</>}
        {locked&&<button className={ui.secondary} onClick={()=>start("reopen")}>إعادة فتح الخطر</button>}
      </div>}
    </Drawer>}
    {mode&&mode!=="matrix"&&mode!=="details"&&(mode==="new"||chosen)&&<Drawer title={headings[mode]} subtitle={chosen?.risk_code} busy={busy} close={dismiss}>
      <Editor submit={save} busy={busy} close={dismiss} error={error} label={mode==="new"?"حفظ الخطر":"حفظ التحديث"}>
        {(mode==="new"||mode==="edit")&&<div className={ui.fields}>
          <Input label="عنوان الخطر" name="title" value={chosen?.risk_title??(chosen?title(chosen):null)} required maxLength={200}/>
          <Select label="نطاق الخطر" name="scope" value={chosen?.risk_scope} options={opts(scopes)} empty="اختر النطاق" required/>
          <Input label="مالك الخطر" name="owner" value={chosen?.risk_owner} required maxLength={200}/>
          {register.assetError?<p className={ui.note}>تعذر تحميل الأصول. يمكنك تسجيل الخطر دون تغيير الربط.</p>:<Select label="الأصل المرتبط" name="asset" options={refs} value={chosen?.asset_id??assetId} empty="بدون ربط"/>}
          <Area label="وصف السيناريو وآثاره" name="description" value={chosen?.risk_description} required/>
        </div>}
        {mode==="measure"&&chosen&&<RiskMeasure key={chosen.id} risk={chosen}/>}
        {mode==="treatment"&&<div className={ui.fields}>
          <Select label="طريقة المعالجة" name="treatment" value={chosen?.treatment_type} options={opts(treatments)} empty="اختر المعالجة" required/>
          <Input label="مسؤول المعالجة" name="assignee" value={chosen?.treatment_owner} required/>
          <Input label="موعد المعالجة أو القرار" name="due" value={chosen?.action_due_date} type="date" required/>
          <Area label="خطة المعالجة" name="plan" value={chosen?.treatment_description} required/>
          <Area label="الخطوات التالية" name="next" value={chosen?.next_steps}/>
        </div>}
        {mode==="accept"&&<div className={ui.fields}><Input label="مرجع اعتماد صاحب الصلاحية" name="reference" required/><Input label="تاريخ مراجعة القبول" name="review" type="date" min={now} required/><Area label="مبرر القبول" name="reason" required/></div>}
        {(mode==="close"||mode==="reopen")&&<Area label={mode==="close"?"مبرر الإغلاق ودليله":"سبب إعادة الفتح"} name="reason" required/>}
      </Editor>
    </Drawer>}
  </RegisterScreen>;
}
function RiskMeasure({risk}:{risk:Risk}) {
  const [stage,setStage]=useState("inherent");
  const residual=stage==="residual";
  return <div className={ui.fields}>
    <label>مرحلة التقييم<select name="stage" value={stage} onChange={e=>setStage(e.target.value)}><option value="inherent">الخطر الكامن</option><option value="residual" disabled={risk.risk_method!==NFCRM_RISK||!risk.inherent_score||!risk.treatment_description}>الخطر المتبقي بعد المعالجة</option></select></label>
    <p className={ui.note}>منهجية التقييم الجديدة NFCRM‑1:2025. لا تُعبأ درجة افتراضيًا.</p>
    <Select key={stage+"l"} label="الاحتمالية" name="likelihood" options={likelihoodValues} empty="اختر الدرجة" value={risk.risk_method===NFCRM_RISK?(residual?risk.residual_likelihood:risk.inherent_likelihood):null} required/>
    <Select key={stage+"i"} label="الأثر" name="impact" options={severityValues} empty="اختر الدرجة" value={risk.risk_method===NFCRM_RISK?(residual?risk.residual_impact:risk.inherent_impact):null} required/>
    {!residual&&<><Input label="سبب الخطر" name="cause" value={risk.risk_method===NFCRM_RISK?risk.risk_cause:null} required/><Input label="التهديد" name="threat" value={risk.threat} required/></>}
    {residual&&<Area label="نتيجة المعالجة أو الضوابط القائمة ومرجعها" name="outcome" value={risk.treatment_result} required/>}
    <Area key={stage+"a"} label={residual?"وصف الخطر المتبقي ومبرر إعادة التقييم":"تحليل الخطر والعواقب ومبرر التقييم"} name="analysis" value={risk.risk_method===NFCRM_RISK?(residual?risk.residual_risk_description:risk.risk_analysis):null} required/>
  </div>;
}
function MatrixRow({likelihood,rows}:{likelihood:number;rows:Risk[]}) {
  return <><span>{likelihood}</span>{[1,2,3,4,5].map(i=><span aria-label={`الاحتمالية ${likelihood}، الأثر ${i}`} key={i} className={ui[riskTone(likelihood*i,NFCRM_RISK)]}>{rows.filter(r=>riskNeedsAction(r)&&r.risk_method===NFCRM_RISK&&r.residual_likelihood===likelihood&&r.residual_impact===i).length}</span>)}</>;
}

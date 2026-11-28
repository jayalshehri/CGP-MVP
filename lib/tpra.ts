import { applicableChecks, type Check, type Scope } from "./third-party-assessment";

export const cycleReasons: Record<string,string> = {initial:"تقييم أولي",renewal:"تجديد العقد",
  regulatory_change:"تغيّر متطلبات تنظيمية",scope_change:"تغيّر نطاق الخدمة",periodic:"مراجعة دورية"};
export const criticality: Record<string,string> = {low:"منخفضة",medium:"متوسطة",high:"عالية",critical:"حرجة"};

export type ContractFields = {
  contract_reference:string|null; contract_number:string|null; contract_signed_on:string|null; contract_document_ref:string|null;
};
export type CycleFields = {
  scope:Scope; rule_version:string; review_trigger:string|null; trigger_reference:string|null; decided_at:string|null;
  decision:string|null;
  verified_likelihood:number|null; verified_impact:number|null; verified_reason:string|null; verified_reference:string|null;
  scenario:string|null; inherent_likelihood:number|null; inherent_impact:number|null; inherent_reason:string|null;
  expected_likelihood:number|null; expected_impact:number|null; expected_reason:string|null;
  service_snapshot:Partial<ContractFields>&{stage?:string}|null;
};
type Key = Check["key"]|"contract_requirements"|"cloud_requirements"|"cloud_data"|"cloud_isolation"|"residual";
type Requirement = {key:Key;title:string;reference:string};
export type Evidence = {
  id:number; check_key:Key; document_title:string; document_ref:string; state:"pending"|"accepted"|"rejected";
  created_by:string; verified_by:string|null; verified_at:string|null; review_note:string|null;
  verification_context:Record<string,unknown>; updated_at:string;
};
export type Action = {
  id:number; description:string; owner:string; due_on:string; state:"open"|"to_verify"|"closed";
  closure_ref:string|null; review_note:string|null; completed_by:string|null; verified_by:string|null;
  completed_at:string|null; verified_at:string|null; updated_at:string;
};

export function requirements(scope:Scope, includeResidual=false):Requirement[]{
  const list:Requirement[]=[{key:"contract_requirements",title:"متطلبات الأمن السيبراني الموثّقة والمعتمدة للتعاقد",reference:"ECC 4-1-1"}];
  for(const item of applicableChecks(scope)){
    if(item.key==="cloud_review"){
      list.push(
        {key:"cloud_requirements",title:"اعتماد متطلبات الحوسبة السحابية والاستضافة وتطبيقها",reference:"ECC 4-2-1 · 4-2-2"},
        {key:"cloud_data",title:"تصنيف البيانات قبل الاستضافة وإعادتها بصيغة قابلة للاستخدام",reference:"ECC 4-2-3-1"},
        {key:"cloud_isolation",title:"فصل بيئة الجهة عن بيئات المشتركين الآخرين",reference:"ECC 4-2-3-2"},
      );
    }
    list.push(item);
  }
  if(includeResidual)list.push({key:"residual",title:"نتيجة التحقق من الضوابط والخطر المتبقي",reference:"NFCRM-1:2025"});
  return list;
}
const ordered=(v:unknown):unknown=>v&&typeof v==="object"&&!Array.isArray(v)?
  Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,w])=>[k,ordered(w)])):v;
export function evidenceMatches(e:Evidence,a:CycleFields,p:ContractFields){
  const expected:Record<string,unknown>={scope:a.scope,contract:p.contract_number??null,reference:p.contract_reference??null,
    contract_document:p.contract_document_ref??null,trigger:a.review_trigger??null,trigger_reference:a.trigger_reference??null};
  if(e.check_key==="risk_controls"||e.check_key==="residual")Object.assign(expected,{
    risk:a.scenario,inherent_likelihood:a.inherent_likelihood,inherent_impact:a.inherent_impact,
    inherent_reason:a.inherent_reason,expected_likelihood:a.expected_likelihood,expected_impact:a.expected_impact,expected_reason:a.expected_reason,
    residual_likelihood:a.verified_likelihood,residual_impact:a.verified_impact,
    residual_reason:a.verified_reason,residual_reference:a.verified_reference,
  });
  return JSON.stringify(ordered(e.verification_context))===JSON.stringify(ordered(expected));
}
export function pendingRequirements(a:CycleFields,p:ContractFields,evidence:Evidence[]){
  return requirements(a.scope,a.verified_likelihood!=null).filter(c=>!evidence.some(e=>
    e.check_key===c.key&&e.state==="accepted"&&evidenceMatches(e,a,p))).length;
}

export const timingLabels:Record<string,string>={
  pending:"بانتظار تقييم ما قبل التوقيع", before_signature:"التقييم موثّق والعقد لم يُسجّل توقيعه",
  signature_missing:"تاريخ التوقيع أو مرجعه غير مسجّل", confirmed:"تقييم موثّق قبل التوقيع",
  same_day:"نفس اليوم · ترتيب التقييم والتوقيع غير مثبت", late:"التقييم الموثّق بعد التوقيع",
  missing:"لا يوجد تقييم موثّق قبل التوقيع",
};
const isoDay=(utc:string)=>new Intl.DateTimeFormat("en-CA",{calendar:"gregory",timeZone:"Asia/Riyadh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(utc));
const specialist=(scope:Scope)=>scope.kind==="outsourcing"||scope.kind==="managed";
type ServiceTiming = ContractFields & {service_stage:string|null};
export function signingTrace(p:ServiceTiming,history:CycleFields[]){
  if(!history.some(a=>specialist(a.scope)))return null;
  const anchors=[p.contract_number,p.contract_reference].filter(Boolean);
  const proofs=history.filter(a=>a.rule_version==="cgp_tprm_v2"&&specialist(a.scope)
    && (a.review_trigger==="initial"||a.review_trigger==="renewal")
    && (!!a.decided_at)&&(a.decision==="approved"||a.decision==="conditional")
    && (p.service_stage!=="renewal"||a.review_trigger==="renewal")
    && (a.service_snapshot?.contract_number?
      a.service_snapshot.contract_number===p.contract_number:
      !!a.service_snapshot?.contract_reference&&anchors.includes(a.service_snapshot.contract_reference)))
    .map(a=>a.decided_at!).sort();
  if(!p.contract_signed_on||!p.contract_document_ref){
    if(p.service_stage==="active"||p.service_stage==="ended")return {key:"signature_missing"};
    return proofs.length?{key:"before_signature",at:proofs[0]}:{key:"pending"};
  }
  const at=proofs[0];
  if(!at)return {key:"missing"};
  const date=isoDay(at);
  return {key:date<p.contract_signed_on?"confirmed":date===p.contract_signed_on?"same_day":"late",at};
}

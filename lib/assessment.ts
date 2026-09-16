export type AssessmentStatus='implemented'|'partially_implemented'|'not_implemented'|'not_applicable';
export type AssessmentCycle={id:number;framework_id:number;framework_version:string;scope_name:string;system_id:number|null;previous_cycle_id:number|null;status:string;assessor_id:string|null;reviewer_id:string|null;approver_id:string|null;due_date:string|null;next_review_date:string|null;scope_confirmed_at:string|null;scope_reason:string|null;revision:number;imported:boolean;created_at:string;approved_at:string|null};
export type AssessmentItem={id:number;cycle_id:number;control_id:number;control_code:string;title_ar:string;description_ar:string|null;domain_ar:string;subdomain_code:string;is_scoring:boolean;owner_id:string|null;compliance_status:AssessmentStatus|null;notes:string|null;corrective_action:string|null;expected_compliance_date:string|null;review_status:string;review_reason:string|null;reviewed_by:string|null;reviewed_at:string|null;revision:number;updated_at:string;legacy_source:unknown};
export type AssessmentFinding={id:number;item_id:number;control_id:number;title:string;severity:string;owner_id:string|null;due_date:string|null;action_plan:string|null;status:string;project_id:number|null;revision:number;verification_reason:string|null;verified_at:string|null};
export type Person={user_id:string;display_name:string|null;role:string};
export const assessmentLabels:Record<string,string>={implemented:'مطبق كليًا',partially_implemented:'مطبق جزئيًا',not_implemented:'غير مطبق',not_applicable:'لا ينطبق'};
export const cycleLabels:Record<string,string>={draft:'مسودة',in_progress:'قيد التقييم',evidence_collection:'جمع الأدلة',under_review:'تحت المراجعة',completed:'جاهز للاعتماد',approved:'معتمد',closed:'مغلق'};
export const reviewLabels:Record<string,string>={pending:'بانتظار المراجعة',accepted:'مقبول',changes_requested:'يحتاج استكمالًا'};
export const cycleColumns='id,framework_id,framework_version,scope_name,system_id,previous_cycle_id,status,assessor_id,reviewer_id,approver_id,due_date,next_review_date,scope_confirmed_at,scope_reason,revision,imported,created_at,approved_at';
export function assessmentMetrics(items:AssessmentItem[],approved:boolean){
 const rows=items.filter(i=>i.is_scoring); const total=rows.length;
 const assessed=rows.filter(i=>i.compliance_status!==null).length;
 const reviewed=rows.filter(i=>i.review_status==='accepted').length;
 const na=approved?rows.filter(i=>i.review_status==='accepted'&&i.compliance_status==='not_applicable').length:0;
 const applicable=total-na;
 const compliant=approved?rows.filter(i=>i.review_status==='accepted'&&i.compliance_status==='implemented').length:0;
 return {total,assessed,reviewed,na,applicable,compliant,unassessed:total-assessed,
  completion:total?assessed/total*100:null,compliance:approved&&applicable?compliant/applicable*100:null,
  missing:rows.filter(i=>!i.compliance_status||!i.notes?.trim()||(['not_implemented','partially_implemented'].includes(i.compliance_status)&&(!i.owner_id||!i.expected_compliance_date||!i.corrective_action?.trim()))).length};
}
export function displayPercent(n:number|null){return n===null?'—':`${Math.round(n)}%`;}

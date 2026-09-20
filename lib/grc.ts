export type EvidenceRecord = {
 id:number; control_id:number; source_control_id:number; link_id:number|null; evidence_name:string|null;
 file_name:string|null; file_path:string|null; description:string|null; status:string; is_current:boolean;
 version_number:number; evidence_group:string; uploaded_at:string; reviewed_at:string|null; review_notes:string|null;
 valid_until:string|null; uploader_name:string|null; reviewer_display_name:string|null; uploaded_by:string|null; assigned_reviewer:string|null;
};
export type ReviewCycle = {id:number;control_id:number;owner_id:string;reviewer_id:string;due_date:string;status:string;frequency:string;completed_at:string|null;notes:string|null};
export type EvidenceRequest = {id:number;control_id:number;cycle_id:number;requirement:string;due_date:string;status:string;reviewer_id:string;requested_from:string};
export const frequencyLabels:Record<string,string>={monthly:'شهري',quarterly:'ربع سنوي',semiannual:'نصف سنوي',annual:'سنوي',custom:'مخصص'};
export const requestLabels:Record<string,string>={open:'بانتظار التقديم',submitted:'بانتظار المراجعة',changes_requested:'يحتاج استكمالًا',accepted:'مقبول',rejected:'مرفوض',cancelled:'ملغى'};
export function todayRiyadh(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date());}
export function isExpired(value:string|null){return !!value&&value<todayRiyadh();}

// Single source of truth for date-proximity scheduling state, shared by the
// Audit Schedule page and Control Detail so both surfaces always agree on
// what "overdue"/"due soon" means. Anchored to Asia/Riyadh's calendar date,
// never the browser's local timezone -- date-only strings compare lexically
// and the +30-day window is computed via UTC date arithmetic on a
// noon-Riyadh-anchored Date, so DST-less Riyadh offsets never shift the day.
export type ScheduleState='overdue'|'due_today'|'due_soon'|'upcoming'|'unscheduled';
export const scheduleStateLabels:Record<ScheduleState,string>={overdue:'متأخر',due_today:'مستحق اليوم',due_soon:'مستحق قريبًا',upcoming:'قادم',unscheduled:'غير مجدول'};
export function scheduleState(date:string|null,dueSoonDays=30):ScheduleState{
 if(!date)return 'unscheduled';
 const today=todayRiyadh();
 if(date<today)return 'overdue';
 if(date===today)return 'due_today';
 const limit=new Date(`${today}T12:00:00+03:00`);limit.setUTCDate(limit.getUTCDate()+dueSoonDays);
 return date<=limit.toISOString().slice(0,10)?'due_soon':'upcoming';
}

// Current review-cycle lifecycle stage for one control -- orthogonal to
// ScheduleState (a control can be simultaneously "متأخر" on its date AND
// have "دورة مفتوحة" open with evidence already "قيد المراجعة"). Derived
// only from already-governed data (control_review_cycles + evidence_requests
// status), never a second stored status.
export type CycleStage='none'|'awaiting_evidence'|'under_review'|'changes_requested';
export const cycleStageLabels:Record<CycleStage,string>={none:'—',awaiting_evidence:'دورة مفتوحة · بانتظار الدليل',under_review:'قيد المراجعة',changes_requested:'يحتاج استكمالًا'};
export function cycleStage(hasOpenCycle:boolean,latestRequestStatus:string|undefined):CycleStage{
 if(!hasOpenCycle)return 'none';
 if(latestRequestStatus==='submitted')return 'under_review';
 if(latestRequestStatus==='changes_requested'||latestRequestStatus==='rejected')return 'changes_requested';
 return 'awaiting_evidence';
}
export function formatGrcDate(value:string|null){return value?new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(value.length===10?`${value}T12:00:00+03:00`:value)):'—';}
export function csvDownload(name:string,rows:(string|number)[][]){
 const quote=(value:string|number)=>{let text=String(value);if(/^[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

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
// Presentation-only Gregorian dates for compliance surfaces. Date-only values
// are anchored at Riyadh noon so browser time zones cannot shift the day.
export function formatComplianceDate(value:string|null,compact=false){
 if(!value)return '—';
 const date=new Date(value.length===10?`${value}T12:00:00+03:00`:value);
 if(Number.isNaN(date.getTime()))return '—';
 const formatter=new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',compact?{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Riyadh'}:{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'});
 if(!compact)return formatter.format(date);
 const parts=Object.fromEntries(formatter.formatToParts(date).filter(part=>part.type==='day'||part.type==='month'||part.type==='year').map(part=>[part.type,part.value]));
 return `${parts.day}/${parts.month}/${parts.year}`;
}
export function parseComplianceDateInput(value:string):string|null{
 const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
 if(!match)return null;
 const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
 if(year<1000)return null;
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return `${match[3]}-${match[2]}-${match[1]}`;
}
export function formatComplianceDateTime(value:string|null){
 if(!value)return '—';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '—';
 return `${formatComplianceDate(value)} · ${new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'}).format(date)}`;
}
export function csvDownload(name:string,rows:(string|number)[][]){
 const quote=(value:string|number)=>{let text=String(value);if(/^[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

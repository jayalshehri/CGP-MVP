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
export function formatGrcDate(value:string|null){return value?new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date(value.length===10?`${value}T12:00:00+03:00`:value)):'—';}
export function csvDownload(name:string,rows:(string|number)[][]){
 const quote=(value:string|number)=>{let text=String(value);if(/^[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

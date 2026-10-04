'use client';
import Link from 'next/link';
import {useId, useState} from 'react';
import EvidenceDownload from '@/components/EvidenceDownload';
import StatusBadge from '@/components/StatusBadge';
import {formatComplianceDate, isExpired} from '@/lib/grc';

export type EvidenceRegisterRow = {
  id:number; control_id:number; version_number:number; is_current:boolean;
  evidence_name:string|null; file_name:string|null; file_path:string|null;
  status:string|null; valid_until:string|null; uploaded_at:string|null;
  uploader_name:string|null; description:string|null; reviewed_at:string|null;
  reviewer_display_name:string|null; review_notes:string|null;
  association:'direct'|'shared'; framework_code:string; target_control_code:string;
  control?:{title_ar:string; control_owner:string|null};
};

export default function EvidenceRegister({rows,canReview}:{rows:EvidenceRegisterRow[];canReview:boolean}) {
  return <div className="evidence-table-scroll"><table className="evidence-table">
    <caption className="evidence-register-caption">سجل الأدلة والإصدارات — افتح تفاصيل الدليل لعرض بيانات الرفع والقرار.</caption>
    <colgroup><col className="evidence-name-column"/><col className="evidence-control-column"/><col/><col/><col className="evidence-action-column"/></colgroup>
    <thead><tr><th scope="col">الدليل والإصدار</th><th scope="col">الضابط والإطار</th><th scope="col">حالة المراجعة</th><th scope="col">الصلاحية</th><th scope="col">الإجراءات</th></tr></thead>
    <tbody>{!rows.length?<tr><td colSpan={5} className="evidence-empty">لا توجد أدلة مطابقة حاليًا.</td></tr>:rows.map(row=><EvidenceEntry key={`${row.id}-${row.control_id}-${row.association}`} row={row} canReview={canReview}/>)}</tbody>
  </table></div>;
}

function EvidenceEntry({row,canReview}:{row:EvidenceRegisterRow;canReview:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const detailId=useId();
  const name=row.evidence_name||row.file_name||`دليل ${row.id}`;
  const reviewable=canReview&&row.is_current&&['pending_review','under_review'].includes(row.status||'');
  return <>
    <tr className="evidence-summary-row">
      <td className="evidence-primary"><strong>{name}</strong><small dir="auto">{row.file_name||'اسم الملف غير موثق'}</small>
        <span className="evidence-version">الإصدار <b dir="ltr">{row.version_number}</b>{!row.is_current&&' · إصدار سابق'}</span>
        <button type="button" className="evidence-disclosure" aria-expanded={expanded} aria-controls={detailId} onClick={()=>setExpanded(!expanded)}>{expanded?'إخفاء التفاصيل':'تفاصيل الدليل'} <span aria-hidden="true">{expanded?'−':'+'}</span></button>
      </td>
      <td><Link className="evidence-control-link" href={`/controls/${row.control_id}`}><b dir="ltr">{row.framework_code} · {row.target_control_code}</b><span>{row.control?.title_ar||'فتح الضابط'}</span></Link></td>
      <td><StatusBadge status={row.status||''}/></td>
      <td><span className={`evidence-validity${isExpired(row.valid_until)?' evidence-validity-expired':''}`}>{row.valid_until?formatComplianceDate(row.valid_until,true):'غير محددة'}{isExpired(row.valid_until)&&<small>منتهية الصلاحية</small>}</span></td>
      <td><div className="evidence-actions"><EvidenceDownload path={row.file_path} name={row.file_name}/>{reviewable&&<Link className="evidence-review-link" href={`/review#evidence-${row.id}`}>مراجعة ←</Link>}</div></td>
    </tr>
    <tr className="evidence-detail-row" hidden={!expanded}><td colSpan={5}>
      <section id={detailId} className="evidence-detail-panel" aria-label={`تفاصيل الدليل: ${name}`}>
        <div><h3>بيانات الدليل</h3><dl><div><dt>تاريخ الرفع</dt><dd>{formatComplianceDate(row.uploaded_at)}</dd></div><div><dt>رافع الدليل</dt><dd>{row.uploader_name||'غير موثق بالاسم'}</dd></div><div><dt>مالك الضابط</dt><dd>{row.control?.control_owner||'غير معيّن'}</dd></div><div><dt>نوع الربط</dt><dd>{row.association==='shared'?'دليل مشترك عبر مواءمة معتمدة':'دليل مباشر'}</dd></div></dl></div>
        <div><h3>الوصف</h3><p>{row.description||'لا يوجد وصف مسجل.'}</p></div>
        <div><h3>قرار المراجعة</h3>{row.reviewed_at?<dl><div><dt>تاريخ القرار</dt><dd>{formatComplianceDate(row.reviewed_at)}</dd></div><div><dt>المراجع</dt><dd>{row.reviewer_display_name||'مسجل في سجل القرار'}</dd></div><div><dt>ملاحظات المراجعة</dt><dd>{row.review_notes||'لا توجد'}</dd></div></dl>:<p>لا يوجد قرار مراجعة مسجل لهذا الإصدار.</p>}</div>
      </section>
    </td></tr>
  </>;
}

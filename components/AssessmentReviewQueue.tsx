'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadAssessmentReviewQueue, type ReviewAssessmentItem } from '@/lib/assessment-journey-read';
import { assessmentItemHref } from '@/lib/assessment-journey';
import { reviewLabels } from '@/lib/assessment';

export default function AssessmentReviewQueue({ actor }: { actor: string }) {
  const [rows, setRows] = useState<ReviewAssessmentItem[] | null>(null);
  const [error, setError] = useState(false), [reload, setReload] = useState(0);
  const [filter, setFilter] = useState('pending'), [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    void loadAssessmentReviewQueue(actor).then(result => { if (active) { setRows(result); setError(false); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [actor, reload]);
  const visible = (rows ?? []).filter(row => !filter || row.review_status === filter);
  const displayPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 10) - 1));
  return <section id="assessment-review" className="ae-card" aria-label="مراجعة بنود التقييم">
    <h2>بنود التقييم المسندة إليّ</h2><p>الدورات قيد المراجعة التي عُيّنت مراجعًا لها؛ قرار البند يُتخذ داخل مساحة التقييم.</p>
    {error ? <p role="alert">تعذر تحميل بنود المراجعة. <button onClick={() => setReload(value => value + 1)}>إعادة المحاولة</button></p> : rows === null ? <p role="status">جاري تحميل بنود المراجعة…</p> : <>
      <label>حالة مراجعة البند<select value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}><option value="">كل البنود المسندة</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!visible.length ? <p className="workflow-empty">لا توجد بنود تقييم ضمن حالة المراجعة المختارة.</p> : <div className="ae-table-wrap"><table className="ae-table"><thead><tr><th>الإطار / الدورة</th><th>الضابط / المتطلب</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{visible.slice(displayPage * 10, displayPage * 10 + 10).map(row => {
        const href = assessmentItemHref(row.cycle.framework.code, row.cycle_id, row.id, new URLSearchParams({ from: 'review', ...(filter ? { review: filter } : {}) }).toString());
        return <tr key={row.id}><td>{row.cycle.framework.code} · #{row.cycle_id}<p>{row.cycle.scope_name}</p></td><td><b dir="ltr">{row.control_code}</b><p>{row.title_ar}</p></td><td>{reviewLabels[row.review_status]}</td><td>{href && <Link href={href}>مراجعة البند ←</Link>}</td></tr>;
      })}</tbody></table></div>}
      <div className="grc-inline-actions"><button disabled={!displayPage} onClick={() => setPage(displayPage - 1)}>السابق</button><span>{displayPage + 1} / {Math.max(1, Math.ceil(visible.length / 10))}</span><button disabled={(displayPage + 1) * 10 >= visible.length} onClick={() => setPage(displayPage + 1)}>التالي</button></div>
    </>}
  </section>;
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { formatComplianceDate, todayRiyadh } from '@/lib/grc';
import { cycleLabels, reviewLabels } from '@/lib/assessment';
import { loadReviewWorkSnapshot, refreshReviewEvidenceSnapshot } from '@/lib/review-work-queue-read';
import { canOfferInlineEvidence } from '@/lib/review-decision-safety';
import ReviewEvidenceDecision from './ReviewEvidenceDecision';
import ReviewCenterTabs from './ReviewCenterTabs';
import type { DecisionResult } from '@/lib/review-evidence-decision';
import type { ReviewActor, ReviewSnapshot, ReviewWorkItem } from '@/lib/review-work-queue';
import { buildReviewWorkQueue, filterReviewWork, responsibilityLabels, reviewFilters, reviewWorkHref, reviewWorkPage, reviewWorkSummary, sortReviewWork, workDecisionModes, workTypeLabels, type CategoryResult } from '@/lib/review-work-queue';
import { reviewQueueContext } from '@/lib/review-context';
import './review-work-queue-refinement.css';

const stateLabels: Record<string, string> = { ...cycleLabels, ...reviewLabels, open: 'مفتوحة', pending: 'بانتظار التحقق', pending_review: 'بانتظار مراجعة الدليل', under_review: 'قيد المراجعة', accepted: 'مقبول — ينتظر الإغلاق' };
export function ReviewQueueView({ categories, raw, update, actor, onReview, certificationMode = false }: { categories: CategoryResult[]; raw: string; update: (key: string, value: string) => void; actor?: ReviewActor; onReview?: (item: ReviewWorkItem) => void; certificationMode?: boolean }) {
  const today = todayRiyadh(), params = reviewFilters(raw);
  const items = sortReviewWork(categories.flatMap(c => c.items), today);
  const summary = reviewWorkSummary(categories, today);
  const visible = filterReviewWork(items, raw, today), paged = reviewWorkPage(visible, Number(params.get('page') ?? 1));
  const frameworks = [...new Set(items.map(item => item.framework).filter((value): value is string => !!value))].sort();
  const states = [...new Set(items.map(item => item.state))].sort();
  const errors = categories.filter(c => c.status === 'unavailable');
  const activeFilters = ['type', 'framework', 'responsibility', 'state', 'due'].some(key => params.has(key));
  const metrics = [
    { label: 'مراجعة', detail: 'أدلة وبنود ودورات تنتظر المراجعة', value: summary.review },
    { label: 'اعتماد', detail: 'دورات تنتظر قرار الاعتماد', value: summary.approval },
    { label: 'تحقق', detail: 'إجراءات وملاحظات تحتاج تحققًا', value: summary.verification },
    { label: 'إغلاق', detail: 'ملاحظات تنتظر قرار الإغلاق', value: summary.closure },
  ];
  return <>
    <section className="review-summary-panel" aria-label="ملخص الأعمال المؤهلة قبل الفلاتر">
      <div className="review-summary-heading"><h2>ملخص أعمال المراجعة</h2><p>الأعمال التي يمكنك مراجعتها أو اتخاذ قرار بشأنها وفق صلاحياتك الحالية.</p><p>الملخص قبل فلاتر القائمة. هذه أنواع قرارات مستقلة، وليست مراحل تمر بها كل السجلات.</p></div>
      <div className="review-summary-layout"><div className="review-queue-summary" role="group" aria-label="أنواع أعمال المراجعة والقرار">
        {metrics.map(({ label, detail, value }) => <div key={label}><span>{label}</span><strong>{value === null ? '—' : value}</strong><small className={value === null ? 'review-summary-unavailable' : undefined}>{value === null ? 'غير متاح' : detail}</small></div>)}
      </div><aside className="review-overdue-summary" aria-label="الأعمال المتأخرة عبر الأنواع"><span>متأخر</span><strong>{summary.overdue === null ? '—' : summary.overdue}</strong><small>{summary.overdue === null ? 'غير متاح' : 'حالة عابرة لأنواع العمل، وليست مرحلة قرار'}</small></aside></div>
    </section>
    <p className="review-queue-caption">التحقق والإغلاق يخصان الملاحظات والإجراءات المشتركة؛ ولا تدخل الفجوات القديمة في هذه المؤشرات. العمل المتاح للفريق ليس تكليفًا شخصيًا.</p>
    {errors.length > 0 && <div role="alert" className="review-queue-unavailable"><strong>بعض فئات العمل غير متاحة؛ القائمة والملخص غير مكتملين.</strong><ul>{errors.map(c => <li key={c.type}>{workTypeLabels[c.type]}: {c.error}</li>)}</ul></div>}
    <div className="review-queue-filters" aria-label="فلاتر قائمة المراجعة">
      <label>نوع العمل<select value={params.get('type') ?? ''} onChange={e => update('type', e.target.value)}><option value="">كل أنواع العمل</option>{Object.entries(workTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>الإطار<select value={params.get('framework') ?? ''} onChange={e => update('framework', e.target.value)}><option value="">كل الأطر</option>{[...new Set([...frameworks, ...(params.has('framework') ? [params.get('framework')!] : [])])].map(code => <option key={code}>{code}</option>)}</select></label>
      <label>المسؤولية<select value={params.get('responsibility') ?? ''} onChange={e => update('responsibility', e.target.value)}><option value="">مسند إليّ ومتاح للفريق</option>{Object.entries(responsibilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>الحالة<select value={params.get('state') ?? ''} onChange={e => update('state', e.target.value)}><option value="">كل الحالات</option>{[...new Set([...states, ...(params.has('state') ? [params.get('state')!] : [])])].map(state => <option key={state} value={state}>{stateLabels[state] ?? state}</option>)}</select></label>
      <label>الاستحقاق<select value={params.get('due') ?? ''} onChange={e => update('due', e.target.value)}><option value="">كل المواعيد</option><option value="overdue">متأخر</option><option value="today">اليوم</option><option value="upcoming">قادم</option><option value="undated">بلا موعد مسجل</option></select></label>
    </div>
    <p className="review-queue-results" role="status">{errors.length && !items.length ? 'نتائج القائمة غير متاحة حتى تكتمل قراءة فئات العمل.' : <><strong>نتائج القائمة: {visible.length}</strong>{activeFilters ? ` من ${items.length} عملًا مؤهلًا قبل الفلاتر` : ' عملًا مؤهلًا قبل الفلاتر'}{errors.length && ' في الفئات المتاحة فقط؛ الإجمالي غير مكتمل.'}</>}</p>
    {!visible.length ? <p className="workflow-empty">{errors.length ? activeFilters && items.length ? 'لا توجد أعمال تطابق الفلاتر في الفئات المتاحة؛ وتعذر التحقق من الفئات غير المتاحة.' : 'لا تظهر أعمال في الفئات المتاحة حاليًا؛ تعذر التحقق من الفئات غير المتاحة.' : activeFilters && items.length ? 'لا توجد أعمال تطابق الفلاتر الحالية. غيّر الفلاتر لعرض الأعمال المؤهلة.' : 'لا توجد أعمال مراجعة أو قرار مؤهلة ضمن صلاحياتك حاليًا.'}</p> : <div className="review-queue-scroll" role="region" aria-label="قائمة المراجعة والقرارات" tabIndex={0}>
      <table className="workflow-table review-queue-table"><caption>كل صف يمثل عملًا على سجل محدد؛ فحص الدليل المباشر داخل القائمة فقط عندما تسمح الصلاحيات، وبقية القرارات داخل السجل المصدر.</caption><thead><tr><th>السجل / السياق</th><th>نوع العمل</th><th>الحالة</th><th>المسؤولية</th><th>الاستحقاق</th><th>الإجراء التالي</th></tr></thead><tbody>{paged.items.map(item => <tr key={item.key}>
        <td data-label="السجل / السياق"><strong className="review-row-title">{item.title}</strong><small className="review-row-context">{item.framework && <b dir="ltr">{item.framework}</b>}{item.controlCode && <b dir="ltr">{item.controlCode}</b>}{item.cycleId && <span>{item.type === 'PERIODIC_REVIEW_FOLLOWUP' ? 'مراجعة دورية' : 'دورة تقييم'} #{item.cycleId}</span>}{item.itemId && <span>بند #{item.itemId}</span>}</small><details className="review-row-details"><summary>تفاصيل إضافية</summary><div><small>السجل المصدر: {workTypeLabels[item.type]} #{item.sourceId}</small>{item.ownerLabel && <small>المالك: {item.ownerLabel}</small>}{item.reviewerLabel && <small>المتحقق/المراجع: {item.reviewerLabel}</small>}{item.severityLabel && <small>الخطورة: {item.severityLabel}</small>}<small>سبب الظهور: {item.reason}</small></div></details></td>
        <td data-label="نوع العمل"><span className={`review-work-type${item.type === 'PERIODIC_REVIEW_FOLLOWUP' ? ' review-periodic' : ''}`}>{workTypeLabels[item.type]}</span></td><td data-label="الحالة"><span className="review-state-badge">{item.type === 'ASSESSMENT_ITEM_REVIEW' ? reviewLabels[item.state] ?? item.state : stateLabels[item.state] ?? item.state}</span></td>
        <td data-label="المسؤولية"><span className={`review-responsibility ${item.responsibility}`}>{responsibilityLabels[item.responsibility]}</span></td>
        <td data-label="الاستحقاق">{item.dueDate ? <><time dateTime={item.dueDate}>{formatComplianceDate(item.dueDate, true)}</time>{item.dueDate < today && <small className="review-overdue">متأخر</small>}</> : <span className="review-quiet">—</span>}</td>
        <td data-label="الإجراء التالي"><div className="review-row-actions">{actor && onReview && workDecisionModes[item.type] === 'INLINE_EVIDENCE' && canOfferInlineEvidence(item, actor.role) ? <><button className="review-inline-primary" onClick={() => onReview(item)}>فحص الدليل والقرار</button>{!certificationMode && <Link className="review-record-secondary" href={reviewWorkHref(item, raw)}>فتح السجل ←</Link>}</> : certificationMode ? <span>يتطلب مراجعًا مستقلًا</span> : <Link className="review-next-action" href={reviewWorkHref(item, raw)}>{item.type === 'ASSESSMENT_APPROVAL' ? 'فتح دورة التقييم للاعتماد' : item.actionLabel} ←</Link>}</div></td>
      </tr>)}</tbody></table>
    </div>}
    {visible.length > 0 && <nav className="review-queue-pages" aria-label="صفحات قائمة العمل"><button disabled={paged.page === 1} onClick={() => update('page', String(paged.page - 1))}>السابق</button><span>صفحة {paged.page} من {paged.pages} · {visible.length} عملًا</span><button disabled={paged.page === paged.pages} onClick={() => update('page', String(paged.page + 1))}>التالي</button></nav>}
  </>;
}
export default function ReviewWorkQueue({ certificationMode = false }: { certificationMode?: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const [categories, setCategories] = useState<CategoryResult[] | null>(null), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [context, setContext] = useState<{ actor: ReviewActor; snapshot: ReviewSnapshot } | null>(null), [selected, setSelected] = useState<ReviewWorkItem | null>(null), [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { user, profile } = await requireProfile(['admin', 'cybersecurity_team']);
        const actor = { id: user.id, role: profile.role };
        const snapshot = await loadReviewWorkSnapshot(actor);
        if (live) { setCategories(buildReviewWorkQueue(snapshot, actor, todayRiyadh(), certificationMode)); setContext({ actor, snapshot }); setError(''); }
      } catch { if (live) { setCategories(null); setContext(null); setError('تعذر تحميل قائمة العمل. يتطلب مركز المراجعة والقرار حسابًا مخولًا من فريق الأمن السيبراني أو الإدارة.'); } }
    })();
    return () => { live = false; };
  }, [reload, certificationMode]);
  async function settled(result: DecisionResult) {
    setNotice(result.ok ? 'تم حفظ قرار الدليل عبر مسار المراجعة الحالي؛ جاري تحديث القائمة.' : 'لم يتم تأكيد قرار جديد. جاري تحديث الحالة؛ لن نعيد القرار تلقائيًا.');
    if (!context) return;
    try {
      const { user, profile } = await requireProfile(['admin', 'cybersecurity_team']);
      if (user.id !== context.actor.id) throw new Error('Session changed');
      const actor = { id: user.id, role: profile.role }, snapshot = await refreshReviewEvidenceSnapshot(context.snapshot, actor);
      setContext({ actor, snapshot }); setCategories(buildReviewWorkQueue(snapshot, actor, todayRiyadh(), certificationMode));
      setNotice(result.ok ? (snapshot.errors.evidence ? 'حُفظ القرار، لكن تحديث الأدلة غير متاح. افتح السجل قبل أي إعادة.' : 'حُفظ القرار وحُدثت القائمة والمؤشرات المرتبطة به.') : 'حدّثت الحالة المتاحة. افتح السجل أو راجع السياق مجددًا؛ لا توجد إعادة تلقائية.');
    } catch {
      setCategories(null); setContext(null); setSelected(null); setError('تعذر تحديث قائمة العمل ضمن الجلسة الحالية. حدّث الصفحة للتحقق من الحالة.');
      setNotice(result.ok ? 'تم حفظ القرار؛ تعذر تحديث القائمة فقط. لا تُعد إرسال القرار.' : 'لم يتم تأكيد القرار؛ افتح السجل بعد التحقق من الجلسة قبل أي إعادة.');
    }
  }
  const update = (key: string, value: string) => {
    const next = reviewFilters(params.toString());
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value); else next.delete(key);
    router.push((certificationMode ? '/review/qa-certification' : '/review') + (next.size ? '?' + next : ''), { scroll: false });
  };
  const queueContext = reviewQueueContext(params.toString());
  const evidenceParams = new URLSearchParams({ view: 'evidence-history' });
  if (queueContext) { evidenceParams.set('from', 'review'); evidenceParams.set('review_context', queueContext); }
  return <main className="workflow-page review-workspace" dir="rtl">{certificationMode && <div role="status" className="review-qa-cert-banner">QA CERTIFICATION MODE — بيانات اختبار QA_SYNTH فقط</div>}<header className="review-queue-heading"><div><h1>{certificationMode ? 'شهادة مراجعة الأدلة التجريبية' : 'مركز المراجعة والقرار'}</h1><p>{certificationMode ? 'مسار معزول لضابط QA-C-01 ولا يظهر في واجهة الأعمال.' : 'ما الذي ينتظر مراجعتي أو قراري الآن؟'}</p></div><button aria-label="تحديث قائمة العمل" title="تحديث" onClick={() => { setCategories(null); setError(''); setReload(v => v + 1); }}>↻</button></header>
    {!certificationMode && <ReviewCenterTabs active="queue" queueHref={'/review' + (params.size ? '?' + params.toString() : '')} evidenceHref={'/review?' + evidenceParams.toString()}/>}
    {notice && <p role="status" className="review-decision-notice">{notice}</p>}
    {error ? <p role="alert" className="cgp-shell-error">{error} <Link href="/my-controls">العودة إلى ضوابطي ←</Link></p> : categories === null ? <p role="status">جاري تحميل العمل؛ المؤشرات غير متاحة حتى تكتمل القراءة.</p> : <ReviewQueueView categories={categories} raw={params.toString()} update={update} actor={context?.actor} onReview={setSelected} certificationMode={certificationMode}/>}
    {selected && context && <ReviewEvidenceDecision key={selected.key} work={selected} actor={context.actor} raw={params.toString()} onClose={() => setSelected(null)} onSettled={settled} certificationMode={certificationMode}/>}
  </main>;
}

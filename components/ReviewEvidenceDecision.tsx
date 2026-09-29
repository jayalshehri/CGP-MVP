'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import EvidenceDownload from './EvidenceDownload';
import { formatComplianceDate, todayRiyadh } from '@/lib/grc';
import { responsibilityLabels, reviewWorkHref, type ReviewActor, type ReviewWorkItem } from '@/lib/review-work-queue';
import { evidenceDecisionLabels, loadInlineEvidenceMaterial, sanitizeDecisionError, submitInlineEvidenceDecision, type DecisionResult, type EvidenceDecision, type EvidenceReviewMaterial } from '@/lib/review-evidence-decision';

const evidenceStateLabels: Record<string, string> = { pending_review: 'بانتظار المراجعة', under_review: 'قيد المراجعة' };
export function EvidenceDecisionMaterial({ material, work }: { material: EvidenceReviewMaterial; work: ReviewWorkItem }) {
  const { record: e, control: c } = material;
  return <section className="review-decision-material" aria-label="سياق الدليل والإصدار المراد مراجعته">
    <h3>{e.evidence_name || e.file_name} <small>دليل #{e.id} · إصدار {e.version_number}</small></h3>
    <p><b dir="ltr">{c.frameworks.code} · {c.frameworks.version} · {c.control_code}</b> — {c.frameworks.name_ar}</p>
    <p><strong>{c.title_ar}</strong></p>{c.description_ar && <details><summary>نص الضابط وسياقه</summary><p>{c.description_ar}</p></details>}
    <dl><div><dt>الحالة الحالية</dt><dd>{evidenceStateLabels[e.status]}</dd></div><div><dt>المسؤولية</dt><dd>{responsibilityLabels[work.responsibility]}</dd></div><div><dt>مقدم الدليل</dt><dd>{e.uploader_name || 'مقدم مسجل في المستودع'}</dd></div><div><dt>تاريخ الرفع</dt><dd>{formatComplianceDate(e.uploaded_at)}</dd></div><div><dt>الصلاحية</dt><dd>{e.valid_until ? formatComplianceDate(e.valid_until) : 'لا يوجد انتهاء صلاحية مسجل'}</dd></div></dl>
    {e.description && <p>{e.description}</p>}<p>{work.reason}</p>
    <p>الملف للإصدار المعروض: <b dir="auto">{e.file_name}</b> · دليل مباشر</p>
    <EvidenceDownload path={e.file_path} name={e.file_name}/>
  </section>;
}
export default function ReviewEvidenceDecision({ work, actor, raw, onClose, onSettled, certificationMode = false }: {
  work: ReviewWorkItem; actor: ReviewActor; raw: string; onClose: () => void; onSettled: (result: DecisionResult) => Promise<void>; certificationMode?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), submitting = useRef(false);
  const [material, setMaterial] = useState<EvidenceReviewMaterial | null>(null), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [decision, setDecision] = useState<EvidenceDecision>('changes_requested');
  const [reason, setReason] = useState(''), [inspected, setInspected] = useState(false), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let live = true;
    void loadInlineEvidenceMaterial(work, actor, undefined, certificationMode).then(value => { if (live) setMaterial(value); })
      .catch(cause => { if (live) { setError(sanitizeDecisionError(cause).message); setBlocked(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [work, actor, certificationMode]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!material || blocked || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    const result = await submitInlineEvidenceDecision(material, actor, decision, reason, inspected, undefined, certificationMode);
    if (!result.ok) { setError(result.failure.message); if (result.failure.refresh) setBlocked(true); }
    // A successful mutation is never relabeled as failed just because refreshing
    // the queue fails. The parent owns explicit saved/unavailable feedback.
    try { if (result.ok || (!result.ok && result.failure.refresh)) await onSettled(result); }
    finally { submitting.current = false; setBusy(false); }
    if (result.ok) onClose();
  }
  const expired = !!material?.record.valid_until && material.record.valid_until < todayRiyadh();
  return <dialog ref={dialog} className="review-decision-dialog" dir="rtl" aria-labelledby="review-evidence-decision-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><h2 id="review-evidence-decision-title">فحص الدليل والقرار</h2><button type="button" aria-label="إغلاق نافذة القرار" disabled={busy} onClick={onClose}>×</button></header>
    {loading ? <p role="status">جاري تحميل الإصدار والسياق ضمن صلاحياتك…</p> : material && <EvidenceDecisionMaterial material={material} work={work}/>}
    {error && <p role="alert" className="review-decision-error">{error}</p>}
    {material && !blocked && <form onSubmit={event => void submit(event)}>
      <label>القرار<select value={decision} disabled={busy} onChange={event => setDecision(event.target.value as EvidenceDecision)}>{Object.entries(evidenceDecisionLabels).map(([value, label]) => <option key={value} value={value} disabled={value === 'accepted' && expired}>{label}</option>)}</select></label>
      {expired && <p>الدليل منتهي الصلاحية؛ القبول غير متاح. يمكن طلب استكمال أو رفضه بسبب واضح.</p>}
      <label>سبب القرار <small>مطلوب لجميع القرارات</small><textarea required maxLength={4000} rows={3} disabled={busy} value={reason} onChange={event => setReason(event.target.value)}/></label>
      <label className="review-decision-inspected"><input type="checkbox" required checked={inspected} disabled={busy} onChange={event => setInspected(event.target.checked)}/>اطلعت على ملف هذا الإصدار وسياق الضابط، وأؤكد استقلاليتي عن مقدم الدليل.</label>
      <section className="review-decision-consequence" aria-label="تأكيد أثر القرار"><strong>تأكيد {evidenceDecisionLabels[decision]} للدليل #{material.record.id} — إصدار {material.record.version_number}</strong><p>{evidenceStateLabels[material.record.status]} ← {evidenceDecisionLabels[decision]}</p><p>سيسجل القرار وسببه في تاريخ مراجعة الدليل، وقد يحدّث حالة طلبه وملخص الأدلة. لا يعتمد امتثال الضابط ولا يغلق دورة تقييم أو ملاحظة.</p></section>
      <button type="submit" className="review-inline-primary" disabled={busy || !inspected || !reason.trim() || (decision === 'accepted' && expired)}>{busy ? 'جاري تأكيد القرار…' : 'تأكيد القرار وتسجيله'}</button>
    </form>}
    <footer>{!certificationMode && <Link href={reviewWorkHref(work, raw)} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>فتح السجل الكامل ←</Link>}<button type="button" disabled={busy} onClick={onClose}>إلغاء / العودة إلى القائمة</button></footer>
  </dialog>;
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cycleStage, cycleStageLabels, frequencyLabels, requestLabels, formatGrcDate, isExpired, scheduleState, scheduleStateLabels, type ReviewCycle, type EvidenceRequest, type EvidenceRecord } from '@/lib/grc';
import StatusBadge from './StatusBadge';

type Assessment = { id: number; cycle_id: number; result: string; rationale: string; assessed_at: string };
type Props = {
  controlId: number; canManage: boolean; canSubmit: boolean; readOnly?: boolean;
  targetRequestId?: number | null; targetCycleId?: number | null;
  reviewerName: string | null; nextReview: string | null; lastReview: string | null; frequency: string;
  onEvidence: () => void; onCycleChange: () => void;
};
const resubmittable = (status: string) => ['open', 'changes_requested', 'rejected'].includes(status);
const outstanding = (status: string) => ['open', 'submitted', 'changes_requested'].includes(status);
const reviewResults = [
  ['in_progress', 'مطبق جزئيًا'], ['implemented', 'مطبق كليًا'],
  ['not_implemented', 'غير مطبق'], ['not_applicable', 'غير منطبق بمبرر'],
];

export default function ControlReviewPanel({
  controlId, canManage, canSubmit, readOnly = false, targetRequestId = null, targetCycleId = null,
  reviewerName, nextReview, lastReview, frequency, onEvidence, onCycleChange,
}: Props) {
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [userId, setUserId] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [eligibleError, setEligibleError] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [result, setResult] = useState('in_progress');
  const [rationale, setRationale] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [selected, setSelected] = useState<number[]>([]);

  const load = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true);
    try {
      const [c, r, a, e, u] = await Promise.all([
        supabase.from('control_review_cycles').select('*').eq('control_id', controlId).order('id', { ascending: false }),
        supabase.from('evidence_requests').select('*').eq('control_id', controlId).order('id', { ascending: false }),
        supabase.from('control_assessments').select('*').eq('control_id', controlId).order('id', { ascending: false }),
        supabase.rpc('grc_evidence_register'),
        supabase.auth.getUser(),
      ]);
      if (!active()) return;
      setReadError(Boolean(c.error || r.error || a.error || u.error));
      setEligibleError(Boolean(e.error));
      setCycles(c.data ?? []);
      setRequests(r.data ?? []);
      setAssessments(a.data ?? []);
      setEvidence(((e.data ?? []) as EvidenceRecord[]).filter(item => item.control_id === controlId));
      setUserId(u.data.user?.id ?? '');
    } catch {
      if (active()) setReadError(true);
    } finally {
      if (active()) setLoading(false);
    }
  }, [controlId]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => void load(() => live), 0);
    return () => { live = false; clearTimeout(timer); };
  }, [load]);

  const cycle = cycles.find(item => item.status === 'open');
  const currentRequests = cycle ? requests.filter(item => item.cycle_id === cycle.id) : [];
  const readStage = currentRequests.find(item => item.status === 'submitted')
    ?? currentRequests.find(item => outstanding(item.status))
    ?? currentRequests.find(item => resubmittable(item.status))
    ?? currentRequests[0];
  const stage = cycleStage(Boolean(cycle), readStage?.status);
  const historicalCycle = cycles.find(item => item.id === targetCycleId && item.status !== 'open');
  const historicalRequest = requests.find(item => item.id === targetRequestId && item.cycle_id !== cycle?.id);
  const activeRequests = historicalRequest ? [...currentRequests, historicalRequest] : currentRequests;
  const closedCycles = cycles.filter(item => item.status !== 'open');
  const assigned = Boolean(canManage && cycle && cycle.reviewer_id === userId && userId);
  const pendingRequest = currentRequests.find(item => resubmittable(item.status));
  const hasPending = currentRequests.some(item => outstanding(item.status));
  const eligible = evidence.filter(item => item.is_current && item.status === 'accepted' && !isExpired(item.valid_until) && item.uploaded_by !== userId);
  const due = cycle?.due_date ?? nextReview;
  const scheduleHref = `/audit-schedule?control=${controlId}`;

  useEffect(() => {
    if (isLoading) return;
    const target = targetRequestId && requests.some(item => item.id === targetRequestId) ? `audit-request-${targetRequestId}`
      : targetCycleId && cycles.some(item => item.id === targetCycleId) ? `audit-cycle-${targetCycleId}`
      : window.location.hash === '#control-review-cycle' ? 'control-review-cycle' : '';
    if (!target) return;
    const frame = requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(frame);
  }, [isLoading, requests, cycles, targetCycleId, targetRequestId]);

  async function assess() {
    if (!cycle || !assigned || busy || hasPending) return;
    setBusy(true);
    setError('');
    try {
      const res = await supabase.rpc('cgp_grc_command', { p_action: 'assess', p_control_id: controlId, p_data: {
        cycle_id: cycle.id, result, reason: rationale, evidence_ids: selected, next_due_date: nextDate || null,
      } });
      if (res.error) setError('تعذّر اعتماد التقييم. تحقّق من الأدلة والموعد والصلاحية ثم أعد المحاولة.');
      else window.location.reload();
    } catch {
      setError('تعذّر اعتماد التقييم. أعد المحاولة.');
    } finally { setBusy(false); }
  }

  async function cancel(requestId: number) {
    if (!canManage || busy || !cancelReason.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await supabase.rpc('cgp_grc_command', { p_action: 'cancel_request', p_control_id: controlId, p_data: { request_id: requestId, reason: cancelReason } });
      if (res.error) setError('تعذّر إلغاء الطلب. تحقّق من حالته ثم أعد المحاولة.');
      else { setCancelId(null); setCancelReason(''); onCycleChange(); await load(); }
    } catch { setError('تعذّر إلغاء الطلب. أعد المحاولة.'); }
    finally { setBusy(false); }
  }

  function focusEvidenceRequest(id: number) {
    const target = document.getElementById(`audit-request-${id}`);
    const disclosure = target?.closest('details');
    if (disclosure) disclosure.open = true;
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  const canAssess = assigned && !hasPending && !eligibleError;
  const offerUpload = Boolean(pendingRequest && canSubmit && !canAssess && readStage?.status !== 'submitted');
  const primaryAction = isLoading || readError || readOnly ? null
    : !cycle && canManage ? <Link className="detail-button" href={scheduleHref}>جدولة مراجعة</Link>
    : readStage?.status === 'submitted' && canManage ? <button type="button" className="detail-button" onClick={onEvidence}>عرض الأدلة للمراجعة</button>
    : offerUpload && pendingRequest
      ? <Link className="detail-button" href={`/controls/${controlId}/evidence/new?request=${pendingRequest.id}`}>{pendingRequest.status === 'open' ? 'تقديم الدليل' : 'استكمال الدليل'}</Link>
      : canAssess
        ? <button type="button" className="detail-button" aria-expanded={assessmentOpen} aria-controls="control-assessment-form" onClick={() => { setError(''); setAssessmentOpen(open => !open); }}>{assessmentOpen ? 'طيّ نموذج التقييم' : 'تقييم الضابط'}</button>
        : readStage && canManage && hasPending ? <button type="button" className="detail-button" onClick={() => focusEvidenceRequest(readStage.id)}>عرض طلب الدليل</button>
        : null;

  return <section className="detail-card control-review-panel" id="control-review-cycle" aria-busy={isLoading}>
    <div className="detail-row-heading control-cycle-summary">
      <div>
        <h2>المراجعة الدورية</h2>
        {isLoading ? <p role="status" className="detail-hint">جارٍ تحميل حالة المراجعة…</p> : readError
          ? <p role="alert" className="detail-hint">تعذّر تحميل بعض بيانات المراجعة. <button type="button" className="detail-text-button" onClick={() => void load()}>إعادة المحاولة</button></p>
          : <p className={`control-cycle-stage${cycle ? ' control-cycle-stage-open' : ''}`} id={cycle ? `audit-cycle-${cycle.id}` : undefined}>
              {readOnly ? 'سجل تاريخي للضابط' : cycleStageLabels[stage]}{cycle && <> · دورة <bdi>#{cycle.id}</bdi></>}
            </p>}
      </div>
      {primaryAction}
    </div>

    {!isLoading && !readError && !readOnly && <dl className="detail-review-facts control-cycle-facts">
      {cycle && <div><dt>المراجع المكلّف</dt><dd><bdi>{reviewerName || (assigned ? 'أنت' : 'غير ظاهر ضمن صلاحياتك')}</bdi></dd></div>}
      <div><dt>{cycle ? 'استحقاق الدورة' : 'المراجعة القادمة'}</dt><dd>{formatGrcDate(due, 'غير مجدولة')}{due && <> · {scheduleStateLabels[scheduleState(due)]}</>}</dd></div>
      <div><dt>التكرار</dt><dd>{frequencyLabels[cycle?.frequency ?? frequency] ?? 'غير محدد'}</dd></div>
      <div><dt>آخر مراجعة</dt><dd>{formatGrcDate(lastReview, 'غير مسجلة')}</dd></div>
    </dl>}

    {!isLoading && <div className="control-cycle-footer">
      {assessments[0] && <p>آخر تقييم معتمد <StatusBadge status={assessments[0].result}/> <span className="detail-hint">{formatGrcDate(assessments[0].assessed_at)}</span></p>}
      {canManage && cycle && <Link className="detail-inline-link" href={scheduleHref}>فتح جدول التدقيق</Link>}
    </div>}

    {error && <p role="alert" className="cgp-shell-error">{error}</p>}
    {assigned && !hasPending && eligibleError && <p role="alert" className="detail-hint">تعذّر تحميل الأدلة اللازمة للتقييم. <button type="button" className="detail-text-button" onClick={() => void load()}>إعادة المحاولة</button></p>}

    {!!activeRequests.length && <details className="detail-disclosure control-cycle-section" open={Boolean(targetRequestId) || undefined}>
      <summary>طلبات الأدلة <bdi>{activeRequests.length}</bdi></summary>
      <ul className="control-request-list">{activeRequests.map(item => {
        const operational = !readError && item.cycle_id === cycle?.id && resubmittable(item.status);
        const samePrimary = item.id === pendingRequest?.id && offerUpload;
        const [requirement, ...cancelNote] = item.requirement.split('\nسبب الإلغاء: ');
        return <li id={`audit-request-${item.id}`} tabIndex={-1} key={item.id}>
          <div className="detail-row-heading"><strong>طلب دليل <bdi>#{item.id}</bdi></strong><span className="detail-hint">{requestLabels[item.status] ?? 'حالة غير محددة'} · {formatGrcDate(item.due_date)}{item.cycle_id !== cycle?.id && ' · دورة سابقة'}</span></div>
          <p>{requirement}</p>
          {!!cancelNote.length && <details className="detail-disclosure"><summary>سبب الإلغاء</summary><p>{cancelNote.join('\n')}</p></details>}
          <div className="control-request-actions">
            {operational && canSubmit && !samePrimary && <Link className="detail-secondary" href={`/controls/${controlId}/evidence/new?request=${item.id}`}>تقديم الدليل</Link>}
            {operational && canManage && <button type="button" className="detail-text-button" aria-expanded={cancelId === item.id} onClick={() => { setError(''); setCancelReason(''); setCancelId(cancelId === item.id ? null : item.id); }}>إلغاء الطلب</button>}
          </div>
          {operational && canManage && cancelId === item.id && <form className="grc-form" onSubmit={event => { event.preventDefault(); void cancel(item.id); }}>
            <label>سبب الإلغاء<textarea required value={cancelReason} onChange={event => setCancelReason(event.target.value)} rows={2}/></label>
            <button type="submit" className="detail-secondary" disabled={busy || !cancelReason.trim()}>تأكيد إلغاء الطلب</button>
          </form>}
        </li>;
      })}</ul>
    </details>}

    <div id="control-assessment-form" hidden={!assessmentOpen || !assigned || readError || hasPending || eligibleError}>
      {assessmentOpen && assigned && !readError && !hasPending && !eligibleError && <form className="grc-form control-assessment-form" onSubmit={event => { event.preventDefault(); void assess(); }}>
        <p className="detail-hint">اعتماد الدليل لا يغيّر حالة تطبيق الضابط. اعتماد التقييم قرار مستقل يُغلق الدورة.</p>
        <label>نتيجة التقييم<select value={result} onChange={event => setResult(event.target.value)}>{reviewResults.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>مبرر التقييم<textarea required value={rationale} onChange={event => setRationale(event.target.value)} rows={3}/></label>
        <fieldset><legend>الأدلة المقبولة الداعمة للتقييم</legend>
          {!eligible.length && <p>لا توجد أدلة حالية صالحة ومستقلة ضمن صلاحياتك.</p>}
          {eligible.map(item => <label key={`${item.id}-${item.link_id}`}><input type="checkbox" checked={selected.includes(item.id)}
            onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, item.id])] : previous.filter(id => id !== item.id))}/>
            <span dir="auto">{item.evidence_name || item.file_name || 'دليل بدون اسم'} · إصدار {item.version_number}</span></label>)}
        </fieldset>
        {cycle?.frequency === 'custom' && <label>موعد الدورة التالية<input required type="date" value={nextDate} onChange={event => setNextDate(event.target.value)}/></label>}
        <button className="detail-button" disabled={busy || (result === 'implemented' && !selected.length)}>{busy ? 'جارٍ الحفظ…' : 'اعتماد التقييم وإغلاق الدورة'}</button>
      </form>}
    </div>

    {(closedCycles.length > 0 || assessments.length > 0) && <details className="detail-disclosure control-cycle-section" open={historicalCycle ? true : undefined}>
      <summary>الدورات والتقييمات السابقة</summary>
      <ul className="control-request-list">
        {closedCycles.map(item => <li id={`audit-cycle-${item.id}`} key={item.id}><strong>الدورة <bdi>#{item.id}</bdi></strong> <span className="detail-hint">{formatGrcDate(item.completed_at)}</span>
          {item.notes && <details className="detail-disclosure"><summary>ملاحظات الدورة</summary><p>{item.notes}</p></details>}</li>)}
        {assessments.map(item => <li key={`assessment-${item.id}`}><StatusBadge status={item.result}/> <span className="detail-hint">{formatGrcDate(item.assessed_at)} · دورة <bdi>#{item.cycle_id}</bdi></span>
          <details className="detail-disclosure"><summary>مبرر التقييم</summary><p>{item.rationale}</p></details></li>)}
      </ul>
    </details>}
  </section>;
}

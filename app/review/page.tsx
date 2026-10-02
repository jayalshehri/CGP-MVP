'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReviewWorkQueue from '@/components/ReviewWorkQueue';
import EvidenceReviewContext from '@/components/EvidenceReviewContext';
import ReviewCenterTabs from '@/components/ReviewCenterTabs';
import { reviewContextReturn, reviewQueueContext } from '@/lib/review-context';
import '@/components/review-work-queue.css';

function ReviewSurface() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const redirectLegacyEvidence = () => {
      const legacy = /^#evidence-(\d+)$/.exec(window.location.hash);
      if (!legacy || params.has('evidence')) return;
      const legacyId = Number(legacy[1]);
      if (!Number.isSafeInteger(legacyId) || legacyId < 1) return;
      const next = new URLSearchParams(params.toString());
      next.set('evidence', String(legacyId));
      router.replace(`/review?${next}`, { scroll: false });
    };
    redirectLegacyEvidence();
    window.addEventListener('hashchange', redirectLegacyEvidence);
    return () => window.removeEventListener('hashchange', redirectLegacyEvidence);
  }, [params, router]);
  const id = Number(params.get('evidence')), link = Number(params.get('link'));
  const evidenceId = Number.isSafeInteger(id) && id > 0 ? id : null;
  const linkId = Number.isSafeInteger(link) && link > 0 ? link : null;
  const invalidContext = (params.has('evidence') && evidenceId === null) || (params.has('link') && linkId === null);
  const evidenceView = params.has('evidence') || params.get('view') === 'evidence-history';
  const queueContext = reviewQueueContext(params.toString());
  const evidenceParams = new URLSearchParams({ view: 'evidence-history' });
  if (queueContext) { evidenceParams.set('from', 'review'); evidenceParams.set('review_context', queueContext); }
  const queueHref = evidenceView ? reviewContextReturn(new URLSearchParams(params.toString())) ?? '/review' : '/review' + (params.size ? '?' + params.toString() : '');
  const evidenceHref = evidenceView ? '/review?' + params.toString() : '/review?' + evidenceParams.toString();
  return <main className="workflow-page review-workspace" dir="rtl">
    <header className="review-queue-heading"><div><h1>مركز المراجعة والقرار</h1><p>ما الذي ينتظر مراجعتي أو قراري الآن؟</p></div></header>
    <ReviewCenterTabs active={evidenceView ? 'evidence' : 'queue'} queueHref={queueHref} evidenceHref={evidenceHref}/>
    {invalidContext ? <p role="alert">رابط الدليل غير صحيح.</p> : evidenceView ? <EvidenceReviewContext key={`${evidenceId}-${linkId}`} evidenceId={evidenceId} linkId={linkId}/> : <ReviewWorkQueue embedded/>}
  </main>;
}
export default function ReviewPage() {
  return <Suspense fallback={<p role="status">جاري تحميل مركز المراجعة…</p>}><ReviewSurface/></Suspense>;
}

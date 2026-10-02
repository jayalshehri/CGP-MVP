'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReviewWorkQueue from '@/components/ReviewWorkQueue';
import EvidenceReviewContext from '@/components/EvidenceReviewContext';
import { reviewContextReturn } from '@/lib/review-context';
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
  if ((params.has('evidence') && evidenceId === null) || (params.has('link') && linkId === null)) return <p role="alert">رابط الدليل غير صحيح.</p>;
  if (evidenceId !== null || params.get('view') === 'evidence-history') return <EvidenceReviewContext key={`${evidenceId}-${linkId}`} evidenceId={evidenceId} linkId={linkId} returnHref={reviewContextReturn(new URLSearchParams(params.toString())) ?? '/review'} evidenceHref={'/review?' + params.toString()}/>;
  return <ReviewWorkQueue/>;
}
export default function ReviewPage() {
  return <Suspense fallback={<p role="status">جاري تحميل مركز المراجعة…</p>}><ReviewSurface/></Suspense>;
}

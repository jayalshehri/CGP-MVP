import { Suspense } from 'react';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import ReviewB53VisualHarness from '@/components/ReviewB53VisualHarness';
import { qaReviewCertificationEnabled } from '@/lib/qa-review-certification';
import '@/components/review-work-queue.css';

// Temporary Preview-only certification route; never promote it without separate approval.
export default async function QaB53VisualPage() {
  await connection(); // The existing QA certification gate must be evaluated per request.
  if (!qaReviewCertificationEnabled({
    VERCEL_ENV: process.env.VERCEL_ENV,
    CGP_QA_CERT_MODE: process.env.CGP_QA_CERT_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) notFound();
  return <Suspense fallback={<p role="status">جاري تحميل الشهادة البصرية…</p>}><ReviewB53VisualHarness/></Suspense>;
}

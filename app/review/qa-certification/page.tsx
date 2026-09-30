import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import ReviewWorkQueue from '@/components/ReviewWorkQueue';
import { qaReviewCertificationEnabled } from '@/lib/qa-review-certification';
import '@/components/review-work-queue.css';

export default async function QaReviewCertificationPage() {
  await connection(); // Evaluate the server-only flag on every request, never at build time.
  if (!qaReviewCertificationEnabled({
    VERCEL_ENV: process.env.VERCEL_ENV,
    CGP_QA_CERT_MODE: process.env.CGP_QA_CERT_MODE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })) notFound();
  return <ReviewWorkQueue certificationMode/>;
}

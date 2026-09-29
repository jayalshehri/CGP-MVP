// This server-evaluated gate must never be replaced by a URL or browser flag.
// The public Supabase URL is the same project URL used by the browser client.
export const QA_CERTIFICATION_REF = 'lkozjnpfufdpzqtzdxhe';
export const QA_CERTIFICATION_CONTROL = 'QA-C-01';

export function qaReviewCertificationEnabled(env: {
  VERCEL_ENV?: string;
  CGP_QA_CERT_MODE?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
}): boolean {
  if (env.VERCEL_ENV !== 'preview' || env.CGP_QA_CERT_MODE !== 'true') return false;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return url.protocol === 'https:' && url.hostname === `${QA_CERTIFICATION_REF}.supabase.co` &&
      !url.username && !url.password && (url.port === '' || url.port === '443') && url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

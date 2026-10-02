import Link from 'next/link';
import './review-work-queue-refinement.css';

export default function ReviewCenterTabs({ active, queueHref, evidenceHref }: { active: 'queue' | 'evidence'; queueHref: string; evidenceHref: string }) {
  return <nav className="review-center-tabs" aria-label="عروض مركز المراجعة والقرار">
    <Link href={queueHref} aria-current={active === 'queue' ? 'page' : undefined}>قائمة العمل</Link>
    <Link href={evidenceHref} aria-current={active === 'evidence' ? 'page' : undefined}>مراجعة الأدلة والإصدارات</Link>
  </nav>;
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { reviewFilters, type ReviewActor } from '@/lib/review-work-queue';
import { b53VisualCategories, type B53VisualScenario } from '@/lib/review-b53-visual-fixture';
import { ReviewQueueView } from './ReviewWorkQueue';

export default function ReviewB53VisualHarness() {
  const router = useRouter();
  const params = useSearchParams();
  const [actor, setActor] = useState<ReviewActor | null>(null);
  const [denied, setDenied] = useState(false);
  const [scenario, setScenario] = useState<B53VisualScenario>('populated');

  useEffect(() => {
    let live = true;
    void requireProfile(['admin', 'cybersecurity_team']).then(({ user, profile }) => {
      if (live) setActor({ id: user.id, role: profile.role });
    }).catch(() => { if (live) setDenied(true); });
    return () => { live = false; };
  }, []);

  if (denied) return <main className="workflow-page review-workspace" dir="rtl" role="alert">هذا المسار التجريبي متاح فقط لحساب QA مخوّل بالمراجعة.</main>;
  if (!actor) return <main className="workflow-page review-workspace" dir="rtl" role="status">جاري التحقق من حساب QA…</main>;

  const raw = params.toString();
  const update = (key: string, value: string) => {
    const next = reviewFilters(raw);
    if (key !== 'page') next.delete('page');
    if (value) next.set(key, value); else next.delete(key);
    router.push('/review/qa-b53-visual' + (next.size ? `?${next}` : ''), { scroll: false });
  };
  return <main className="workflow-page review-workspace" dir="rtl">
    <div role="status" className="review-qa-cert-banner">QA VISUAL CERTIFICATION — P2-B5.3 · بيانات محاكاة غير مرتبطة بقاعدة البيانات</div>
    <header className="review-queue-heading"><div><h1>مركز المراجعة والقرار — معاينة الصفوف</h1><p>الشكل الإنتاجي نفسه بأمثلة حتمية؛ لا توجد قرارات أو روابط إلى سجلات QA.</p></div></header>
    <div className="review-queue-filters" aria-label="سيناريو الشهادة البصرية">
      <label>حالة العرض<select value={scenario} onChange={event => { setScenario(event.target.value as B53VisualScenario); router.replace('/review/qa-b53-visual', { scroll: false }); }}>
        <option value="populated">أربع فئات عمل تجريبية</option>
        <option value="zero">صفر حقيقي</option>
        <option value="unavailable">فئة قراءة غير متاحة</option>
      </select></label>
    </div>
    <ReviewQueueView categories={b53VisualCategories(scenario, actor.id)} raw={raw} update={update} actor={actor} visualCertificationMode/>
  </main>;
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cycleLabels } from '@/lib/assessment';
import { assessmentCycleHref, latestAssessmentCycle, type CompactAssessmentFramework } from '@/lib/assessment-navigation';
import { formatRiyadhDate } from '@/lib/dates';

type CycleSummary = { id: number; status: string; imported: boolean; approved_at: string | null };

export default function FrameworkAssessmentEntry({ frameworkId, framework }: { frameworkId: number; framework: CompactAssessmentFramework }) {
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from('assessment_cycles')
          .select('id,status,imported,approved_at').eq('framework_id', frameworkId).order('id', { ascending: false });
        if (active && !error) setCycles(data ?? []);
      } catch { /* The assessment link stays available if the optional summary cannot load. */ }
    })();
    return () => { active = false; };
  }, [frameworkId]);
  const current = latestAssessmentCycle(cycles);
  const lastApproved = cycles.filter(cycle => cycle.approved_at && ['approved', 'closed'].includes(cycle.status))
    .sort((a, b) => (b.approved_at ?? '').localeCompare(a.approved_at ?? ''))[0];
  return <section className="catalog-assessment-entry" aria-label={`تقييم ${framework.title}`}>
    <span className="catalog-assessment-symbol" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8 14 2.5 2.5L16 11"/></svg>
    </span>
    <div className="catalog-assessment-copy">
      <h2>قياس الالتزام بإطار <bdi dir="ltr">{framework.code}</bdi></h2>
      <p>{current ? `الدورة #${current.id} · ${cycleLabels[current.status] ?? current.status}` : 'ابدأ دورة بنطاق محدد، أو ارجع إلى دورات التقييم.'}
        {lastApproved && <> · آخر اعتماد داخلي {formatRiyadhDate(lastApproved.approved_at)}</>}</p>
    </div>
    <div className="catalog-assessment-actions">
      {current && <Link className="catalog-assessment-history" href={framework.path}>سجل الدورات</Link>}
      <Link className="catalog-assessment-cta" href={current ? assessmentCycleHref(framework, current.id) : framework.path}>
        {current ? (['approved', 'closed'].includes(current.status) ? 'عرض التقييم' : 'متابعة التقييم') : 'فتح التقييمات'} <span aria-hidden="true">←</span>
      </Link>
    </div>
  </section>;
}

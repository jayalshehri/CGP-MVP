'use client';

import GrcAuditTrail from '@/components/GrcAuditTrail';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { requireProfile } from '@/lib/auth';
import { positiveId } from '@/lib/audit-schedule';
import { WorkflowHeading } from '@/components/WorkflowUI';
import './audit.css';

type LegacyRiskEvent = { id: number; risk_id: number; event_type: string; previous_status: string | null; new_status: string | null; created_at: string };
const labels: Record<string, string> = { created: 'إنشاء خطر', updated: 'تحديث الخطر', status_changed: 'تغيير الحالة' };
const status: Record<string, string> = { open: 'مفتوح', treatment_in_progress: 'قيد المعالجة', accepted: 'مقبول', closed: 'مغلق' };
const time = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' });

function AuditContent() {
  const controlId = positiveId(useSearchParams().get('control'));
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [riskOpen, setRiskOpen] = useState(false);
  const [items, setItems] = useState<LegacyRiskEvent[] | null>(null);
  const [riskError, setRiskError] = useState('');

  useEffect(() => {
    let current = true;
    void requireProfile(['admin', 'cybersecurity_team']).then(() => { if (current) setAuthorized(true); })
      .catch(() => { if (current) setError('سجل التدقيق متاح لمدير النظام وفريق الأمن السيبراني.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!authorized || !riskOpen) return;
    let current = true;
    void supabase.from('cyber_risk_events').select('id,risk_id,event_type,previous_status,new_status,created_at')
      .order('created_at', { ascending: false }).limit(50).then(({ data, error }) => {
        if (!current) return;
        setRiskError(error ? 'تعذر تحميل أحداث المخاطر السابقة.' : '');
        if (!error) setItems(data ?? []);
      });
    return () => { current = false; };
  }, [authorized, riskOpen]);
  return <main className="workflow-page audit-trail-page" dir="rtl">
    <WorkflowHeading title="سجل التدقيق" description="تتبّع من غيّر ماذا ومتى، وافتح تفاصيل الحدث للمقارنة قبل وبعد." />
    {loading && <p role="status">جاري تحميل سجل التدقيق…</p>}
    {error && <p className="cgp-shell-error" role="alert">{error}</p>}
    {authorized && <>
      <GrcAuditTrail full reliableRead key={controlId ?? 'all'} controlId={controlId ?? undefined} />
      {!controlId && <details className="audit-legacy" onToggle={e => setRiskOpen(e.currentTarget.open)}>
        <summary>أحداث المخاطر السابقة</summary>
        <p>سجل منفصل عن أحداث الحوكمة الحالية. يعرض أحدث 50 حدثًا متاحًا.</p>
        {riskError ? <p role="alert">{riskError}</p> : !items ? <p role="status">جاري تحميل أحداث المخاطر…</p>
          : !items.length ? <p>لا توجد أحداث مخاطر سابقة متاحة.</p>
          : <div className="audit-legacy-table"><table className="workflow-table"><thead><tr><th scope="col">الوقت</th><th scope="col">الخطر</th><th scope="col">الحدث</th><th scope="col">التغيير</th></tr></thead>
            <tbody>{items.map(row => <tr key={row.id}><td><time dateTime={row.created_at}>{time.format(new Date(row.created_at))}</time></td>
              <td dir="ltr">RISK-{row.risk_id}</td><td>{labels[row.event_type] ?? row.event_type}</td>
              <td>{row.previous_status ? `${status[row.previous_status] ?? row.previous_status} ← ` : ''}{status[row.new_status ?? ''] ?? row.new_status ?? '—'}</td></tr>)}</tbody>
          </table></div>}
      </details>}
    </>}
  </main>;
}
export default function AuditPage() {
  return <Suspense fallback={<main className="workflow-page" role="status">جاري تحميل سجل التدقيق…</main>}><AuditContent /></Suspense>;
}

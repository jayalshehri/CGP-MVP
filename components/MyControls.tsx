'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { todayRiyadh, formatComplianceDate } from '@/lib/grc';
import { controlHref } from '@/lib/control360';
import { myControlsFilters, myControlsOrigin, myControlsHref } from '@/lib/my-controls-context';
import { deriveMyControls, filterMyControls, loadMyControls, myControlsSummary, myControlTitle, type PersonalData, type PersonalRow } from '@/lib/my-controls';
import type { QueueActor, WorkRequest } from '@/lib/grc-work-queue';
import { GrcWorkQueue } from './GrcAttention';
import StatusBadge from './StatusBadge';
import { MyControlsFilters } from './MyControlsFilters';
import './my-controls.css';

export default function MyControls() {
  return <Suspense fallback={<p role="status">جاري تحميل ضوابطي…</p>}><MyControlsContent/></Suspense>;
}
function MyControlsContent() {
  const params = useSearchParams(), router = useRouter();
  const context = myControlsFilters(params.toString()).toString();
  const [state, setState] = useState<{ data: PersonalData; actor: QueueActor } | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { user, profile } = await requireProfile(['admin', 'cybersecurity_team', 'control_owner']);
        const actor = { id: user.id, role: profile.role };
        const data = await loadMyControls(actor);
        if (active) { setState({ data, actor }); setError(''); }
      } catch (cause) { if (active) { setState(null); setError(cause instanceof Error ? cause.message : 'تعذر تحميل ضوابطي.'); } }
    })();
    return () => { active = false; };
  }, [refresh]);
  if (error) return <main className="workflow-page my-controls" dir="rtl"><h1>ضوابطي</h1><p role="alert">تعذر تحميل قائمة العمل: {error}</p><button onClick={() => setRefresh(v => v + 1)}>إعادة المحاولة</button><Link href="/compliance">مركز الامتثال ←</Link></main>;
  if (!state) return <main className="workflow-page my-controls" dir="rtl" role="status">جاري تحميل ضوابطي…</main>;
  const rows = deriveMyControls(state.data, state.actor, todayRiyadh(), context);
  return <MyControlsView rows={rows} requests={state.data.requests} actor={state.actor} context={context}
    onFilter={(key, value) => { const next = myControlsFilters(context); if (value) next.set(key, value); else next.delete(key); router.push(myControlsHref(next.toString()), { scroll: false }); }}
    onReset={() => router.push('/my-controls', { scroll: false })} onRefresh={() => setRefresh(v => v + 1)}/>;
}

export function MyControlsView({ rows, requests, actor, context, onFilter, onReset, onRefresh }: {
  rows: PersonalRow[]; requests: WorkRequest[]; actor: QueueActor; context: string;
  onFilter: (key: string, value: string) => void; onReset: () => void; onRefresh: () => void;
}) {
  const summary = myControlsSummary(rows);
  const visible = filterMyControls(rows, context), returnContext = myControlsOrigin(context);
  const frameworkCodes = [...new Set(rows.map(row => row.control.frameworks.code))].sort();
  const metrics = [['ضوابطي', summary.total], ['تحتاج إجراء', summary.attention], ['متأخرة', summary.overdue], ['تحتاج دليل', summary.evidence], ['بانتظار المراجعة', summary.waiting]] as const;
  return <main className="workflow-page my-controls" dir="rtl">
    <header className="my-controls-heading"><div><div className="my-controls-title"><h1>ضوابطي</h1><button type="button" className="my-controls-refresh" aria-label="تحديث ضوابطي" title="تحديث ضوابطي" onClick={onRefresh}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5L4 10m1 2a7 7 0 0 0 12 5l3-3"/></svg></button></div><p>الضوابط المسندة إليك وما يحتاج إلى إجراء.</p></div></header>
    {summary.total > 0 && <div className="my-controls-summary" aria-label="ملخص الضوابط المسندة إليك">{metrics.filter(([, value]) => value > 0).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div>}
    {summary.total === 0 ? <p className="my-controls-empty">لا توجد ضوابط مسندة إليك حاليًا.</p> : <>
      {summary.attention === 0 && <p className="my-controls-empty">جميع ضوابطك محدثة ولا توجد إجراءات مطلوبة حاليًا.{summary.waiting > 0 && ' توجد أدلة مرسلة بانتظار المراجعة المستقلة.'}</p>}
      <MyControlsFilters context={context} frameworkCodes={frameworkCodes} onFilter={onFilter} onReset={onReset}/>
      {!visible.length ? <p className="my-controls-empty">لا توجد نتائج مطابقة للتصفية الحالية.</p> : <div className="my-controls-scroll" role="region" aria-label="قائمة ضوابطي" tabIndex={0}>
        <table className="my-controls-table"><caption>{visible.length} ضابطًا ضمن التصفية · المؤشرات تعد الضوابط، لا الملفات أو الطلبات.</caption><thead><tr>{['الإطار', 'الضابط', 'حالة التنفيذ', 'الأدلة', 'التقييم', 'الملاحظات والإجراءات', 'الاستحقاق / المراجعة القادمة', 'الإجراء التالي'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.control.id}>
          <td><span dir="ltr">{row.control.frameworks.code}</span></td>
          <td className="my-controls-control"><Link href={controlHref(row.control.id, returnContext)} aria-label={`${row.control.control_code} — ${myControlTitle(row.control)}`}><bdi className="my-controls-code" dir="ltr">{row.control.control_code}</bdi><span aria-hidden="true"> — </span><span className="my-controls-control-title" title={myControlTitle(row.control)}>{myControlTitle(row.control)}</span></Link></td>
          <td><StatusBadge status={row.control.implementation_status}/></td>
          <td>{row.evidenceLabel === 'لا يوجد طلب دليل يتطلب إجراءً' ? '—' : row.evidenceLabel}</td><td>{row.assessmentNeeded ? 'تقييم مسند إليك يحتاج استكمالًا' : '—'}</td>
          <td>{row.findingCount > 0 ? <Link href={controlHref(row.control.id, returnContext, 'findings')}>{row.findingCount} ملاحظة{row.actionCount > 0 && ` · ${row.actionCount} إجراء مطلوب منك`}</Link> : '—'}</td>
          <td>{row.due ? <><time dateTime={row.due} dir="ltr">{formatComplianceDate(row.due, true)}</time>{row.overdue && <small className="my-controls-overdue">متأخر</small>}</> : '—'}</td>
          <td>{row.next ? <Link className="my-controls-next" href={row.next.href}>{row.next.label}{row.actions.length > 1 && <small>أقرب إجراء متأخر</small>}</Link> : row.actions.length > 1 ? <Link className="my-controls-next" href={controlHref(row.control.id, returnContext)}>عدة إجراءات مطلوبة</Link> : <span>{row.waiting ? 'بانتظار المراجع' : 'لا إجراء مطلوب حاليًا'}</span>}</td>
        </tr>)}</tbody></table>
      </div>}
      {requests.length > 0 && <details className="my-controls-requests"><summary>طلبات الأدلة والمراجعات الدورية ({requests.length})</summary><GrcWorkQueue requests={requests} actor={actor} returnContext={returnContext} compact/></details>}
    </>}
    {actor.role !== 'control_owner' && <footer><Link href="/compliance">استكشاف الأطر في مركز الامتثال ←</Link></footer>}
  </main>;
}

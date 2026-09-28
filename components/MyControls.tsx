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
import './my-controls.css';

const extraFilters = [['attention', 'يحتاج إجراء'], ['evidence', 'يحتاج دليل'], ['assessment', 'يحتاج استكمال تقييم'], ['findings', 'ملاحظات/إجراءات مفتوحة'], ['overdue', 'متأخر']] as const;
const statusLabels: Record<string, string> = { implemented: 'مطبق', in_progress: 'قيد التنفيذ', not_started: 'لم يبدأ', not_applicable: 'لا ينطبق' };

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
  const filters = myControlsFilters(context), summary = myControlsSummary(rows);
  const visible = filterMyControls(rows, context), returnContext = myControlsOrigin(context);
  const frameworkCodes = [...new Set(rows.map(row => row.control.frameworks.code))].sort();
  const metrics = [['ضوابطي', summary.total], ['تحتاج إجراء', summary.attention], ['متأخرة', summary.overdue], ['تحتاج دليل', summary.evidence], ['بانتظار المراجعة', summary.waiting]] as const;
  const activeExtraCount = extraFilters.filter(([key]) => filters.has(key)).length;
  const chips = [
    ...(filters.has('q') ? [{ key: 'q', label: `البحث: ${filters.get('q')}` }] : []),
    ...(filters.has('framework') ? [{ key: 'framework', label: `الإطار: ${filters.get('framework')}` }] : []),
    ...(filters.has('status') ? [{ key: 'status', label: `حالة التنفيذ: ${statusLabels[filters.get('status')!]}` }] : []),
    ...extraFilters.filter(([key]) => filters.has(key)).map(([key, label]) => ({ key, label })),
  ];
  return <main className="workflow-page my-controls" dir="rtl">
    <header className="my-controls-heading"><div><h1>ضوابطي</h1><p>الضوابط المسندة إليك وما يحتاج إلى إجراء.</p></div><button onClick={onRefresh}>تحديث</button></header>
    {summary.total > 0 && <div className="my-controls-summary" aria-label="ملخص الضوابط المسندة إليك">{metrics.filter(([, value]) => value > 0).map(([label, value]) => <span key={label}>{label} <strong>{value}</strong></span>)}</div>}
    {summary.total === 0 ? <p className="my-controls-empty">لا توجد ضوابط مسندة إليك حاليًا.</p> : <>
      {summary.attention === 0 && <p className="my-controls-empty">جميع ضوابطك محدثة ولا توجد إجراءات مطلوبة حاليًا.{summary.waiting > 0 && ' توجد أدلة مرسلة بانتظار المراجعة المستقلة.'}</p>}
      <section className="my-controls-filters" aria-label="تصفية ضوابطي">
        <label>البحث<input type="search" value={filters.get('q') ?? ''} placeholder="رمز الضابط أو عنوانه" onChange={event => onFilter('q', event.target.value)}/></label>
        <label>الإطار<select value={filters.get('framework') ?? ''} onChange={event => onFilter('framework', event.target.value)}><option value="">كل أطر ضوابطي</option>{frameworkCodes.map(code => <option key={code}>{code}</option>)}</select></label>
        <label>حالة التنفيذ<select value={filters.get('status') ?? ''} onChange={event => onFilter('status', event.target.value)}><option value="">الكل</option><option value="implemented">مطبق</option><option value="in_progress">قيد التنفيذ</option><option value="not_started">لم يبدأ</option><option value="not_applicable">لا ينطبق</option></select></label>
        <details className="my-controls-more"><summary>المزيد من الفلاتر{activeExtraCount > 0 && <small> ({activeExtraCount})</small>}</summary>
          <div className="my-controls-toggles">{extraFilters.map(([key, label]) => <label key={key}><input type="checkbox" checked={filters.get(key) === '1'} onChange={event => onFilter(key, event.target.checked ? '1' : '')}/>{label}</label>)}</div>
        </details>
        {chips.length > 0 && <div className="my-controls-filter-chips" aria-label="الفلاتر النشطة">{chips.map(({ key, label }) => <button type="button" key={key} className="my-controls-filter-chip" aria-label={`إزالة فلتر ${label}`} onClick={() => onFilter(key, '')}><span>{label}</span><span aria-hidden="true">×</span></button>)}<button type="button" onClick={onReset}>مسح الفلاتر</button></div>}
      </section>
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
    <footer><Link href="/compliance">استكشاف الأطر في مركز الامتثال ←</Link></footer>
  </main>;
}

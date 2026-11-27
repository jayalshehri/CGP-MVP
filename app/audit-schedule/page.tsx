'use client';

import AssessmentPortfolio from '@/components/AssessmentPortfolio';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { requireProfile, type UserRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { WorkflowHeading } from '@/components/WorkflowUI';
import { evidenceReviewHref } from '@/lib/evidence-review';
import { type ReviewCycle, type EvidenceRequest, frequencyLabels, formatGrcDate, csvDownload, scheduleStateLabels } from '@/lib/grc';
import { type ScheduleControl, type ScheduleRow, type ScheduleScope, type SetupFilter, closedThisMonth, describeStage, dueState, positiveId, readAuditPages } from '@/lib/audit-schedule';
import './audit-schedule.css';

type Person = { user_id: string; display_name: string | null };
type Editor = { row: ScheduleRow; reviewer: string; frequency: string; due: string; requirement: string; reason: string };
const scopes: { key: ScheduleScope; label: string }[] = [
  { key: 'setup', label: 'تحتاج تأسيس' }, { key: 'due', label: 'مستحقة أو متأخرة' },
  { key: 'open', label: 'دورات مفتوحة' }, { key: 'completed', label: 'مكتملة هذا الشهر' },
];
const pageSize = 25;
const listDate = (row: ScheduleRow) => row.cycle?.status === 'completed' ? row.cycle.completed_at : row.cycle?.due_date ?? null;
const rowKey = (row: ScheduleRow) => row.cycle ? `cycle-${row.cycle.id}` : `control-${row.control.id}`;
const showDialog = (node: HTMLDialogElement | null) => { if (node && !node.open) node.showModal(); };

function Schedule({ target }: { target: number | null }) {
  const [controls, setControls] = useState<ScheduleControl[]>([]);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [identity, setIdentity] = useState<{ role: UserRole; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [portfolioVisited, setPortfolioVisited] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState<ScheduleScope | null>(null);
  const [setup, setSetup] = useState<SetupFilter>('all');
  const [completedAll, setCompletedAll] = useState(false);
  const [framework, setFramework] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [period, setPeriod] = useState(30);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEvidence, setPendingEvidence] = useState<{ request: number; ids: number[] } | null>(null);
  const canManage = identity?.role === 'admin' || identity?.role === 'cybersecurity_team';

  const load = useCallback(async (cancelled: () => boolean = () => false) => {
    try {
      const { user, profile } = await requireProfile();
      const managers = profile.role === 'admin' || profile.role === 'cybersecurity_team';
      const [c, cy, rq, reviewers] = await Promise.all([
        readAuditPages((from, to) => supabase.from('controls')
          .select('id,control_code,title_ar,control_owner,control_owner_id,audit_frequency,last_audit_date,next_audit_date,frameworks!inner(code,is_active)', { count: 'exact' })
          .eq('frameworks.is_active', true).order('id').range(from, to), row => row.id),
        readAuditPages<ReviewCycle>((from, to) => supabase.from('control_review_cycles')
          .select('id,control_id,owner_id,reviewer_id,due_date,status,frequency,completed_at,notes', { count: 'exact' })
          .in('status', ['open', 'completed']).order('id', { ascending: false }).range(from, to), row => row.id),
        readAuditPages<EvidenceRequest>((from, to) => supabase.from('evidence_requests')
          .select('id,control_id,cycle_id,requirement,due_date,status,reviewer_id,requested_from', { count: 'exact' })
          .order('id', { ascending: false }).range(from, to), row => row.id),
        managers ? readAuditPages<Person>((from, to) => supabase.from('profiles')
          .select('user_id,display_name', { count: 'exact' }).in('role', ['admin', 'cybersecurity_team']).eq('is_active', true)
          .order('user_id').range(from, to), row => row.user_id) : Promise.resolve([]),
      ]);
      if (cancelled()) return;
      setControls(c.map(row => ({
        ...row, frameworks: Array.isArray(row.frameworks) ? row.frameworks[0] ?? null : row.frameworks,
      })));
      setCycles(cy);
      setRequests(rq);
      setPeople(reviewers);
      setIdentity({ role: profile.role, id: user.id });
      setError('');
    } catch (e) {
      if (!cancelled()) setError(e instanceof Error ? e.message : 'تعذر تحميل جدول التدقيق.');
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { void load(() => cancelled); }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [load]);
  const selectedRequestId = selected?.request?.status === 'submitted' ? selected.request.id : null;
  useEffect(() => {
    if (!selectedRequestId || !canManage) return;
    let cancelled = false;
    void supabase.from('evidence').select('id').eq('request_id', selectedRequestId).eq('is_current', true)
      .in('status', ['pending_review', 'under_review']).order('id', { ascending: false }).then(({ data, error }) => {
        if (!cancelled) setPendingEvidence({ request: selectedRequestId, ids: error ? [] : (data ?? []).map(item => item.id) });
      });
    return () => { cancelled = true; };
  }, [selectedRequestId, canManage]);

  const data = useMemo(() => {
    const byControl = new Map(controls.map(control => [control.id, control]));
    const byCycle = new Map<number, EvidenceRequest>();
    for (const request of requests) if (!byCycle.has(request.cycle_id)) byCycle.set(request.cycle_id, request);
    const open = new Map<number, ReviewCycle>();
    const completed: ScheduleRow[] = [];
    for (const cycle of cycles) {
      const control = byControl.get(cycle.control_id);
      if (!control) continue;
      if (cycle.status === 'completed') completed.push({ control, cycle, request: byCycle.get(cycle.id) });
      if (cycle.status === 'open' && !open.has(cycle.control_id)) open.set(cycle.control_id, cycle);
    }
    const all: ScheduleRow[] = controls.map(control => {
      const cycle = open.get(control.id);
      return { control, cycle, request: cycle ? byCycle.get(cycle.id) : undefined };
    });
    return { all, completed };
  }, [controls, cycles, requests]);
  const peopleNames = new Map(people.map(person => [person.user_id, person.display_name]));
  const ownerNames = new Map<string, string>();
  for (const c of controls) if (c.control_owner_id && (c.control_owner || !ownerNames.has(c.control_owner_id)))
    ownerNames.set(c.control_owner_id, c.control_owner || 'مالك معيّن');
  const ownerName = (row: ScheduleRow) => {
    const id = row.cycle?.owner_id ?? row.control.control_owner_id;
    return id ? ownerNames.get(id) || peopleNames.get(id) || 'مالك الدورة' : 'غير معيّن';
  };
  const reviewerName = (row: ScheduleRow) => row.cycle ? peopleNames.get(row.cycle.reviewer_id) || 'مراجع مكلّف' : '—';
  const query = search.trim().toLocaleLowerCase();
  const matches = (row: ScheduleRow) => {
    const c = row.control;
    return (!target || target === c.id) && (framework === 'all' || framework === c.frameworks?.code)
      && (frequencyFilter === 'all' || frequencyFilter === (row.cycle?.frequency ?? c.audit_frequency))
      && (ownerFilter === 'all' || ownerFilter === (row.cycle?.owner_id ?? c.control_owner_id))
      && (!query || `${c.control_code} ${c.title_ar} ${ownerName(row)}`.toLocaleLowerCase().includes(query));
  };
  const rows = data.all.filter(matches);
  const setupRows = rows.filter(row => !row.control.control_owner_id || !row.cycle);
  const dueRows = rows.filter(row => row.cycle && ['overdue', 'due_today', 'due_soon'].includes(dueState(row, period)));
  const openRows = rows.filter(row => row.cycle);
  const completedRows = data.completed.filter(matches);
  const monthRows = completedRows.filter(row => row.cycle && closedThisMonth(row.cycle));
  const active = scope ?? (dueRows.length ? 'due' : setupRows.length || !openRows.length ? 'setup' : 'open');
  const counts = { setup: setupRows.length, due: dueRows.length, open: openRows.length, completed: monthRows.length };
  const withoutOwner = setupRows.filter(row => !row.control.control_owner_id).length;
  const overdue = dueRows.filter(row => dueState(row, period) === 'overdue').length;
  const visible = (active === 'setup' ? setupRows.filter(row => setup === 'all' || (setup === 'unowned' ? !row.control.control_owner_id : row.control.control_owner_id && !row.cycle))
    : active === 'due' ? dueRows : active === 'open' ? openRows : completedAll ? completedRows : monthRows)
    .slice().sort((a, b) => active === 'completed'
      ? (Date.parse(b.cycle?.completed_at ?? '') || 0) - (Date.parse(a.cycle?.completed_at ?? '') || 0)
      : (listDate(a) ?? '9999').localeCompare(listDate(b) ?? '9999') || a.control.id - b.control.id);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / pageSize) - 1));

  function openEditor(row: ScheduleRow) {
    const c = row.control;
    const existing = row.cycle?.status === 'open' ? row.cycle : undefined;
    setSelected(null);
    setEditorError('');
    setEditor({ row, reviewer: existing?.reviewer_id ?? '', frequency: existing?.frequency ?? c.audit_frequency,
      due: existing?.due_date ?? c.next_audit_date ?? '', requirement: c.title_ar, reason: '' });
  }
  async function save() {
    if (!editor || busy || !canManage || !editor.row.control.control_owner_id) return;
    setBusy(true);
    setEditorError('');
    const editing = editor.row.cycle?.status === 'open' ? editor.row.cycle : undefined;
    try {
      const { error } = await supabase.rpc('cgp_grc_command', {
        p_action: editing ? 'reschedule' : 'open_cycle', p_control_id: editor.row.control.id,
        p_data: { cycle_id: editing?.id, reviewer_id: editor.reviewer, due_date: editor.due,
          frequency: editor.frequency, requirement: editor.requirement, reason: editor.reason },
      });
      if (error) throw error;
      setEditor(null);
      setMessage(editing ? 'تم تحديث الدورة وتسجيل التغيير.' : 'تم إنشاء الدورة وطلب الدليل.');
      await load();
    } catch (e) { setEditorError(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'تعذر حفظ الدورة.'); }
    finally { setBusy(false); }
  }

  const requestHref = (row: ScheduleRow) => `/controls/${row.control.id}${row.request ? `?auditRequest=${row.request.id}#audit-request-${row.request.id}` : '#control-review-cycle'}`;
  function nextAction(row: ScheduleRow) {
    const c = row.control;
    if (row.cycle?.status === 'completed') return <button className="schedule-btn" onClick={() => setSelected(row)}>عرض الإغلاق</button>;
    if (canManage && !c.control_owner_id) return <Link className="schedule-btn" href={`/controls/${c.id}/assign`}>تعيين مالك</Link>;
    if (canManage && !row.cycle) return <button className="schedule-btn primary" onClick={() => openEditor(row)}>إنشاء دورة</button>;
    if (row.request?.status === 'submitted' && canManage) return <button className="schedule-btn primary" onClick={() => setSelected(row)}>مراجعة الدليل</button>;
    if (row.request?.status === 'accepted' && row.cycle?.reviewer_id === identity?.id)
      return <Link className="schedule-btn primary" href={`/controls/${c.id}#control-review-cycle`}>تقييم وإغلاق</Link>;
    if (row.request) return <Link className="schedule-btn" href={requestHref(row)}>فتح طلب الدليل</Link>;
    return <Link className="schedule-btn" href={`/controls/${c.id}`}>فتح الضابط</Link>;
  }
  function exportRows() {
    csvDownload('periodic-reviews.csv', [
      ['الإطار', 'رقم الضابط', 'الضابط', 'المالك', 'المراجع', 'رقم الدورة', 'التكرار', 'الموعد', 'حالة الموعد', 'مرحلة الدورة', 'تاريخ الإغلاق'],
      ...visible.map(row => [row.control.frameworks?.code ?? '', row.control.control_code, row.control.title_ar,
        ownerName(row), reviewerName(row), row.cycle?.id ?? '', frequencyLabels[row.cycle?.frequency ?? row.control.audit_frequency] ?? '—',
        row.cycle?.due_date ?? '', row.cycle?.status === 'open' ? scheduleStateLabels[dueState(row, period)] : '',
        describeStage(row).label, row.cycle?.completed_at ?? '']),
    ]);
  }
  if (loading) return <main className="workflow-page" role="status">جاري تحميل جدول التدقيق الدوري…</main>;

  return <main className="workflow-page audit-schedule-page" dir="rtl">
    <WorkflowHeading title="جدول التدقيق الدوري" description="خطّط لمراجعات الضوابط وتابع من عليه الإجراء التالي." />
    {error && <p className="cgp-shell-error" role="alert">{error}</p>}
    {message && <p className="schedule-feedback" role="status">{message}</p>}
    {(!error || controls.length > 0) && <>
      <div className="schedule-scopes" role="group" aria-label="قوائم التدقيق الدوري">
        {scopes.map(item => <button key={item.key} type="button" aria-pressed={active === item.key}
          onClick={() => { setScope(item.key); setPage(0); }}>
          <span>{item.label}</span><strong>{counts[item.key]}</strong>
          <small>{item.key === 'setup' ? `${withoutOwner} بلا مالك · ${counts.setup - withoutOwner} بلا دورة`
            : item.key === 'due' ? `${overdue} متأخرة · ${counts.due - overdue} خلال ${period} يومًا`
            : item.key === 'open' ? 'طلبات الأدلة والتقييمات الجارية' : 'الدورات المغلقة فعليًا'}</small>
        </button>)}
      </div>
      {target && <div className="schedule-context">عرض ضابط محدد من الرابط <Link href="/audit-schedule">عرض كل الضوابط</Link></div>}
      <div className="schedule-toolbar">
        <label>بحث<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="رقم الضابط أو اسمه أو المالك" /></label>
        <label>الإطار<select value={framework} onChange={e => { setFramework(e.target.value); setPage(0); }}>
          <option value="all">جميع الأطر</option>{[...new Set(controls.map(c => c.frameworks?.code).filter(Boolean))].sort().map(item => <option key={item}>{item}</option>)}
        </select></label>
        {active === 'due' && <label>نافذة الاستحقاق<select value={period} onChange={e => { setPeriod(Number(e.target.value)); setPage(0); }}>
          {[7, 14, 30, 60, 90].map(days => <option key={days} value={days}>{days} يومًا</option>)}
        </select></label>}
        <details className="schedule-more">
          <summary>فلاتر إضافية{(frequencyFilter !== 'all' || ownerFilter !== 'all') && ' · مطبّقة'}</summary>
          <div><label>المالك<select value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(0); }}>
            <option value="all">كل الملاك</option>{[...ownerNames].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>التكرار<select value={frequencyFilter} onChange={e => { setFrequencyFilter(e.target.value); setPage(0); }}>
            <option value="all">كل التكرارات</option>{Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label></div>
        </details>
        <div className="schedule-export"><button className="schedule-btn" onClick={exportRows} disabled={!visible.length}>تصدير CSV</button>
          <button className="schedule-btn" onClick={() => window.print()} disabled={!visible.length}>طباعة الصفحة</button></div>
      </div>
      {active === 'setup' && <div className="schedule-subviews" role="group" aria-label="حالة التأسيس">
        {([{ key: 'all', label: `الكل (${counts.setup})` }, { key: 'unowned', label: `بلا مالك (${withoutOwner})` },
          { key: 'unscheduled', label: `له مالك وبلا دورة (${counts.setup - withoutOwner})` }] as const).map(item =>
          <button key={item.key} aria-pressed={setup === item.key} onClick={() => { setSetup(item.key); setPage(0); }}>{item.label}</button>)}
      </div>}
      {active === 'completed' && <div className="schedule-subviews" role="group" aria-label="فترة الإغلاق">
        <button aria-pressed={!completedAll} onClick={() => { setCompletedAll(false); setPage(0); }}>هذا الشهر</button>
        <button aria-pressed={completedAll} onClick={() => { setCompletedAll(true); setPage(0); }}>كل الدورات المكتملة</button>
      </div>}
      <section className="schedule-list" aria-label="قائمة دورات التدقيق">
        {visible.length ? <table className="schedule-table"><thead><tr><th scope="col">الضابط</th><th scope="col">المسؤول</th>
          <th scope="col">{active === 'completed' ? 'تاريخ الإغلاق' : 'الموعد'}</th><th scope="col">مرحلة الدورة</th><th scope="col">الإجراء التالي</th></tr></thead>
          <tbody>{visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row => {
            const stage = describeStage(row);
            const dateState = dueState(row, period);
            return <tr key={rowKey(row)}>
              <td><button className="schedule-row-link" aria-label={`تفاصيل الضابط ${row.control.control_code}${row.cycle ? `، دورة ${row.cycle.id}` : ''}`} onClick={() => setSelected(row)}>
                <b dir="ltr">{row.control.frameworks?.code} · {row.control.control_code}</b><span>{row.control.title_ar}</span>
              </button></td>
              <td>{ownerName(row)}{row.cycle && <small>المراجع {reviewerName(row)}</small>}</td>
              <td>{formatGrcDate(listDate(row))}{row.cycle?.status === 'open' && <small className={`schedule-date ${dateState}`}>{scheduleStateLabels[dateState]}</small>}</td>
              <td><span className={`schedule-stage ${stage.key}`}>{stage.label}</span></td>
              <td>{nextAction(row)}</td>
            </tr>;
          })}</tbody></table> : <div className="schedule-empty"><b>لا توجد نتائج في هذه القائمة</b><p>{active === 'due'
            ? 'عدم وجود مستحقات لا يعني أن كل الضوابط جُدولت. راجع قائمة «تحتاج تأسيس» لمعرفة ما لم يبدأ بعد.'
            : active === 'completed' ? 'تظهر هنا الدورات بعد اعتماد التقييم وإغلاقها فعليًا.' : 'غيّر الفلاتر أو اختر قائمة أخرى.'}</p></div>}
      </section>
      {!!visible.length && <nav className="schedule-pages" aria-label="صفحات الجدول">
        <span aria-live="polite">{currentPage * pageSize + 1}–{Math.min(visible.length, (currentPage + 1) * pageSize)} من {visible.length}</span>
        <div><button className="schedule-btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابقة</button>
          <button className="schedule-btn" disabled={(currentPage + 1) * pageSize >= visible.length} onClick={() => setPage(currentPage + 1)}>التالية</button></div>
      </nav>}
      <p className="schedule-note">قبول الدليل لا يغلق الدورة. اعتماد تقييم الضابط هو الذي يغلقها ويحدد الدورة التالية وفق التكرار.</p>
      <details className="schedule-portfolio" onToggle={e => { if (e.currentTarget.open) setPortfolioVisited(true); }}>
        <summary>تقييمات الأطر وخطط المعالجة</summary>{portfolioVisited && <AssessmentPortfolio view="schedule" />}
      </details>
    </>}
    {selected && <dialog ref={showDialog} className="schedule-drawer" aria-labelledby="schedule-detail-title" onCancel={() => setSelected(null)}>
      <header><div><small>تفاصيل {selected.cycle ? `الدورة #${selected.cycle.id}` : 'الضابط'}</small><h2 id="schedule-detail-title">{selected.control.title_ar}</h2>
        <b dir="ltr">{selected.control.frameworks?.code} · {selected.control.control_code}</b></div>
        <button className="schedule-btn" onClick={() => setSelected(null)}>إغلاق</button></header>
      <dl><div><dt>المالك</dt><dd>{ownerName(selected)}</dd></div><div><dt>المراجع</dt><dd>{reviewerName(selected)}</dd></div>
        <div><dt>التكرار</dt><dd>{frequencyLabels[selected.cycle?.frequency ?? selected.control.audit_frequency] ?? '—'}</dd></div>
        <div><dt>موعد الدورة</dt><dd>{formatGrcDate(selected.cycle?.due_date ?? null)}</dd></div>
        <div><dt>آخر مراجعة للضابط</dt><dd>{formatGrcDate(selected.control.last_audit_date)}</dd></div>
        <div><dt>مرحلة الدورة</dt><dd>{describeStage(selected).label}</dd></div>
        {selected.cycle?.status === 'completed' && <div><dt>تاريخ الإغلاق</dt><dd>{formatGrcDate(selected.cycle.completed_at)}</dd></div>}
      </dl>
      {selected.cycle?.notes && <p className="schedule-note">{selected.cycle.notes}</p>}
      {selected.request && <section className="schedule-request"><h3>طلب الدليل #{selected.request.id}</h3><p>{selected.request.requirement}</p>
        <Link className="schedule-btn" href={requestHref(selected)}>فتح الطلب على الضابط</Link>
        {selectedRequestId && canManage && pendingEvidence?.request === selectedRequestId && pendingEvidence.ids.map(id =>
          <Link key={id} className="schedule-btn primary" href={evidenceReviewHref({ id, link_id: null })}>مراجعة الدليل #{id}</Link>)}
      </section>}
      <footer>
        <Link className="schedule-btn" href={`/controls/${selected.control.id}#control-review-cycle`}>فتح الضابط</Link>
        {canManage && <Link className="schedule-btn" href={`/audit?control=${selected.control.id}`}>سجل تغييرات الضابط</Link>}
        {canManage && !selected.control.control_owner_id && <Link className="schedule-btn primary" href={`/controls/${selected.control.id}/assign`}>تعيين مالك</Link>}
        {canManage && selected.control.control_owner_id && selected.cycle?.status !== 'completed' &&
          <button className="schedule-btn primary" onClick={() => openEditor(selected)}>{selected.cycle ? 'تعديل الدورة' : 'إنشاء دورة'}</button>}
      </footer>
    </dialog>}
    {editor && <dialog ref={showDialog} className="schedule-drawer" aria-labelledby="schedule-editor-title"
      onCancel={e => { if (busy) e.preventDefault(); else setEditor(null); }}>
      <header><div><small dir="ltr">{editor.row.control.control_code}</small><h2 id="schedule-editor-title">{editor.row.cycle ? 'تعديل الدورة' : 'إنشاء دورة وطلب دليل'}</h2></div>
        <button className="schedule-btn" disabled={busy} onClick={() => setEditor(null)}>إغلاق</button></header>
      <form className="grc-form" onSubmit={e => { e.preventDefault(); void save(); }}>
        {editorError && <p role="alert" className="cgp-shell-error">{editorError}</p>}
        <label>المراجع<select required value={editor.reviewer} onChange={e => setEditor({ ...editor, reviewer: e.target.value })}>
          <option value="">اختر مراجعًا</option>{people.filter(person => person.user_id !== editor.row.control.control_owner_id)
            .map(person => <option key={person.user_id} value={person.user_id}>{person.display_name ?? person.user_id}</option>)}
        </select></label>
        <label>موعد الاستحقاق<input type="date" required value={editor.due} onChange={e => setEditor({ ...editor, due: e.target.value })} /></label>
        <label>التكرار<select value={editor.frequency} onChange={e => setEditor({ ...editor, frequency: e.target.value })}>
          {Object.entries(frequencyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        {editor.row.cycle
          ? <label>سبب التعديل<textarea required value={editor.reason} onChange={e => setEditor({ ...editor, reason: e.target.value })} /></label>
          : <label>الأدلة المطلوبة<textarea required value={editor.requirement} onChange={e => setEditor({ ...editor, requirement: e.target.value })} /></label>}
        <footer><button className="schedule-btn primary" disabled={busy || !editor.row.control.control_owner_id}>{busy ? 'جاري الحفظ…' : 'حفظ الدورة'}</button></footer>
      </form>
    </dialog>}
  </main>;
}

function ScheduleRoute() {
  const target = positiveId(useSearchParams().get('control'));
  return <Schedule key={target ?? 'all'} target={target} />;
}
export default function AuditSchedulePage() {
  return <Suspense fallback={<main className="workflow-page" role="status">جاري تحميل جدول التدقيق الدوري…</main>}><ScheduleRoute /></Suspense>;
}

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { positiveId } from '@/lib/audit-schedule';
import { requireProfile } from '@/lib/auth';
import { controlFrameworkLabel, controlHeading, crosswalkTypeLabels as types } from '@/lib/control-presentation';
import { formatRiyadhDate } from '@/lib/dates';
import { csvDownload } from '@/lib/grc';
import { supabase } from '@/lib/supabase';
import './crosswalk.css';

type Mapping = {
  id: number; source_id: number; target_id: number;
  source_framework: string; target_framework: string; source_code: string; target_code: string;
  source_title: string; target_title: string; source_version: string | null; target_version: string | null;
  coverage_type: string; validation_status: string; source_reference: string | null; coverage_notes: string | null;
  reviewed_by: string | null; reviewed_at: string | null; approved_at: string | null; revision: number;
};
type ControlChoice = { id: number; label: string };
type CrosswalkGroup = { id: number; source: Mapping; links: Mapping[] };
type Filters = { source: string; target: string; type: string };
const statuses = { pending: 'بانتظار المراجعة والاعتماد', approved: 'معتمد', rejected: 'مرفوض' } as const;
const statusOrder = ['pending', 'approved', 'rejected'] as const;
const statusLabel = (value: string) => statuses[value as keyof typeof statuses] ?? 'حالة غير محددة';
const coverageLabel = (value: string) => types[value] ?? 'نوع العلاقة غير محدد';
const codeLabel = (framework: string, code: string) => `${framework} · ${code}`;
const frameworkOrder = (left: string, right: string) => left.localeCompare(right, 'en', { numeric: true });
const initialFilters: Filters = { source: '', target: '', type: '' };
const pageSize = 12;
const previewSize = 3;

function groupMappings(rows: Mapping[]): CrosswalkGroup[] {
  const groups = new Map<number, CrosswalkGroup>();
  const sorted = [...rows].sort((a, b) => frameworkOrder(a.source_framework, b.source_framework)
    || frameworkOrder(a.source_code, b.source_code) || frameworkOrder(a.target_framework, b.target_framework)
    || frameworkOrder(a.target_code, b.target_code) || a.id - b.id);
  for (const row of sorted) {
    const group = groups.get(row.source_id);
    if (group) group.links.push(row);
    else groups.set(row.source_id, { id: row.source_id, source: row, links: [row] });
  }
  return [...groups.values()];
}

function normalizeSearch(text: string) {
  return text.toLowerCase().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[‐-―−]/g, '-').trim();
}

function filterMappings(rows: Mapping[], filters: Filters, status: string, search: string) {
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  return rows.filter(row => {
    if ((filters.source && row.source_framework !== filters.source) || (filters.target && row.target_framework !== filters.target)
     || (status && row.validation_status !== status) || (filters.type && row.coverage_type !== filters.type)) return false;
    const haystack = normalizeSearch([
      row.source_framework, row.source_code, row.source_title, controlHeading(row.source_framework, row.source_code, row.source_title),
      row.target_framework, row.target_code, row.target_title, controlHeading(row.target_framework, row.target_code, row.target_title),
    ].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}

export default function MappingsPage() {
  return <Suspense fallback={<main className="cw-page" dir="rtl" role="status">جارٍ تحميل خريطة المواءمة…</main>}><MappingsScope/></Suspense>;
}
function MappingsScope() {
  const controlId = positiveId(useSearchParams().get('control'));
  return <MappingsContent key={controlId ?? 'all'} controlId={controlId}/>;
}
function MappingsContent({ controlId }: { controlId: number | null }) {
  const [choices, setChoices] = useState<ControlChoice[]>([]);
  const [rows, setRows] = useState<Mapping[]>([]);
  const [actor, setActor] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [openSource, setOpenSource] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { user } = await requireProfile(['admin', 'cybersecurity_team']);
        const [result, controls] = await Promise.all([
          supabase.rpc('cgp_crosswalk'),
          supabase.from('controls').select('id,control_code,title_ar,frameworks!inner(code,is_active)').eq('frameworks.is_active', true),
        ]);
        if (result.error || controls.error) throw result.error || controls.error;
        if (!active) return;
        setRows(result.data ?? []);
        setChoices((controls.data ?? []).map(row => {
          const framework = (Array.isArray(row.frameworks) ? row.frameworks[0] : row.frameworks)?.code ?? '';
          return { id: row.id, label: `${framework} ${row.control_code} — ${controlHeading(framework, row.control_code, row.title_ar)}` };
        }));
        setActor(user.id);
        setError('');
      } catch {
        if (active) setError('تعذّر تحميل خريطة المواءمة. تأكد من اتصالك وصلاحية الوصول ثم أعد المحاولة.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [refresh]);

  const scoped = controlId ? rows.filter(row => row.source_id === controlId || row.target_id === controlId) : rows;
  const visible = filterMappings(scoped, filters, status, search);
  const groups = groupMappings(visible);
  const sources = [...new Set(scoped.map(row => row.source_framework))].sort(frameworkOrder);
  const targets = [...new Set(scoped.map(row => row.target_framework))].sort(frameworkOrder);
  const scopeRelation = scoped[0];
  const scopedLabel = choices.find(choice => choice.id === controlId)?.label
    ?? (scopeRelation ? (scopeRelation.source_id === controlId
      ? codeLabel(scopeRelation.source_framework, scopeRelation.source_code)
      : codeLabel(scopeRelation.target_framework, scopeRelation.target_code)) : null);
  const statusCounts = scoped.reduce((totals, row) => {
    totals.set(row.validation_status, (totals.get(row.validation_status) ?? 0) + 1);
    return totals;
  }, new Map<string, number>());
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const filtered = Boolean(search.trim() || status || filters.source || filters.target || filters.type);
  const filterCount = Object.values(filters).filter(Boolean).length;

  function updated(message: string) {
    setFeedback(message);
    setRefresh(value => value + 1);
  }
  function clearFilters() {
    setFilters(initialFilters);
    setSearch('');
    setStatus('');
    setPage(0);
  }
  function exportResults() {
    csvDownload('control-crosswalk.csv', [
      ['الضابط المصدر', 'الضابط المرتبط', 'نوع العلاقة', 'حالة المواءمة', 'المرجع', 'حدود التغطية'],
      ...visible.map(row => [
        codeLabel(row.source_framework, row.source_code), codeLabel(row.target_framework, row.target_code),
        coverageLabel(row.coverage_type), statusLabel(row.validation_status), row.source_reference ?? '', row.coverage_notes ?? '',
      ]),
    ]);
  }

  return <main className="cw-page" dir="rtl" aria-labelledby="crosswalk-title">
    <header className="cw-header">
      <div><h1 id="crosswalk-title">خريطة مواءمة الضوابط</h1><p>استعرض العلاقات بين الأطر. المواءمة لا تنقل قرار الالتزام أو قبول الدليل.</p></div>
      {actor && !error && <NewMapping choices={choices} onUpdated={updated}/>}
    </header>
    {controlId && <div className="cw-scope"><p>المواءمات المرتبطة بالضابط{scopedLabel && <> · <bdi>{scopedLabel}</bdi></>}</p><Link href="/mappings">عرض الخريطة كاملة</Link></div>}
    {feedback && <p className="cw-feedback cw-screen" role="status">{feedback}</p>}
    {error && <div className="cw-message" role="alert">{error} <button type="button" className="cw-button" onClick={() => { setLoading(true); setRefresh(value => value + 1); }}>إعادة المحاولة</button></div>}
    {loading ? <p className="cw-message" role="status">جارٍ تحميل المواءمات…</p> : !error && <>
      <section className="cw-screen" aria-label="استعراض المواءمات">
        <div className="cw-toolbar">
          <label className="cw-search">بحث في الخريطة<input type="search" placeholder="رقم الضابط أو اسمه أو الإطار" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/></label>
          <details className="cw-filters">
            <summary className="cw-button">تصفية النتائج{filterCount > 0 && <bdi className="cw-count">{filterCount}</bdi>}</summary>
            <div className="cw-filter-fields">
              <label>الإطار المصدر<select value={filters.source} onChange={event => { setFilters({ ...filters, source: event.target.value }); setPage(0); }}>
                <option value="">الكل</option>{sources.map(item => <option key={item}>{item}</option>)}
              </select></label>
              <label>الإطار المرتبط<select value={filters.target} onChange={event => { setFilters({ ...filters, target: event.target.value }); setPage(0); }}>
                <option value="">الكل</option>{targets.map(item => <option key={item}>{item}</option>)}
              </select></label>
              <label>نوع العلاقة<select value={filters.type} onChange={event => { setFilters({ ...filters, type: event.target.value }); setPage(0); }}>
                <option value="">الكل</option>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
            </div>
          </details>
          <details className="cw-export"><summary className="cw-button">تصدير</summary><div>
            <button type="button" disabled={!visible.length} onClick={exportResults}>تصدير CSV</button>
            <button type="button" disabled={!visible.length} onClick={() => window.print()}>طباعة / PDF</button>
          </div></details>
        </div>
        <div className="cw-status-filters" aria-label="حالة المواءمة">
          <button type="button" aria-pressed={!status} onClick={() => { setStatus(''); setPage(0); }}>الكل <bdi>{scoped.length}</bdi></button>
          {statusOrder.map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>
            {value === 'pending' ? 'بانتظار المراجعة' : statusLabel(value)} <bdi>{statusCounts.get(value) ?? 0}</bdi>
          </button>)}
          {filtered && <button className="cw-clear" type="button" onClick={clearFilters}>مسح التصفية</button>}
        </div>
        <div className="cw-result-bar" aria-live="polite"><span>{groups.length} ضابط مصدر · {visible.length} علاقة</span></div>
        {!groups.length ? <p className="cw-message">{filtered ? 'لا توجد مواءمات مطابقة لهذه التصفية.' : 'لا توجد مواءمات مسجّلة في هذا النطاق.'}</p> : <div className="cw-list">
          <div className="cw-column-labels" aria-hidden="true"><span>الضابط المصدر</span><span>الضوابط المرتبطة</span></div>
          {groups.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(group => <MappingGroup key={group.id} group={group}
            open={openSource === group.id} onToggle={() => setOpenSource(value => value === group.id ? null : group.id)} actor={actor} onUpdated={updated}/>)}
        </div>}
        {pageCount > 1 && <nav className="cw-pagination" aria-label="صفحات المواءمات">
          <button type="button" className="cw-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</button>
          <span>صفحة <bdi>{currentPage + 1}</bdi> من <bdi>{pageCount}</bdi></span>
          <button type="button" className="cw-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>التالي</button>
        </nav>}
      </section>
      <PrintMappings rows={visible}/>
    </>}
  </main>;
}

function MappingGroup({ group, open, onToggle, actor, onUpdated }: {
  group: CrosswalkGroup; open: boolean; onToggle: () => void; actor: string; onUpdated: (message: string) => void;
}) {
  const source = group.source;
  const regionId = `crosswalk-source-${group.id}`;
  return <article className="cw-group">
    <button type="button" className="cw-group-toggle" aria-expanded={open} aria-controls={regionId} onClick={onToggle}>
      <span className="cw-source"><bdi dir="ltr">{codeLabel(source.source_framework, source.source_code)}</bdi>
        <strong>{controlHeading(source.source_framework, source.source_code, source.source_title)}</strong></span>
      <span className="cw-targets">
        {group.links.slice(0, previewSize).map(row => <span className="cw-preview" key={row.id}>
          <bdi dir="ltr">{codeLabel(row.target_framework, row.target_code)}</bdi>
          <span>{coverageLabel(row.coverage_type)}</span><StatusBadge value={row.validation_status}/>
        </span>)}
        {group.links.length > previewSize && <span className="cw-more">و{group.links.length - previewSize} أخرى</span>}
      </span>
      <span className="cw-chevron" aria-hidden="true"/>
    </button>
    <div id={regionId} hidden={!open} className="cw-group-panel">
      {open && <>
        <Link className="cw-link" href={`/controls/${source.source_id}`}>فتح الضابط المصدر <bdi dir="ltr">{source.source_code}</bdi></Link>
        <ul className="cw-relations">{group.links.map(row => <li key={`${row.id}-${row.revision}`}><MappingDetails row={row} actor={actor} onUpdated={onUpdated}/></li>)}</ul>
      </>}
    </div>
  </article>;
}

function StatusBadge({ value }: { value: string }) {
  return <span title={statusLabel(value)} className={`cw-status cw-status-${Object.hasOwn(statuses, value) ? value : 'neutral'}`}>{value === 'pending' ? 'بانتظار المراجعة' : statusLabel(value)}</span>;
}

function MappingDetails({ row, actor, onUpdated }: { row: Mapping; actor: string; onUpdated: (message: string) => void }) {
  const [reference, setReference] = useState(row.source_reference ?? '');
  const [notes, setNotes] = useState(row.coverage_notes ?? '');
  const [type, setType] = useState(row.coverage_type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mayApprove = row.validation_status === 'pending' && Boolean(row.reviewed_by) && row.reviewed_by !== actor;

  async function act(action: 'review' | 'approve' | 'reject') {
    if (busy || (action === 'approve' && !mayApprove)) return;
    setError('');
    if (action !== 'approve' && (!reference.trim() || !notes.trim())) {
      setError('أضف المرجع وحدود التغطية قبل المتابعة.');
      return;
    }
    setBusy(true);
    try {
      const result = await supabase.rpc('cgp_crosswalk_command', {
        p_id: row.id,
        p_data: { revision: row.revision, action, source_reference: reference, coverage_notes: notes, coverage_type: type },
      });
      if (result.error) setError(result.error.message);
      else onUpdated(action === 'approve' ? 'تم اعتماد المواءمة.' : action === 'reject' ? 'تم تسجيل رفض المواءمة.' : 'تم حفظ المراجعة. الاعتماد يتطلب مراجعًا آخر.');
    } catch { setError('تعذّر حفظ التغيير. أعد المحاولة.'); }
    finally { setBusy(false); }
  }

  return <>
    <div className="cw-relation-header"><Link className="cw-link" href={`/controls/${row.target_id}`}>
      <bdi dir="ltr">{codeLabel(row.target_framework, row.target_code)}</bdi> · {controlHeading(row.target_framework, row.target_code, row.target_title)}
    </Link><span>{coverageLabel(row.coverage_type)} <StatusBadge value={row.validation_status}/></span></div>
    <dl className="cw-reference">
      <div><dt>المرجع</dt><dd>{row.source_reference || 'غير موثّق'}</dd></div>
      <div><dt>حدود التغطية</dt><dd>{row.coverage_notes || 'غير موثّقة'}</dd></div>
    </dl>
    <p className="cw-versions">الإصدارات المرتبطة <bdi dir="ltr">{row.source_version ? controlFrameworkLabel(row.source_framework, row.source_version) : row.source_framework + ' —'}</bdi>
      {' / '}<bdi dir="ltr">{row.target_version ? controlFrameworkLabel(row.target_framework, row.target_version) : row.target_framework + ' —'}</bdi></p>
    <details className="cw-review">
      <summary>مراجعة العلاقة</summary>
      <div className="cw-form">
        {error && <p role="alert" className="cw-error">{error}</p>}
        <label>نوع العلاقة<select value={type} onChange={event => setType(event.target.value)}>
          {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>الوثيقة والإصدار والصفحة<input value={reference} onChange={event => setReference(event.target.value)}/></label>
        <label className="cw-wide">حدود التغطية أو مبرر الرفض<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)}/></label>
        <p className="cw-wide cw-hint">آخر مراجعة {formatRiyadhDate(row.reviewed_at, 'غير مسجلة')} · آخر اعتماد {formatRiyadhDate(row.approved_at, 'غير مسجل')}</p>
        <div className="cw-actions cw-wide">
          <button type="button" className="cw-button cw-primary" disabled={busy} onClick={() => void act('review')}>حفظ المراجعة</button>
          <button type="button" className="cw-button" disabled={busy || !mayApprove} onClick={() => void act('approve')}>اعتماد المراجعة المحفوظة</button>
          <button type="button" className="cw-button" disabled={busy} onClick={() => void act('reject')}>رفض العلاقة</button>
        </div>
        {!mayApprove && row.validation_status === 'pending' && <p className="cw-wide cw-hint">الاعتماد متاح لمراجع آخر بعد حفظ المراجعة.</p>}
      </div>
    </details>
  </>;
}

function NewMapping({ choices, onUpdated }: { choices: ControlChoice[]; onUpdated: (message: string) => void }) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState('reference');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const disclosure = event.currentTarget.closest('details');
    if (busy) return;
    const a = choices.find(choice => choice.label === source);
    const b = choices.find(choice => choice.label === target);
    if (!a || !b || a.id === b.id) { setError('اختر ضابطين مختلفين من النتائج.'); return; }
    if (!reference.trim() || !notes.trim()) { setError('أضف المرجع وحدود التغطية.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await supabase.rpc('cgp_crosswalk_command', {
        p_id: null,
        p_data: { action: 'create', source_id: a.id, target_id: b.id, coverage_type: type, source_reference: reference, coverage_notes: notes },
      });
      if (response.error) setError(response.error.message);
      else {
        setSource(''); setTarget(''); setReference(''); setNotes('');
        onUpdated('تم حفظ العلاقة للاعتماد المستقل.');
        disclosure?.removeAttribute('open');
      }
    } catch { setError('تعذّر حفظ العلاقة. أعد المحاولة.'); }
    finally { setBusy(false); }
  }

  return <details className="cw-new cw-screen">
    <summary className="cw-button cw-primary">اقتراح مواءمة</summary>
    <form className="cw-form" onSubmit={event => void submit(event)}>
      {error && <p className="cw-error cw-wide" role="alert">{error}</p>}
      <datalist id="cw-controls">{choices.map(choice => <option key={choice.id} value={choice.label}/>)}</datalist>
      <label>الضابط المصدر<input list="cw-controls" value={source} onChange={event => setSource(event.target.value)} required/></label>
      <label>الضابط المرتبط<input list="cw-controls" value={target} onChange={event => setTarget(event.target.value)} required/></label>
      <label>نوع العلاقة<select value={type} onChange={event => setType(event.target.value)}>
        {Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>الوثيقة والإصدار والصفحة<input value={reference} onChange={event => setReference(event.target.value)} required/></label>
      <label className="cw-wide">حدود التغطية والمتطلبات الإضافية<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} required/></label>
      <div className="cw-wide"><button type="submit" className="cw-button cw-primary" disabled={busy}>إرسال للاعتماد</button></div>
    </form>
  </details>;
}

function PrintMappings({ rows }: { rows: Mapping[] }) {
  if (!rows.length) return null;
  return <table className="cw-print">
    <thead><tr><th scope="col">الضابط المصدر</th><th scope="col">الضابط المرتبط</th><th scope="col">العلاقة والاعتماد</th><th scope="col">المرجع وحدود التغطية</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      <td><bdi dir="ltr">{codeLabel(row.source_framework, row.source_code)}</bdi><p>{row.source_title}</p></td>
      <td><bdi dir="ltr">{codeLabel(row.target_framework, row.target_code)}</bdi><p>{row.target_title}</p></td>
      <td>{coverageLabel(row.coverage_type)} · {statusLabel(row.validation_status)}</td>
      <td>{row.source_reference || 'غير موثّق'}<p>{row.coverage_notes}</p></td>
    </tr>)}</tbody>
  </table>;
}

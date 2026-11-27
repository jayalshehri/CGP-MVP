'use client';

import { formatRiyadhDateTime, formatRiyadhTime } from "@/lib/dates";
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createReadEpoch } from '@/lib/strategy-read';
import { formatGrcDate, csvDownload } from '@/lib/grc';
import { type AuditEvent, type AuditFramework, type AuditRow, actions, changed, entities, escapeAuditLike, eventLink, eventReference, fieldValue, fields, firstAuditRelation, qualifiedAuditCode, showValue } from '@/lib/audit-trail';
import styles from './GrcAuditTrail.module.css';

type LegacyEntry = { key: string; time: string; title: string; by: string | null; body?: string | null };
const failure = 'تعذر تحميل سجل التدقيق. أعد المحاولة.';
type FrameworkOption = AuditFramework & { id: number; is_active: boolean };
const eventColumns = 'id,control_id,entity_type,entity_id,action,actor_id,actor_name,occurred_at,previous_data,new_data';
const controlColumns = 'id,control_code,title_ar,frameworks(code,name_ar)';

export default function GrcAuditTrail({ controlId, reliableRead = false, full = false, globalLink = false, compact = false, legacyEntries = [] }: {
  controlId?: number; reliableRead?: boolean; full?: boolean; globalLink?: boolean; compact?: boolean; legacyEntries?: LegacyEntry[];
}) {
  const pageSize = compact ? 10 : 30;
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [frameworks, setFrameworks] = useState<FrameworkOption[]>([]);
  const [framework, setFramework] = useState('');
  const [frameworksError, setFrameworksError] = useState(false);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [kind, setKind] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [controlCode, setControlCode] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [earliest, setEarliest] = useState('');
  const [cutoffKnown, setCutoffKnown] = useState(false);
  const epoch = useRef(createReadEpoch());
  const filters = Boolean(kind || action || actor || controlCode || framework || since || until);
  const dateError = since && until && since > until ? 'تاريخ النهاية يجب أن يكون في يوم البداية أو بعده.' : '';

  const load = useCallback(async () => {
    const ticket = epoch.current.begin();
    setLoading(true);
    setError('');
    setOpenId(null);
    const code = controlCode.trim().slice(0, 90);
    const actorText = actor.trim().slice(0, 120);
    try {
      if (dateError) {
        setRows([]);
        setHasNext(false);
        return;
      }
      // The inner embed filters root events before paging. With no control filter,
      // a left embed retains project/system events without a linked control.
      const scoped = Boolean(framework || code);
      let query = supabase.from('grc_audit_events')
        .select(`${eventColumns},controls${scoped ? '!inner' : ''}(${controlColumns})`)
        .order('occurred_at', { ascending: false }).order('id', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      if (controlId) query = query.eq('control_id', controlId);
      if (framework) query = query.eq('controls.framework_id', Number(framework));
      if (code) query = query.ilike('controls.control_code', escapeAuditLike(code));
      if (kind) query = query.eq('entity_type', kind);
      if (action) query = query.eq('action', action);
      if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(actorText)) query = query.eq('actor_id', actorText);
      else if (actorText) query = query.ilike('actor_name', `%${escapeAuditLike(actorText)}%`);
      if (since) query = query.gte('occurred_at', `${since}T00:00:00+03:00`);
      if (until) {
        const next = new Date(`${until}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        if (!Number.isNaN(next.getTime())) query = query.lt('occurred_at', `${next.toISOString().slice(0, 10)}T00:00:00+03:00`);
      }
      const response = await query;
      if (!epoch.current.valid(ticket)) return;
      if (response.error) throw new Error(response.error.message);
      const values = (response.data ?? []) as unknown as AuditRow[];
      setRows(values.slice(0, pageSize));
      setHasNext(values.length > pageSize);
    } catch (e) {
      if (!epoch.current.valid(ticket)) return;
      setError(reliableRead || full ? failure : e instanceof Error ? e.message : failure);
      setRows([]);
      setHasNext(false);
    } finally {
      if (epoch.current.valid(ticket)) setLoading(false);
    }
  }, [action, actor, controlCode, controlId, dateError, framework, full, kind, page, pageSize, reliableRead, since, until]);

  useEffect(() => {
    const current = epoch.current;
    const timer = setTimeout(() => { void load(); }, 200);
    return () => { clearTimeout(timer); current.cancel(); };
  }, [load]);
  useEffect(() => {
    if (!full && !(compact && controlId)) return;
    let live = true;
    let query = supabase.from('grc_audit_events').select('occurred_at');
    if (compact && controlId) query = query.eq('control_id', controlId);
    void query.order('occurred_at').limit(1).then(({ data, error }) => {
      if (live && !error) {
        setEarliest(data?.[0]?.occurred_at ?? '');
        setCutoffKnown(true);
      }
    });
    return () => { live = false; };
  }, [full, compact, controlId]);

  useEffect(() => {
    if (!full || controlId) return;
    let live = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from('frameworks').select('id,code,name_ar,is_active')
          .order('is_active', { ascending: false }).order('code');
        if (!live) return;
        if (error) throw error;
        setFrameworks(data ?? []);
      } catch { if (live) setFrameworksError(true); }
    })();
    return () => { live = false; };
  }, [full, controlId]);

  const scopedControl = firstAuditRelation(rows[0]?.controls);
  const person = (row: AuditEvent) => row.actor_name || row.actor_id || 'عملية نظام';
  const label = (row: AuditEvent) => entities[row.entity_type] ?? row.entity_type;
  const verb = (row: AuditEvent) => actions[row.action] ?? row.action;
  const eventTitle = (row: AuditEvent) => {
    if (row.entity_type === 'evidence_reviews' || row.entity_type === 'evidence_control_link_reviews') {
      const decision = row.new_data?.decision;
      if (decision === 'accepted') return 'قبول الدليل';
      if (decision === 'rejected') return 'رفض الدليل';
      if (decision === 'changes_requested') return 'طلب استكمال الدليل';
    }
    if (row.entity_type === 'evidence' && row.action === 'insert') return 'رفع دليل';
    if (row.entity_type === 'control_assessments' && row.action === 'insert') return 'اعتماد تقييم الضابط';
    if (row.entity_type === 'control_review_cycles' && row.action === 'update' && row.new_data?.status === 'completed' && row.previous_data?.status !== 'completed') return 'إغلاق دورة المراجعة';
    return `${verb(row)} · ${label(row)}`;
  };
  const archivedEntries = !compact ? [] : legacyEntries.filter(item =>
    !cutoffKnown || !earliest || Date.parse(item.time) < Date.parse(earliest));

  const reference = (row: AuditRow) => eventReference(row, firstAuditRelation(row.controls));
  const change = (set: (value: string) => void, value: string) => {
    set(value);
    setPage(0);
    setLoading(true);
  };
  function go(next: number) {
    setLoading(true);
    setPage(next);
  }
  function reset() {
    setLoading(true);
    setKind('');
    setAction('');
    setActor('');
    setControlCode('');
    setFramework('');
    setSince('');
    setUntil('');
    setPage(0);
  }
  function exportPage() {
    csvDownload('grc-audit-events.csv', [
      ['الوقت', 'المستخدم', 'نوع العنصر', 'العملية', 'مرجع العنصر', 'اسم العنصر', 'الضابط', 'اختصار الإطار', 'اسم الإطار', 'رقم الحدث', 'الحقول المتغيرة'],
      ...rows.map(row => {
        const ref = reference(row);
        return [row.occurred_at, person(row), label(row), verb(row), ref.code, ref.title, ref.controlCode || row.control_id || '',
          ref.framework?.code ?? '', ref.framework?.name_ar ?? '', row.id, changed(row).map(key => fields[key] ?? key).join('،')];
      }),
    ]);
  }

  function details(row: AuditRow) {
    const keys = changed(row);
    const linked = eventLink(row, full);
    const reason = fieldValue(row, 'rationale', 'review_notes');
    const { framework: relatedFramework } = reference(row);
    return <div className={styles.details}>
      <div className={styles.detailBar}><span>الحدث <b dir="ltr">#{row.id}</b></span>
        {linked && (!compact || linked.href !== `/controls/${controlId}`) && <Link href={linked.href}>{linked.label} ←</Link>}
      </div>
      {relatedFramework && <p className={styles.frameworkDetail}><strong>الإطار التنظيمي</strong> <bdi dir="ltr">{relatedFramework.code}</bdi>
        <span>{relatedFramework.name_ar}</span></p>}
      {compact && reason && <p className={styles.decisionNote}><strong>مبرر القرار</strong><span>{reason}</span></p>}
      {keys.length > 0 ? <table className={styles.diff}><thead><tr><th scope="col">الحقل</th><th scope="col">قبل</th><th scope="col">بعد</th></tr></thead>
        <tbody>{keys.map(key => <tr key={key}><th scope="row">{fields[key] ?? key}</th>
          <td dir="auto">{showValue(key, row.previous_data?.[key])}</td><td dir="auto">{showValue(key, row.new_data?.[key])}</td></tr>)}</tbody>
      </table> : <p>لا توجد قيم قبل وبعد مسجّلة لهذا الحدث.</p>}
    </div>;
  }

  return <section dir="rtl" className={`${styles.card} ${full ? styles.full : styles.embedded}${compact ? ` ${styles.compact}` : ''}`}>
    <header className={styles.header}><div><h2>{compact ? 'نشاط الضابط' : 'سجل الأحداث التلقائي'}</h2>
      {!compact && <p>يعرض السجل الأحداث منذ تفعيله. للقرارات الأقدم، ارجع إلى سجل مراجعة الدليل.</p>}
      {full && earliest && <p className={styles.coverage}>أقدم حدث ضمن صلاحياتك {formatGrcDate(earliest)} · بتوقيت الرياض</p>}
    </div>
      {globalLink && controlId && <Link href={`/audit?control=${controlId}`}>فتح في السجل العام ←</Link>}
    </header>
    <AuditFilters compact={compact} active={filters}><div className={styles.filters}>
      {full && !controlId && <label>الإطار التنظيمي<select value={framework} disabled={!frameworks.length} onChange={e => change(setFramework, e.target.value)}>
        <option value="">جميع الأطر</option>{frameworks.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name_ar}</option>)}
      </select></label>}
      {full && !controlId && <label>رقم الضابط<input type="search" value={controlCode} onChange={e => change(setControlCode, e.target.value)}
        placeholder="رقم الضابط كاملًا" maxLength={90} /></label>}
      <label>نوع العنصر<select value={kind} onChange={e => change(setKind, e.target.value)}>
        <option value="">كل العناصر</option>{Object.entries(entities).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
      </select></label>
      {full && <label>الإجراء<select value={action} onChange={e => change(setAction, e.target.value)}>
        <option value="">كل الإجراءات</option>{Object.entries(actions).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
      </select></label>}
      {full && <label>المستخدم<input type="search" value={actor} onChange={e => change(setActor, e.target.value)} placeholder="اسم المستخدم أو معرّفه" maxLength={120} /></label>}
      <label>من تاريخ<input type="date" value={since} onChange={e => change(setSince, e.target.value)} /></label>
      {full && <label>إلى تاريخ<input type="date" value={until} onChange={e => change(setUntil, e.target.value)} /></label>}
    </div>
    {frameworksError && <p role="status" className={styles.notice}>تعذر تحميل فلتر الإطار. بقية الفلاتر متاحة.</p>}
    <div className={styles.bar}>
      {controlId && full && <span>عرض التغييرات للضابط <bdi dir="ltr">{qualifiedAuditCode(scopedControl?.control_code || `#${controlId}`, firstAuditRelation(scopedControl?.frameworks))}</bdi> <Link href="/audit">عرض السجل الكامل</Link></span>}
      {filters && <button type="button" onClick={reset}>مسح الفلاتر</button>}
      <button type="button" className={styles.export} disabled={loading || !!dateError || !!error || !rows.length} onClick={exportPage}>تصدير الصفحة الحالية (CSV)</button>
    </div>
    </AuditFilters>
    {dateError ? <p role="alert" className={styles.notice}>{dateError}</p> : loading ? <p role="status" className={styles.notice}>جارٍ تحميل الأحداث…</p>
      : error ? <div role="alert" className={styles.notice}>{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>
      : !rows.length ? <p className={styles.notice}>لا توجد أحداث مطابقة.</p>
      : full ? <div className={styles.tableWrap}><table className={styles.events}>
        <thead><tr><th scope="col">العنصر</th><th scope="col">الإجراء</th><th scope="col">المستخدم</th><th scope="col">الوقت</th></tr></thead>
        <tbody>{rows.map(row => {
          const ref = reference(row);
          return <Fragment key={row.id}>
            <tr className={styles.eventRow}>
              <td><button aria-expanded={openId === row.id} aria-label={`تفاصيل الحدث ${row.id} · ${ref.context || ref.displayCode}${ref.title ? ` · ${ref.title}` : ''}`}
                onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                <span>{label(row)} · <bdi dir="ltr">{ref.displayCode}</bdi></span>
                {ref.title && <strong title={ref.title}>{ref.title}</strong>}
                {ref.context && <small>الضابط <bdi dir="ltr">{ref.context}</bdi></small>}
              </button></td>
              <td><span className={styles.verb}>{verb(row)}</span></td><td>{person(row)}</td>
              <td><time dateTime={row.occurred_at}>{formatGrcDate(row.occurred_at)}<small>{formatRiyadhTime(row.occurred_at)}</small></time></td>
            </tr>
            {openId === row.id && <tr className={styles.expanded}><td colSpan={4}>{details(row)}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div>
      : compact ? <ol className={styles.timeline}>{rows.map(row => {
        const ref = reference(row);
        return <li key={row.id}><details className={styles.timelineEvent}><summary>
          <span className={styles.timelineMain}><strong>{eventTitle(row)}</strong>{ref.title && <span className={styles.timelineTitle} title={ref.title}>{ref.title}</span>}</span>
          <span className={styles.timelineBy}><bdi>{person(row)}</bdi><time dateTime={row.occurred_at}>{formatRiyadhDateTime(row.occurred_at)}</time></span>
        </summary>{details(row)}</details></li>;
      })}</ol> : rows.map(row => {
        const ref = reference(row);
        return <details key={row.id} className={styles.item}><summary>
          <strong>{verb(row)} · {label(row)} · <bdi dir="ltr">{ref.displayCode}</bdi></strong>
          {ref.context && <small>الضابط <bdi dir="ltr">{ref.context}</bdi></small>}
          <small>{person(row)} · {formatGrcDate(row.occurred_at)} · {formatRiyadhTime(row.occurred_at)}</small>
        </summary>{details(row)}</details>;
      })}
    {(!compact || page > 0 || hasNext) && <nav className={styles.pagination} aria-label="صفحات سجل التدقيق">
      <button disabled={!page || loading} onClick={() => go(page - 1)}>الأحدث</button>
      <span aria-live="polite">صفحة {page + 1}</span>
      <button disabled={!hasNext || loading} onClick={() => go(page + 1)}>الأقدم</button>
    </nav>}
    {compact && !filters && archivedEntries.length > 0 && <details className={styles.legacyEvents}>
      <summary>{cutoffKnown && earliest ? 'نشاط الأدلة قبل بدء سجل الأحداث' : 'النشاط المحفوظ في سجل الأدلة'}</summary>
      <ol className={styles.timeline}>{archivedEntries.map(item => <li key={item.key}><details className={styles.timelineEvent}><summary>
        <span className={styles.timelineMain}><strong>{item.title}</strong></span>
        <span className={styles.timelineBy}>{item.by && <bdi>{item.by}</bdi>}<time dateTime={item.time}>{formatRiyadhDateTime(item.time)}</time></span>
      </summary>{item.body ? <p className={styles.decisionNote}>{item.body}</p> : <p className={styles.notice}>لا توجد ملاحظة مسجلة لهذا النشاط.</p>}</details></li>)}</ol>
    </details>}
  </section>;
}

function AuditFilters({ compact, active, children }: { compact: boolean; active: boolean; children: React.ReactNode }) {
  return compact ? <details className={styles.compactFilters}><summary>تصفية الأحداث وتصديرها{active && ' · تصفية نشطة'}</summary>{children}</details> : <>{children}</>;
}

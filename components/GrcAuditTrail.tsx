'use client';

import { formatRiyadhTime } from "@/lib/dates";
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createReadEpoch } from '@/lib/strategy-read';
import { formatGrcDate, csvDownload } from '@/lib/grc';
import { readAuditPages } from '@/lib/audit-schedule';
import { type AuditControl, type AuditEvent, actions, changed, entities, escapeAuditLike, eventLink, eventReference, fields, showValue } from '@/lib/audit-trail';
import styles from './GrcAuditTrail.module.css';

const pageSize = 30;
const failure = 'تعذر تحميل سجل التدقيق. أعد المحاولة.';

export default function GrcAuditTrail({ controlId, reliableRead = false, full = false, globalLink = false }: {
  controlId?: number; reliableRead?: boolean; full?: boolean; globalLink?: boolean;
}) {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [controls, setControls] = useState<AuditControl[]>([]);
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
  const epoch = useRef(createReadEpoch());
  const filters = Boolean(kind || action || actor || controlCode || since || until);
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
      let ids: number[] | undefined = controlId ? [controlId] : undefined;
      if (code && !controlId) {
        const matches = await readAuditPages((from, to) => supabase.from('controls').select('id', { count: 'exact' })
          .ilike('control_code', escapeAuditLike(code)).order('id').range(from, to), item => item.id);
        if (!epoch.current.valid(ticket)) return;
        ids = matches.map(item => item.id);
        if (!ids.length) {
          setRows([]);
          setHasNext(false);
          return;
        }
      }
      let query = supabase.from('grc_audit_events')
        .select('id,control_id,entity_type,entity_id,action,actor_id,actor_name,occurred_at,previous_data,new_data')
        .order('occurred_at', { ascending: false }).order('id', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      if (ids?.length === 1) query = query.eq('control_id', ids[0]);
      else if (ids?.length) query = query.in('control_id', ids);
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
      const values = response.data ?? [];
      const nextRows = values.slice(0, pageSize);
      const controlIds = [...new Set(nextRows.map(item => item.control_id).filter((id): id is number => id !== null))];
      const lookup = controlIds.length ? await supabase.from('controls').select('id,control_code,title_ar').in('id', controlIds) : null;
      if (!epoch.current.valid(ticket)) return;
      setRows(nextRows);
      setControls(lookup?.data ?? []);
      setHasNext(values.length > pageSize);
    } catch (e) {
      if (!epoch.current.valid(ticket)) return;
      setError(reliableRead || full ? failure : e instanceof Error ? e.message : failure);
      setRows([]);
      setHasNext(false);
    } finally {
      if (epoch.current.valid(ticket)) setLoading(false);
    }
  }, [action, actor, controlCode, controlId, dateError, full, kind, page, reliableRead, since, until]);

  useEffect(() => {
    const current = epoch.current;
    const timer = setTimeout(() => { void load(); }, 200);
    return () => { clearTimeout(timer); current.cancel(); };
  }, [load]);
  useEffect(() => {
    if (!full) return;
    let live = true;
    void supabase.from('grc_audit_events').select('occurred_at').order('occurred_at').limit(1).then(({ data, error }) => {
      if (live && !error) setEarliest(data?.[0]?.occurred_at ?? '');
    });
    return () => { live = false; };
  }, [full]);

  const lookup = new Map(controls.map(item => [item.id, item]));
  const person = (row: AuditEvent) => row.actor_name || row.actor_id || 'عملية نظام';
  const label = (row: AuditEvent) => entities[row.entity_type] ?? row.entity_type;
  const verb = (row: AuditEvent) => actions[row.action] ?? row.action;
  const reference = (row: AuditEvent) => eventReference(row, lookup.get(row.control_id ?? 0));
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
    setSince('');
    setUntil('');
    setPage(0);
  }
  function exportPage() {
    csvDownload('grc-audit-events.csv', [
      ['الوقت', 'المستخدم', 'نوع العنصر', 'العملية', 'مرجع العنصر', 'اسم العنصر', 'الضابط', 'رقم الحدث', 'الحقول المتغيرة'],
      ...rows.map(row => {
        const ref = reference(row);
        return [row.occurred_at, person(row), label(row), verb(row), ref.code, ref.title, ref.context || row.control_id || '',
          row.id, changed(row).map(key => fields[key] ?? key).join('،')];
      }),
    ]);
  }

  function details(row: AuditEvent) {
    const keys = changed(row);
    const linked = eventLink(row, full);
    return <div className={styles.details}>
      <div className={styles.detailBar}><span>الحدث <b dir="ltr">#{row.id}</b></span>
        {linked && <Link href={linked.href}>{linked.label} ←</Link>}
      </div>
      {keys.length > 0 ? <table className={styles.diff}><thead><tr><th scope="col">الحقل</th><th scope="col">قبل</th><th scope="col">بعد</th></tr></thead>
        <tbody>{keys.map(key => <tr key={key}><th scope="row">{fields[key] ?? key}</th>
          <td dir="auto">{showValue(key, row.previous_data?.[key])}</td><td dir="auto">{showValue(key, row.new_data?.[key])}</td></tr>)}</tbody>
      </table> : <p>لا توجد قيم قبل وبعد مسجّلة لهذا الحدث.</p>}
    </div>;
  }

  return <section dir="rtl" className={`${styles.card} ${full ? styles.full : styles.embedded}`}>
    <header className={styles.header}><div><h2>سجل الأحداث التلقائي</h2>
      <p>يعرض السجل الأحداث منذ تفعيله. للقرارات الأقدم، ارجع إلى سجل مراجعة الدليل.</p>
      {full && earliest && <p className={styles.coverage}>أقدم حدث ضمن صلاحياتك {formatGrcDate(earliest)} · بتوقيت الرياض</p>}
    </div>
      {globalLink && controlId && <Link href={`/audit?control=${controlId}`}>فتح في السجل العام ←</Link>}
    </header>
    <div className={styles.filters}>
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
    <div className={styles.bar}>
      {controlId && full && <span>عرض التغييرات للضابط {lookup.get(controlId)?.control_code || `#${controlId}`} <Link href="/audit">عرض السجل الكامل</Link></span>}
      {filters && <button type="button" onClick={reset}>مسح الفلاتر</button>}
      <button type="button" className={styles.export} disabled={loading || !!dateError || !!error || !rows.length} onClick={exportPage}>تصدير الصفحة الحالية (CSV)</button>
    </div>
    {dateError ? <p role="alert" className={styles.notice}>{dateError}</p> : loading ? <p role="status" className={styles.notice}>جارٍ تحميل الأحداث…</p>
      : error ? <div role="alert" className={styles.notice}>{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>
      : !rows.length ? <p className={styles.notice}>لا توجد أحداث مطابقة.</p>
      : full ? <div className={styles.tableWrap}><table className={styles.events}>
        <thead><tr><th scope="col">العنصر</th><th scope="col">الإجراء</th><th scope="col">المستخدم</th><th scope="col">الوقت</th></tr></thead>
        <tbody>{rows.map(row => {
          const ref = reference(row);
          return <Fragment key={row.id}>
            <tr className={styles.eventRow}>
              <td><button aria-expanded={openId === row.id} aria-label={`تفاصيل الحدث ${row.id} · ${ref.title || ref.code}`}
                onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                <span>{label(row)} · <b dir="ltr">{ref.code}</b></span>
                {ref.title && <strong title={ref.title}>{ref.title}</strong>}
                {ref.context && <small>الضابط <b dir="ltr">{ref.context}</b></small>}
              </button></td>
              <td><span className={styles.verb}>{verb(row)}</span></td><td>{person(row)}</td>
              <td><time dateTime={row.occurred_at}>{formatGrcDate(row.occurred_at)}<small>{formatRiyadhTime(row.occurred_at)}</small></time></td>
            </tr>
            {openId === row.id && <tr className={styles.expanded}><td colSpan={4}>{details(row)}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table></div>
      : rows.map(row => {
        const ref = reference(row);
        return <details key={row.id} className={styles.item}><summary>
          <strong>{verb(row)} · {label(row)} · <b dir="ltr">{ref.code}</b></strong>
          <small>{person(row)} · {formatGrcDate(row.occurred_at)} · {formatRiyadhTime(row.occurred_at)}</small>
        </summary>{details(row)}</details>;
      })}
    <nav className={styles.pagination} aria-label="صفحات سجل التدقيق">
      <button disabled={!page || loading} onClick={() => go(page - 1)}>الأحدث</button>
      <span aria-live="polite">صفحة {page + 1}</span>
      <button disabled={!hasNext || loading} onClick={() => go(page + 1)}>الأقدم</button>
    </nav>
  </section>;
}

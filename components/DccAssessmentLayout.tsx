'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { assessmentLabels, cycleLabels, displayPercent, reviewLabels, type AssessmentCycle, type AssessmentItem, type Person, type assessmentMetrics } from '@/lib/assessment';
import { dccAssessmentsHref, dccCatalogHref, dccCycleHref, dccMeasurementTool, dccStage, dccStageLabels } from '@/lib/dcc-assessment-navigation';
import { formatRiyadhDate, riyadhIsoDate } from '@/lib/dates';
import './dcc-assessment-layout.css';

type Command = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
type DecisionAction = 'start' | 'collect' | 'submit' | 'return' | 'complete' | 'approve' | 'close' | 'reassess';

const decisionLabels: Record<DecisionAction, string> = {
  start: 'بدء التقييم', collect: 'جمع الأدلة', submit: 'إرسال للمراجعة', return: 'إعادة للاستكمال',
  complete: 'إكمال المراجعة', approve: 'اعتماد التقييم', close: 'إغلاق الدورة', reassess: 'إنشاء إعادة تقييم',
};
const stageCopy: Record<string, string> = {
  draft: 'حدّد نطاق الحساب وعيّن المقيّم والمراجع والمعتمد قبل بدء العمل.',
  in_progress: 'سجّل نتائج التطبيق واربط الأدلة. بعد استكمال البنود، أرسل الدورة إلى المراجع.',
  evidence_collection: 'استكمل الأدلة والنتائج التي تحتاج متابعة قبل الإرسال للمراجعة.',
  under_review: 'يراجع المكلّف النتائج والأدلة ويقبل كل بند أو يعيده للاستكمال.',
  completed: 'اكتملت المراجعة. يعتمد المكلّف النتيجة ويحدّد موعد إعادة التقييم.',
  approved: 'هذه نتيجة داخلية معتمدة. لا يُعدّل محتوى الدورة بعد الاعتماد.',
  closed: 'هذه دورة مغلقة محفوظة للرجوع إليها.',
};

function Icon({ kind }: { kind: 'workflow' | 'check' | 'arrow' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'workflow' && <><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h5"/></>}
    {kind === 'check' && <path d="m6 12 4 4 8-8"/>}
    {kind === 'arrow' && <path d="M19 12H5m7 7-7-7 7-7"/>}
  </svg>;
}

function DccHero({ title, subtitle, tag, cycle, actions }: { title: string; subtitle: string; tag: string; cycle?: AssessmentCycle; actions?: ReactNode }) {
  return <header className="dcc-hero">
    <div className="dcc-hero-top"><div className="dcc-eyebrow"><Icon kind="workflow"/> مساحة عمل التقييم</div><bdi dir="ltr" className="dcc-code-chip">{tag}</bdi></div>
    <div className="dcc-hero-main">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="dcc-hero-actions ae-no-print">{actions}</div>}
    </div>
    {cycle && <div className="dcc-hero-meta"><span className="dcc-chip dcc-state">{cycleLabels[cycle.status] ?? cycle.status}</span><span>الدورة <bdi dir="ltr">#{cycle.id}</bdi></span>
      <span>الاستحقاق <strong>{formatRiyadhDate(cycle.due_date, 'غير محدد')}</strong></span>
      {cycle.next_review_date && <span>إعادة التقييم <strong>{formatRiyadhDate(cycle.next_review_date)}</strong></span>}
      {cycle.imported && !cycle.approved_at && <span>سجل مستورد دون اعتماد سابق</span>}</div>}
  </header>;
}

function Breadcrumbs({ showCycles = false }: { showCycles?: boolean }) {
  return <nav className="dcc-crumb ae-no-print" aria-label="مسار التقييم">
    <Link href={dccCatalogHref}>ضوابط DCC</Link><span aria-hidden="true">‹</span>
    {showCycles ? <><Link href={dccAssessmentsHref}>دورات التقييم</Link><span aria-hidden="true">‹</span><span aria-current="page">تفاصيل الدورة</span></>
      : <span aria-current="page">دورات التقييم</span>}
  </nav>;
}

function DccDialog({ title, aside, children, close }: { title: string; aside?: boolean; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return <dialog dir="rtl" ref={ref} aria-labelledby={titleId} className={`dcc-dialog${aside ? ' dcc-drawer' : ''}`}
    onClose={close} onClick={event => { if (event.target === event.currentTarget) ref.current?.close(); }}>
    <div className="dcc-dialog-body">
      <div className="dcc-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={() => ref.current?.close()} aria-label="إغلاق">×</button></div>
      {children}
    </div>
  </dialog>;
}

export function DccAssessmentIndex({ cycles, loading, couldCreate, create, unavailable, error, retry, version }: {
  cycles: AssessmentCycle[]; loading: boolean; couldCreate: boolean; create: ReactNode; unavailable: boolean;
  error: string; retry: () => void; version: string | undefined;
}) {
  const [creating, setCreating] = useState(false);
  return <main className="workflow-page ae-page dcc-workspace" dir="rtl">
    <Breadcrumbs/>
    <DccHero title="تقييم ضوابط الأمن السيبراني للبيانات" tag={`DCC-${(version ?? '1-2022').replace('-', ':')}`}
      subtitle="كل دورة لها نطاق مستقل ومسؤولون محددون ونتيجة تُراجع قبل اعتمادها."
      actions={couldCreate && <button type="button" className="dcc-primary dcc-light" onClick={() => setCreating(true)}>+ إنشاء دورة تقييم</button>}/>
    {error && !creating && <div className="ae-error" role="alert">{error} <button type="button" onClick={retry}>إعادة المحاولة</button></div>}
    {unavailable && !loading && !error && <p className="dcc-empty" role="status">الدورة المطلوبة غير متاحة ضمن صلاحياتك. يمكنك فتح دورة متاحة من القائمة.</p>}
    <section className="dcc-index-card">
      <div className="dcc-section-head"><div><h2>دورات التقييم</h2><p>افتح دورة لمتابعتها أو للاطلاع على نتيجتها المحفوظة.</p></div>
        <a href={dccMeasurementTool} target="_blank" rel="noreferrer" className="dcc-quiet-link">أداة الهيئة المرجعية ↗</a></div>
      {loading ? <p className="dcc-empty" role="status">جارٍ تحميل الدورات…</p> : cycles.length ? <ul className="dcc-cycle-index">
        {cycles.map(cycle => <li key={cycle.id}>
          <Link href={dccCycleHref(cycle.id)}><span className="dcc-icon-tile"><Icon kind="workflow"/></span>
            <span className="dcc-index-name"><strong>{cycle.scope_name}</strong><small>الدورة <bdi dir="ltr">#{cycle.id}</bdi> · {formatRiyadhDate(cycle.created_at)}{cycle.imported && ' · سجل مستورد'}</small></span>
            <span className="dcc-chip" data-tone={['approved', 'closed'].includes(cycle.status) ? 'ok' : 'pending'}>{cycleLabels[cycle.status] ?? cycle.status}</span>
            <span className="dcc-index-arrow"><Icon kind="arrow"/></span>
          </Link>
        </li>)}
      </ul> : <p className="dcc-empty">{couldCreate ? 'ما فيه دورات تقييم حتى الآن. أنشئ دورة لتحديد النطاق والمسؤوليات.' : 'لا توجد دورات متاحة ضمن صلاحياتك.'}</p>}
    </section>
    {creating && <DccDialog title="إنشاء دورة تقييم DCC" close={() => setCreating(false)}>
      <p className="dcc-muted">تُحفظ كمسودة أولًا. يمكنك تحديد وحدات الحساب وإسناد الأدوار بعد الإنشاء.</p>
      {error && <p role="alert" className="ae-error">{error}</p>}{create}
    </DccDialog>}
  </main>;
}

function WorkflowStages({ cycle }: { cycle: AssessmentCycle }) {
  const active = dccStage(cycle.status);
  const finished = ['approved', 'closed'].includes(cycle.status);
  return <ol className="dcc-stages ae-no-print" aria-label="مراحل دورة التقييم">
    {dccStageLabels.map((label, i) => {
      const done = i < active || finished;
      const current = i === active && !finished;
      return <li key={label} data-stage={done ? 'done' : current ? 'current' : 'next'} aria-current={current ? 'step' : undefined}>
        <span className="dcc-stage-num" aria-hidden="true">{done ? <Icon kind="check"/> : i + 1}</span>
        <span><strong>{label}</strong><small>{done ? 'مكتملة' : current ? 'المرحلة الحالية' : 'لاحقًا'}</small></span>
      </li>;
    })}
  </ol>;
}

function cycleActions(cycle: AssessmentCycle, actor: string, team: boolean): DecisionAction[] {
  if (!team || !actor) return [];
  if (cycle.status === 'draft' && actor === cycle.assessor_id && cycle.scope_confirmed_at && cycle.assessor_id && cycle.reviewer_id && cycle.approver_id && cycle.due_date) return ['start'];
  if (cycle.status === 'in_progress' && actor === cycle.assessor_id) return ['submit', 'collect'];
  if (cycle.status === 'evidence_collection' && actor === cycle.assessor_id) return ['submit'];
  if (cycle.status === 'under_review' && actor === cycle.reviewer_id) return ['complete', 'return'];
  if (cycle.status === 'completed') return [...(actor === cycle.approver_id && actor !== cycle.assessor_id ? ['approve' as const] : []), ...(actor === cycle.reviewer_id ? ['return' as const] : [])];
  if (cycle.status === 'approved') return [...(actor === cycle.approver_id ? ['close' as const] : []), 'reassess'];
  if (cycle.status === 'closed') return ['reassess'];
  return [];
}

function DecisionDialog({ action, cycle, command, busy, error, close }: {
  action: DecisionAction; cycle: AssessmentCycle; command: Command; busy: boolean; error: string; close: () => void;
}) {
  const [reason, setReason] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [firstReviewDate] = useState(() => riyadhIsoDate(new Date(Date.now() + 86_400_000)));
  const requiresReason = ['return', 'approve', 'close'].includes(action);
  const dateField = action === 'approve' || action === 'reassess';
  return <DccDialog title={decisionLabels[action]} close={close}>
    <p className="dcc-muted">{cycle.scope_name} · الدورة <bdi dir="ltr">#{cycle.id}</bdi></p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (await command(action, { reason: reason.trim(), next_review_date: nextDate || null, due_date: nextDate || null })) close();
    }} className="dcc-decision-form">
      {action === 'approve' && <p className="dcc-notice">تُحفظ نسخة معتمدة داخليًا من النتيجة، ولن يمكن تعديل بنودها مباشرة بعد الاعتماد.</p>}
      {requiresReason && <label>سبب القرار<textarea value={reason} onChange={event => setReason(event.target.value)} required/></label>}
      {dateField && <label>{action === 'approve' ? 'موعد إعادة التقييم' : 'موعد الدورة الجديدة (اختياري)'}<input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} required={action === 'approve'} min={action === 'approve' ? firstReviewDate : undefined}/></label>}
      {error && <p role="alert" className="ae-error">{error}</p>}
      <div className="dcc-decision-actions"><button type="submit" className="dcc-primary" disabled={busy || (requiresReason && !reason.trim())}>{decisionLabels[action]}</button><button type="button" onClick={close}>إلغاء</button></div>
    </form>
  </DccDialog>;
}

type SummaryMetrics = ReturnType<typeof assessmentMetrics>;
type LayoutProps = {
  cycle: AssessmentCycle; people: Person[]; actor: string; role: string; team: boolean; busy: boolean;
  metrics: SummaryMetrics; gapCount: number; overdueCount: number;
  domains: string[]; search: string; setSearch: (s: string) => void; domain: string; setDomain: (s: string) => void;
  status: string; setStatus: (s: string) => void; visible: AssessmentItem[]; page: number; setPage: (p: number) => void;
  openItem: AssessmentItem | undefined; open: (id: number | null) => void; evidenceCount: (id: number) => number;
  editor: ReactNode; setup: ReactNode; executive: ReactNode; mode: string; setMode: (m: string) => void;
  command: Command; exportRows: () => void; error: string; message: string; retry: () => void;
};

export function DccAssessmentCycle(props: LayoutProps) {
  const { cycle, metrics, actor, role, team, busy, search, setSearch, domain, setDomain, status, setStatus,
    domains, visible, page, setPage, openItem, open, editor, mode, setMode, evidenceCount, error, message, retry } = props;
  const [decision, setDecision] = useState<DecisionAction | null>(null);
  const actions = cycleActions(cycle, actor, team);
  const quick = (value: string) => { setStatus(status === value ? '' : value); setMode('operational'); setPage(0); };
  const reviewerNames = [['المقيّم', cycle.assessor_id], ['المراجع', cycle.reviewer_id], ['المعتمد', cycle.approver_id]] as const;
  const formattedTitle = (item: AssessmentItem) => item.title_ar.replace(/\s+[-–]\s+[\d-]+\s*$/, '').trim();
  const statusChip = (item: AssessmentItem) => <span className="dcc-chip" data-tone={item.compliance_status === 'implemented' ? 'ok' : item.compliance_status === 'partially_implemented' ? 'pending' : item.compliance_status === 'not_implemented' ? 'alert' : 'neutral'}>{assessmentLabels[item.compliance_status ?? ''] ?? 'لم يُقيّم'}</span>;
  const openButton = (item: AssessmentItem) => <button className="dcc-row-open" type="button" aria-haspopup="dialog" aria-label={`فتح البند ${item.control_code}`} onClick={() => open(item.id)}>فتح <span aria-hidden="true">←</span></button>;
  const rowTitle = (item: AssessmentItem) => <><div className="dcc-row-title"><bdi className="dcc-control-code" dir="ltr">{item.control_code}</bdi><strong>{formattedTitle(item)}</strong></div>
    <p>{item.description_ar || item.title_ar}</p>{!item.is_scoring && <small>للسياق · خارج الحساب الحالي</small>}</>;
  return <main className="workflow-page ae-page dcc-workspace" dir="rtl">
    <Breadcrumbs showCycles/>
    <DccHero title={cycle.scope_name} tag={`DCC-${cycle.framework_version.replace('-', ':')}`} cycle={cycle}
      subtitle={stageCopy[cycle.status] ?? 'تقييم ضوابط الأمن السيبراني للبيانات'}
      actions={actions[0] && <><button type="button" className="dcc-primary dcc-light" disabled={busy} onClick={() => setDecision(actions[0])}>{decisionLabels[actions[0]]} <span aria-hidden="true">←</span></button>
        {actions.length > 1 && <details className="dcc-more"><summary>إجراءات أخرى</summary>
          <div>{actions.slice(1).map(action => <button type="button" key={action} disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setDecision(action); }}>{decisionLabels[action]}</button>)}</div></details>}</>}/>
    <WorkflowStages cycle={cycle}/>
    {!decision && !openItem && error && <p role="alert" className="ae-error">{error} <button type="button" onClick={retry}>إعادة المحاولة</button></p>}
    {!openItem && message && <p role="status" className="workflow-success">{message}</p>}
    {team && <dl className="dcc-roles ae-no-print">{reviewerNames.map(([label, id]) => <div key={label}><dt>{label}</dt><dd>{id ? props.people.find(person => person.user_id === id)?.display_name || 'مكلّف' : 'لم يُعيّن'}</dd></div>)}</dl>}
    {props.setup}
    {cycle.status === 'draft' && !cycle.scope_confirmed_at && <p className="dcc-notice">لم يُؤكّد نطاق الحساب بعد. النطاق المقترح قابل للمراجعة قبل بدء الدورة.</p>}
    <section className="dcc-summary" aria-label="ملخص دورة التقييم">
      <div className="dcc-metric dcc-metric-result"><span>الالتزام المعتمد داخليًا</span><strong>{metrics.compliance === null ? (['approved', 'closed'].includes(cycle.status) ? 'لا توجد نسبة' : 'لم يُعتمد') : <bdi dir="ltr">{displayPercent(metrics.compliance)}</bdi>}</strong><small>النتيجة الداخلية وليست نتيجة حصين</small></div>
      <div className="dcc-metric"><span>تقدّم إدخال النتائج</span><strong><bdi dir="ltr">{metrics.assessed} / {metrics.total}</bdi></strong>
        <progress className="dcc-progress" aria-label="تقدّم إدخال النتائج" value={metrics.assessed} max={Math.max(1, metrics.total)}/>
      </div>
      <button className="dcc-metric ae-no-print" type="button" onClick={() => quick('unassessed')} aria-pressed={status === 'unassessed' && mode === 'operational'}><span>لم يُقيّم</span><strong>{metrics.unassessed}</strong><small>عرض البنود ←</small></button>
      <button className="dcc-metric ae-no-print" type="button" onClick={() => quick('gap')} aria-pressed={status === 'gap' && mode === 'operational'}><span>الفجوات المفتوحة</span><strong>{props.gapCount}</strong><small>{props.overdueCount} تجاوزت موعد المعالجة</small></button>
    </section>
    <section className="dcc-register">
      <div className="dcc-section-head"><div><h2>{mode === 'executive' ? 'ملخص الدورة' : 'بنود التقييم'}</h2><p>{role === 'control_owner' ? 'تعرض الصفحة البنود ضمن نطاق تكليفك.' : 'تقييم البنود والأدلة والملاحظات في دورة واحدة.'}</p></div>
        <div className="dcc-register-actions ae-no-print">
          {role !== 'control_owner' && <div className="dcc-view-toggle" role="group" aria-label="طريقة عرض التقييم"><button type="button" aria-pressed={mode === 'operational'} onClick={() => setMode('operational')}>البنود</button><button type="button" aria-pressed={mode === 'executive'} onClick={() => setMode('executive')}>ملخص</button></div>}
          <details className="dcc-more dcc-more-light"><summary>خيارات</summary><div>
            <button type="button" disabled={busy} onClick={props.exportRows}>تصدير CSV</button>
            <button type="button" onClick={() => window.print()}>طباعة / PDF</button>
            <a href={dccMeasurementTool} target="_blank" rel="noreferrer">أداة الهيئة المرجعية ↗</a>
          </div></details>
        </div>
      </div>
      {mode === 'executive' ? props.executive : <>
        <div className="dcc-filters ae-no-print">
          <label>البحث<input type="search" dir="auto" value={search} placeholder="رمز الضابط أو نصه" onChange={event => { setSearch(event.target.value); setPage(0); }}/></label>
          <label>المجال<select value={domain} onChange={event => { setDomain(event.target.value); setPage(0); }}><option value="">جميع المجالات</option>{domains.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>الحالة<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
            <option value="">جميع البنود</option><option value="scoring">داخل نطاق الحساب</option><option value="unassessed">لم يُقيّم</option><option value="changes_requested">يحتاج استكمالًا</option><option value="gap">فجوات مفتوحة</option><option value="overdue">معالجات متأخرة</option>
            {Object.entries(assessmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        {visible.length ? <div className="dcc-table">
          <table><thead><tr><th scope="col">البند</th><th scope="col">التطبيق</th><th scope="col">المراجعة</th><th scope="col">الأدلة</th><th scope="col"><span className="dcc-sr">التفاصيل</span></th></tr></thead>
            <tbody>{visible.map((item, index) => <tr key={item.id} className={index < page * 12 || index >= (page + 1) * 12 ? 'dcc-print-row' : undefined}>
              <td>{rowTitle(item)}</td><td>{statusChip(item)}</td>
              <td>{reviewLabels[item.review_status] ?? '—'}</td><td>{evidenceCount(item.id)}</td>
              <td className="ae-no-print">{openButton(item)}</td>
            </tr>)}</tbody>
          </table>
          </div> : <p className="dcc-empty" role="status">لا توجد بنود مطابقة للتصفية.</p>}
        {visible.length > 0 && <ul className="dcc-item-cards ae-no-print" aria-label="بنود التقييم">
          {visible.slice(page * 12, (page + 1) * 12).map(item => <li key={item.id}>
            {rowTitle(item)}
            <div className="dcc-item-status">{statusChip(item)}<span>{reviewLabels[item.review_status] ?? '—'}</span></div>
            <div className="dcc-item-footer"><span>{evidenceCount(item.id)} دليل مرتبط</span>{openButton(item)}</div>
          </li>)}
        </ul>}
        <div className="dcc-paging ae-no-print"><span role="status">عرض {visible.length ? page * 12 + 1 : 0}–{Math.min(visible.length, (page + 1) * 12)} من {visible.length}</span><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</button><button type="button" disabled={(page + 1) * 12 >= visible.length} onClick={() => setPage(page + 1)}>التالي</button></div>
      </>}
    </section>
    {openItem && <DccDialog aside title={`تفاصيل البند ${openItem.control_code}`} close={() => open(null)}>
      {error && <p role="alert" className="ae-error">{error}</p>}{message && <p role="status" className="workflow-success">{message}</p>}{editor}
    </DccDialog>}
    {decision && <DecisionDialog key={decision} action={decision} cycle={cycle} command={props.command} busy={busy} error={error} close={() => setDecision(null)}/>}
  </main>;
}

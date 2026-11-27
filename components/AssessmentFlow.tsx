'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { assessmentLabels, cycleLabels, displayPercent, reviewLabels, type AssessmentCycle, type AssessmentItem, type Person, type assessmentMetrics } from '@/lib/assessment';
import { assessmentCatalogHref, assessmentCycleHref, assessmentStage, assessmentStageLabels, type CompactAssessmentFramework } from '@/lib/assessment-navigation';
import { formatRiyadhDate, riyadhIsoDate } from '@/lib/dates';
import './assessment-flow.css';

type Command = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
type DecisionAction = 'start' | 'collect' | 'submit' | 'return' | 'complete' | 'approve' | 'close' | 'reassess';

const decisionLabels: Record<DecisionAction, string> = {
  start: 'بدء التقييم', collect: 'جمع الأدلة', submit: 'إرسال للمراجعة', return: 'إعادة للاستكمال',
  complete: 'إكمال المراجعة', approve: 'اعتماد التقييم', close: 'إغلاق الدورة', reassess: 'إنشاء إعادة تقييم',
};

function Icon({ kind }: { kind: 'workflow' | 'check' | 'arrow' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'workflow' && <><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 12h8M8 16h5"/></>}
    {kind === 'check' && <path d="m6 12 4 4 8-8"/>}
    {kind === 'arrow' && <path d="M19 12H5m7 7-7-7 7-7"/>}
  </svg>;
}

function FlowHero({ title, subtitle, tag, cycle, actions }: { title: string; subtitle?: string; tag: string; cycle?: AssessmentCycle; actions?: ReactNode }) {
  return <header className={`assessment-flow-hero${cycle ? ' assessment-flow-hero-cycle' : ''}`}>
    {cycle ? <div className="assessment-flow-hero-main">
      <div className="assessment-flow-cycle-identity">
        <div className="assessment-flow-hero-meta">
          <bdi dir="ltr" className="assessment-flow-code-chip">{tag}</bdi>
          <span className="assessment-flow-chip assessment-flow-state" data-tone={['approved', 'closed'].includes(cycle.status) ? 'ok' : 'pending'}>{cycleLabels[cycle.status] ?? cycle.status}</span>
          <span>دورة <bdi dir="ltr">#{cycle.id}</bdi></span>
        </div>
        <h1>{title}</h1>
        <div className="assessment-flow-cycle-due">الاستحقاق <strong>{formatRiyadhDate(cycle.due_date, 'غير محدد')}</strong></div>
      </div>
      {actions && <div className="assessment-flow-hero-actions ae-no-print">{actions}</div>}
    </div> : <>
      <div className="assessment-flow-hero-top"><div className="assessment-flow-eyebrow"><Icon kind="workflow"/> مساحة عمل التقييم</div><bdi dir="ltr" className="assessment-flow-code-chip">{tag}</bdi></div>
      <div className="assessment-flow-hero-main">
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="assessment-flow-hero-actions ae-no-print">{actions}</div>}
      </div>
    </>}
  </header>;
}

function Breadcrumbs({ framework, showCycles = false }: { framework: CompactAssessmentFramework; showCycles?: boolean }) {
  return <nav className="assessment-flow-crumb ae-no-print" aria-label="مسار التقييم">
    <Link href={assessmentCatalogHref(framework.code)}>ضوابط <bdi dir="ltr">{framework.code}</bdi></Link><span aria-hidden="true">‹</span>
    {showCycles ? <><Link href={framework.path}>دورات التقييم</Link><span aria-hidden="true">‹</span><span aria-current="page">تفاصيل الدورة</span></>
      : <span aria-current="page">دورات التقييم</span>}
  </nav>;
}

function FlowDialog({ title, aside, children, close }: { title: string; aside?: boolean; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return <dialog dir="rtl" ref={ref} aria-labelledby={titleId} className={`assessment-flow-dialog${aside ? ' assessment-flow-drawer' : ''}`}
    onClose={close} onClick={event => { if (event.target === event.currentTarget) ref.current?.close(); }}>
    <div className="assessment-flow-dialog-body">
      <div className="assessment-flow-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={() => ref.current?.close()} aria-label="إغلاق">×</button></div>
      {children}
    </div>
  </dialog>;
}

export function AssessmentFlowIndex({ framework, cycles, loading, couldCreate, create, unavailable, error, retry, version }: {
  framework: CompactAssessmentFramework; cycles: AssessmentCycle[]; loading: boolean; couldCreate: boolean; create: ReactNode; unavailable: boolean;
  error: string; retry: () => void; version: string | undefined;
}) {
  const [creating, setCreating] = useState(false);
  return <main className="workflow-page ae-page assessment-flow-workspace" dir="rtl">
    <Breadcrumbs framework={framework}/>
    <FlowHero title={`تقييم ${framework.title}`} tag={`${framework.code}-${(version ?? framework.version).replace('-', ':')}`}
      subtitle="كل دورة لها نطاق مستقل ومسؤولون محددون ونتيجة تُراجع قبل اعتمادها."
      actions={couldCreate && <button type="button" className="assessment-flow-primary assessment-flow-light" onClick={() => setCreating(true)}>+ إنشاء دورة تقييم</button>}/>
    {error && !creating && <div className="ae-error" role="alert">{error} <button type="button" onClick={retry}>إعادة المحاولة</button></div>}
    {unavailable && !loading && !error && <p className="assessment-flow-empty" role="status">الدورة المطلوبة غير متاحة ضمن صلاحياتك. يمكنك فتح دورة متاحة من القائمة.</p>}
    <section className="assessment-flow-index-card">
      <div className="assessment-flow-section-head"><div><h2>دورات التقييم</h2><p>افتح دورة لمتابعتها أو للاطلاع على نتيجتها المحفوظة.</p></div>
        <a href={framework.measurementTool} target="_blank" rel="noreferrer" className="assessment-flow-quiet-link">أداة الهيئة المرجعية ↗</a></div>
      {loading ? <p className="assessment-flow-empty" role="status">جارٍ تحميل الدورات…</p> : cycles.length ? <ul className="assessment-flow-cycle-index">
        {cycles.map(cycle => <li key={cycle.id}>
          <Link href={assessmentCycleHref(framework, cycle.id)}><span className="assessment-flow-icon-tile"><Icon kind="workflow"/></span>
            <span className="assessment-flow-index-name"><strong>{cycle.scope_name}</strong><small>الدورة <bdi dir="ltr">#{cycle.id}</bdi> · {formatRiyadhDate(cycle.created_at)}{cycle.imported && ' · سجل مستورد'}</small></span>
            <span className="assessment-flow-chip" data-tone={['approved', 'closed'].includes(cycle.status) ? 'ok' : 'pending'}>{cycleLabels[cycle.status] ?? cycle.status}</span>
            <span className="assessment-flow-index-arrow"><Icon kind="arrow"/></span>
          </Link>
        </li>)}
      </ul> : <p className="assessment-flow-empty">{couldCreate ? 'ما فيه دورات تقييم حتى الآن. أنشئ دورة لتحديد النطاق والمسؤوليات.' : 'لا توجد دورات متاحة ضمن صلاحياتك.'}</p>}
    </section>
    {creating && <FlowDialog title={`إنشاء دورة تقييم ${framework.code}`} close={() => setCreating(false)}>
      <p className="assessment-flow-muted">تُحفظ كمسودة أولًا. يمكنك تحديد وحدات الحساب وإسناد الأدوار بعد الإنشاء.</p>
      {error && <p role="alert" className="ae-error">{error}</p>}{create}
    </FlowDialog>}
  </main>;
}

function WorkflowStages({ cycle }: { cycle: AssessmentCycle }) {
  const active = assessmentStage(cycle.status);
  const finished = ['approved', 'closed'].includes(cycle.status);
  return <ol className="assessment-flow-stages ae-no-print" aria-label="مراحل دورة التقييم">
    {assessmentStageLabels.map((label, i) => {
      const done = i < active || finished;
      const current = i === active && !finished;
      return <li key={label} data-stage={done ? 'done' : current ? 'current' : 'next'} aria-current={current ? 'step' : undefined}>
        <span className="assessment-flow-stage-num" aria-hidden="true">{done ? <Icon kind="check"/> : i + 1}</span>
        <strong>{label}<span className="assessment-flow-sr">{done ? ' — مكتملة' : ''}</span></strong>
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
  return <FlowDialog title={decisionLabels[action]} close={close}>
    <p className="assessment-flow-muted">{cycle.scope_name} · الدورة <bdi dir="ltr">#{cycle.id}</bdi></p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (await command(action, { reason: reason.trim(), next_review_date: nextDate || null, due_date: nextDate || null })) close();
    }} className="assessment-flow-decision-form">
      {action === 'approve' && <p className="assessment-flow-notice">تُحفظ نسخة معتمدة داخليًا من النتيجة، ولن يمكن تعديل بنودها مباشرة بعد الاعتماد.</p>}
      {requiresReason && <label>سبب القرار<textarea value={reason} onChange={event => setReason(event.target.value)} required/></label>}
      {dateField && <label>{action === 'approve' ? 'موعد إعادة التقييم' : 'موعد الدورة الجديدة (اختياري)'}<input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} required={action === 'approve'} min={action === 'approve' ? firstReviewDate : undefined}/></label>}
      {error && <p role="alert" className="ae-error">{error}</p>}
      <div className="assessment-flow-decision-actions"><button type="submit" className="assessment-flow-primary" disabled={busy || (requiresReason && !reason.trim())}>{decisionLabels[action]}</button><button type="button" onClick={close}>إلغاء</button></div>
    </form>
  </FlowDialog>;
}

type SummaryMetrics = ReturnType<typeof assessmentMetrics>;
type LayoutProps = {
  framework: CompactAssessmentFramework; cycle: AssessmentCycle; people: Person[]; actor: string; role: string; team: boolean; busy: boolean;
  metrics: SummaryMetrics; gapCount: number; overdueCount: number;
  domains: string[]; search: string; setSearch: (s: string) => void; domain: string; setDomain: (s: string) => void;
  status: string; setStatus: (s: string) => void; visible: AssessmentItem[]; page: number; setPage: (p: number) => void;
  openItem: AssessmentItem | undefined; open: (id: number | null) => void; evidenceCount: (id: number) => number;
  editor: ReactNode; setup: ReactNode; executive: ReactNode; mode: string; setMode: (m: string) => void;
  command: Command; exportRows: () => void; error: string; message: string; retry: () => void;
};

export function AssessmentFlowCycle(props: LayoutProps) {
  const { framework, cycle, metrics, actor, role, team, busy, search, setSearch, domain, setDomain, status, setStatus,
    domains, visible, page, setPage, openItem, open, editor, mode, setMode, evidenceCount, error, message, retry } = props;
  const [decision, setDecision] = useState<DecisionAction | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const actions = cycleActions(cycle, actor, team);
  const quick = (value: string) => {
    setSearch(''); setDomain(''); setStatus(status === value ? '' : value); setMode('operational'); setPage(0);
  };
  const roleEntries = [['المقيّم', cycle.assessor_id], ['المراجع', cycle.reviewer_id], ['المعتمد', cycle.approver_id]] as const;
  const currentRole = roleEntries[assessmentStage(cycle.status) === 2 ? 1 : assessmentStage(cycle.status) === 3 ? 2 : 0];
  const finished = ['approved', 'closed'].includes(cycle.status);
  const hasSetup = Boolean(props.setup);
  const hasDetails = team || Boolean(cycle.next_review_date) || (cycle.imported && !cycle.approved_at);
  const displayPerson = (id: string | null) => !id ? 'غير معيّن' : props.people.find(person => person.user_id === id)?.display_name || (id === actor ? 'أنت' : 'مكلّف');
  const shortTitle = (item: AssessmentItem) => {
    const title = item.title_ar.replace(/\s+[-–]\s+[\d-]+\s*$/, '').trim();
    const description = item.description_ar?.trim().split(/\n\s*\n/, 1)[0].replace(/\s+/g, ' ');
    if (!description) return title;
    const actualRequirement = description.replace(/^(?:رجوع[ًاا]*|بالإضافة)[^،؛]{0,150}[،؛]\s*(?=(?:فإن|يجب|يُراجع|تُراجع))/, '');
    const words = actualRequirement.split(' ');
    if (actualRequirement.length <= 85) return actualRequirement;
    let short = '';
    for (const word of words) {
      if (`${short} ${word}`.trim().length > 78) break;
      short = `${short} ${word}`.trim();
    }
    return short ? `${short}…` : title;
  };
  const statusChip = (item: AssessmentItem) => <span className="assessment-flow-chip" data-tone={item.compliance_status === 'implemented' ? 'ok' : item.compliance_status === 'partially_implemented' ? 'pending' : item.compliance_status === 'not_implemented' ? 'alert' : 'neutral'}>{assessmentLabels[item.compliance_status ?? ''] ?? 'لم يُقيّم'}</span>;
  const openButton = (item: AssessmentItem) => <button className="assessment-flow-row-open" type="button" aria-haspopup="dialog" aria-label={`فتح البند ${item.control_code}`} onClick={() => open(item.id)}>فتح <span aria-hidden="true">←</span></button>;
  const rowTitle = (item: AssessmentItem) => <><div className="assessment-flow-row-title"><bdi className="assessment-flow-control-code" dir="ltr">{item.control_code}</bdi><strong>{shortTitle(item)}</strong>
    {!item.is_scoring && <small>خارج الحساب الحالي</small>}</div>
    <p className="ae-print-only">{item.description_ar || item.title_ar}</p></>;
  return <main className="workflow-page ae-page assessment-flow-workspace" dir="rtl">
    <Breadcrumbs framework={framework} showCycles/>
    <FlowHero title={cycle.scope_name} tag={`${framework.code}-${cycle.framework_version.replace('-', ':')}`} cycle={cycle}
      actions={actions[0] ? <><button type="button" className="assessment-flow-primary assessment-flow-light" disabled={busy} onClick={() => setDecision(actions[0])}>{decisionLabels[actions[0]]} <span aria-hidden="true">←</span></button>
        {actions.length > 1 && <details className="assessment-flow-more"><summary>إجراءات أخرى</summary>
          <div>{actions.slice(1).map(action => <button type="button" key={action} disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setDecision(action); }}>{decisionLabels[action]}</button>)}</div></details>}</>
        : hasSetup ? <button type="button" className="assessment-flow-primary assessment-flow-light" aria-haspopup="dialog" onClick={() => setSetupOpen(true)}>إعداد الدورة <span aria-hidden="true">←</span></button> : undefined}/>
    <section className="assessment-flow-cycle-flow ae-no-print" aria-label="سير دورة التقييم">
      <WorkflowStages cycle={cycle}/>
      {(!finished || hasDetails) && <div className="assessment-flow-cycle-context">
        {!finished && <p><span>{cycle.status === 'draft' && !cycle.scope_confirmed_at ? 'النطاق بحاجة إلى تأكيد' : 'المسؤول الآن'}</span>
          <strong>{currentRole[0]} · {displayPerson(currentRole[1])}</strong></p>}
        {hasDetails && <details className="assessment-flow-cycle-details">
          <summary>تفاصيل الدورة</summary>
          <div className="assessment-flow-cycle-facts">
            {team && <dl className="assessment-flow-roles">{roleEntries.map(([label, id]) => <div key={label}><dt>{label}</dt><dd>{displayPerson(id)}</dd></div>)}</dl>}
            {cycle.next_review_date && <p>إعادة التقييم <strong>{formatRiyadhDate(cycle.next_review_date)}</strong></p>}
            {cycle.imported && !cycle.approved_at && <p>سجل مستورد دون اعتماد سابق.</p>}
            {hasSetup && <button type="button" aria-haspopup="dialog" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setSetupOpen(true); }}>تعديل إعدادات الدورة</button>}
          </div>
        </details>}
      </div>}
    </section>
    {!decision && !openItem && !setupOpen && error && <p role="alert" className="ae-error">{error} <button type="button" onClick={retry}>إعادة المحاولة</button></p>}
    {!openItem && !setupOpen && message && <p role="status" className="workflow-success">{message}</p>}
    <section className="assessment-flow-summary" aria-label="ملخص دورة التقييم">
      <div className="assessment-flow-metric"><div className="assessment-flow-metric-line"><span>تقدّم التقييم</span><strong><bdi dir="ltr">{metrics.assessed} / {metrics.total}</bdi></strong></div>
        <progress className="assessment-flow-progress" aria-label="تقدّم إدخال النتائج" value={metrics.assessed} max={Math.max(1, metrics.total)}/>
      </div>
      <div className="assessment-flow-metric assessment-flow-metric-result"><div className="assessment-flow-metric-line"><span>الالتزام المعتمد داخليًا</span><strong>{metrics.compliance === null ? (finished ? 'لا توجد نسبة' : 'لم يُعتمد') : <bdi dir="ltr">{displayPercent(metrics.compliance)}</bdi>}</strong></div></div>
    </section>
    <section className="assessment-flow-register">
      <div className="assessment-flow-section-head"><div><h2>{mode === 'executive' ? 'ملخص الدورة' : 'بنود التقييم'}</h2>{role === 'control_owner' && <p>ضمن نطاق تكليفك</p>}</div>
        <div className="assessment-flow-register-actions ae-no-print">
          {role !== 'control_owner' && <div className="assessment-flow-view-toggle" role="group" aria-label="طريقة عرض التقييم"><button type="button" aria-pressed={mode === 'operational'} onClick={() => setMode('operational')}>البنود</button><button type="button" aria-pressed={mode === 'executive'} onClick={() => setMode('executive')}>ملخص</button></div>}
          <details className="assessment-flow-more assessment-flow-more-light"><summary>خيارات</summary><div>
            <button type="button" disabled={busy} onClick={props.exportRows}>تصدير CSV</button>
            <button type="button" onClick={() => window.print()}>طباعة / PDF</button>
            <a href={framework.measurementTool} target="_blank" rel="noreferrer">أداة الهيئة المرجعية ↗</a>
          </div></details>
        </div>
      </div>
      {mode === 'executive' ? props.executive : <>
        <div className="assessment-flow-quick ae-no-print" role="group" aria-label="تصفية سريعة">
          <button type="button" aria-pressed={status === 'unassessed'} onClick={() => quick('unassessed')}>لم يُقيّم <bdi>{metrics.unassessed}</bdi></button>
          <button type="button" aria-pressed={status === 'gap'} onClick={() => quick('gap')}>فجوات مفتوحة <bdi>{props.gapCount}</bdi></button>
          {props.overdueCount > 0 && <button type="button" aria-pressed={status === 'overdue'} onClick={() => quick('overdue')}>معالجة متأخرة <bdi>{props.overdueCount}</bdi></button>}
        </div>
        <div className="assessment-flow-filters ae-no-print">
          <label>البحث<input type="search" dir="auto" value={search} placeholder="رمز الضابط أو نصه" onChange={event => { setSearch(event.target.value); setPage(0); }}/></label>
          <label>المجال<select value={domain} onChange={event => { setDomain(event.target.value); setPage(0); }}><option value="">جميع المجالات</option>{domains.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>الحالة<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
            <option value="">جميع البنود</option><option value="scoring">داخل نطاق الحساب</option><option value="unassessed">لم يُقيّم</option><option value="changes_requested">يحتاج استكمالًا</option><option value="gap">فجوات مفتوحة</option><option value="overdue">معالجات متأخرة</option>
            {Object.entries(assessmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        {visible.length ? <div className="assessment-flow-table">
          <table><thead><tr><th scope="col">البند</th><th scope="col">التطبيق</th><th scope="col">المراجعة</th><th scope="col"><span className="assessment-flow-sr">التفاصيل</span></th></tr></thead>
            <tbody>{visible.map((item, index) => <tr key={item.id} className={index < page * 12 || index >= (page + 1) * 12 ? 'assessment-flow-print-row' : undefined}>
              <td>{rowTitle(item)}</td><td>{statusChip(item)}</td>
              <td>{reviewLabels[item.review_status] ?? '—'}</td>
              <td className="ae-no-print">{openButton(item)}</td>
            </tr>)}</tbody>
          </table>
          </div> : <p className="assessment-flow-empty" role="status">لا توجد بنود مطابقة للتصفية.</p>}
        {visible.length > 0 && <ul className="assessment-flow-item-cards ae-no-print" aria-label="بنود التقييم">
          {visible.slice(page * 12, (page + 1) * 12).map(item => <li key={item.id}>
            {rowTitle(item)}
            <div className="assessment-flow-item-status">{statusChip(item)}<span>{reviewLabels[item.review_status] ?? '—'}</span></div>
            <div className="assessment-flow-item-footer">{openButton(item)}</div>
          </li>)}
        </ul>}
        <div className="assessment-flow-paging ae-no-print"><span role="status">عرض {visible.length ? page * 12 + 1 : 0}–{Math.min(visible.length, (page + 1) * 12)} من {visible.length}</span><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</button><button type="button" disabled={(page + 1) * 12 >= visible.length} onClick={() => setPage(page + 1)}>التالي</button></div>
      </>}
    </section>
    {setupOpen && hasSetup && <FlowDialog aside title="إعداد دورة التقييم" close={() => setSetupOpen(false)}>
      {error && <p role="alert" className="ae-error">{error}</p>}
      {message && <p role="status" className="workflow-success">{message}</p>}
      {props.setup}
    </FlowDialog>}
    {openItem && <FlowDialog aside title={`تفاصيل البند ${openItem.control_code}`} close={() => open(null)}>
      {error && <p role="alert" className="ae-error">{error}</p>}{message && <p role="status" className="workflow-success">{message}</p>}
      <p className="assessment-flow-drawer-evidence">الأدلة المرتبطة <bdi>{evidenceCount(openItem.id)}</bdi></p>{editor}
    </FlowDialog>}
    {decision && <DecisionDialog key={decision} action={decision} cycle={cycle} command={props.command} busy={busy} error={error} close={() => setDecision(null)}/>}
  </main>;
}

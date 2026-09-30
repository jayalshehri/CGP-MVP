// Read-only UI/query-contract regression tests. No database or auth writes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions++; };
const calls = [];
let response = () => ({ data: [], error: null });
function query(name, args) {
  const state = { name, args, filters: [], select: null, range: null, order: [], limit: null };
  const builder = {
    select(columns) { state.select = columns; return this; },
    eq(column, value) { state.filters.push(['eq', column, value]); return this; },
    in(column, value) { state.filters.push(['in', column, value]); return this; },
    order(column, options) { state.order.push([column, options]); return this; },
    limit(value) { state.limit = value; return this; },
    range(from, to) { state.range = [from, to]; return this; },
    then(resolve, reject) { calls.push(state); return Promise.resolve(response(state)).then(resolve, reject); },
  };
  return builder;
}
const client = { from: name => query(name), rpc: (name, args) => query(name, args) };
const cache = new Map();
let renderState = null, stateIndex = 0;
let routeParams = new URLSearchParams();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const loadedModule = { exports: {} };
  cache.set(path, loadedModule.exports);
  const compiled = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => [renderState && stateIndex < renderState.length ? renderState[stateIndex++] : typeof initial === 'function' ? initial() : initial, () => {}] };
    if (name === 'next/navigation') return { useParams: () => ({ id: '42' }), useSearchParams: () => routeParams, useRouter: () => ({ push: () => { throw new Error('unexpected navigation during render'); }, replace: () => {} }) };
    if (name === './supabase' || name === '@/lib/supabase') return { supabase: client };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name.startsWith('@/')) return load(name.slice(2) + (name.startsWith('@/components/') ? '.tsx' : '.ts'));
    if (name.startsWith('.')) {
      const relative = posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts'));
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: loadedModule.exports, module: loadedModule, require: resolve, URLSearchParams, Date, Intl, console }, { filename: path });
  return loadedModule.exports;
}

const ui = load('lib/control360.ts');
check(ui.controlTabs.length === 6, 'six stable Control 360 tabs');
check(ui.positiveId('42') === 42 && ui.positiveId(null) === null, 'positive control context');
for (const id of ['0', '-1', '1.5', 'abc', '9007199254740992']) check(ui.positiveId(id) === null, 'invalid control context fails closed: ' + id);
const context = 'from=workspace&domain=2&view=followup&scope=provider&status=implemented&q=حماية&redirect=https://example.org';
const href = ui.controlHref(42, context, 'evidence');
check(href.startsWith('/controls/42?') && new URLSearchParams(href.split('?')[1]).get('tab') === 'evidence', 'durable selected tab');
check(!href.includes('redirect'), 'no arbitrary return URL');
check(new URLSearchParams(href.split('?')[1]).get('q') === 'حماية', 'Arabic list context survives refresh/back');
const register = ui.controlRegisterHref('findings', 'DCC', 42, context);
const registerParams = new URLSearchParams(register.split('?')[1]);
check(registerParams.get('framework') === 'DCC' && registerParams.get('control') === '42', 'central register is scoped by framework and control');
check(ui.controlHref(42, registerParams.get('return_context'), 'findings').includes('from=workspace'), 'control-to-register round trip');
for (const role of ['admin', 'cybersecurity_team']) check(ui.controlNextAction(role, false, false, 'not_uploaded', 0) === 'assign', 'team assignment action');
check(ui.controlNextAction('control_owner', false, true, 'not_uploaded', 0) === 'upload', 'owner evidence action');
check(ui.controlNextAction('nca_external_auditor', false, false, 'not_uploaded', 0) === null, 'auditor never gets a mutation action');
check(ui.controlNextAction('admin', true, false, 'not_uploaded', 0) === null, 'archived control has no next mutation');
check(ui.controlNextAction('admin', false, true, 'not_uploaded', null) === null, 'failed evidence read cannot invent next action');
check(ui.controlNextAction('admin', false, true, 'not_uploaded', 1) === null, 'eligible shared evidence prevents fabricated missing-evidence action');
check(ui.controlEventLabel({ entity_type: 'controls', action: 'update', previous_data: { control_owner_id: 'old' }, new_data: { control_owner_id: 'new' } }) === 'تغيير مالك الضابط', 'meaningful owner activity');
check(ui.controlEventLabel({ entity_type: 'evidence_reviews', action: 'insert' }).includes('قرار مراجعة دليل'), 'evidence decision activity');

const reads = load('lib/control360-read.ts');
const eligible = load('lib/framework-evidence.ts');
await eligible.loadEligibleFrameworkEvidence('DCC', 42);
check(calls.at(-1).args.p_control_id === 42 && calls.at(-1).args.p_framework_code === 'DCC', 'control-scoped authoritative eligibility RPC');
await eligible.loadEligibleFrameworkEvidence('DCC');
check(calls.at(-1).args.p_control_id === null, 'existing framework RPC contract unchanged');
await reads.loadControlActivity(42);
check(calls.at(-1).filters.some(([kind, key, value]) => kind === 'eq' && key === 'control_id' && value === 42), 'activity query server-scoped');
check(calls.at(-1).limit === 20, 'activity timeline bounded');
await reads.loadControlAssessments(42);
check(calls.at(-1).filters.some(([, key, value]) => key === 'control_id' && value === 42), 'assessment query server-scoped');
check(!calls.at(-1).select.includes('approved_snapshot') && !calls.at(-1).select.includes('*'), 'protected assessment columns never requested');
check(calls.at(-1).order[0][0] === 'updated_at', 'latest assessment is ordered by update date, not aggregate compliance');
const finding = { id: 101, owner: null };
response = state => ({ data: state.name === 'grc_findings' ? [finding] : state.name === 'grc_corrective_actions' ? [{ id: 501, finding_id: 101, status: 'completed' }] : [], error: null });
const start = calls.length;
const result = await reads.loadControlFindings(42);
check(result.findings.length === 1 && result.actions.length === 1, 'existing findings/actions reused');
check(calls[start].filters.some(([, key, value]) => key === 'control_id' && value === 42), 'findings filtered at database');
check(calls[start + 1].filters.some(([kind, key, value]) => kind === 'in' && key === 'finding_id' && value.length === 1 && value[0] === 101), 'actions batched against scoped finding IDs');
response = () => ({ data: [], error: null });
const emptyStart = calls.length;
const empty = await reads.loadControlFindings(42);
check(!empty.findings.length && !empty.actions.length && calls.length === emptyStart + 1, 'empty findings do not fetch all actions');
response = state => ({ data: state.range?.[0] === 0 ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 500 }], error: null });
const versions = await reads.loadControlEvidenceRegister(42);
check(versions.length === 501, 'control evidence history paged beyond row cap');
check(calls.slice(-2).every(call => call.filters.some(([, key, value]) => key === 'control_id' && value === 42)), 'each evidence page remains scoped');
response = () => ({ data: null, error: { message: 'simulated denied read' } });
await assert.rejects(() => reads.loadControlActivity(42)); assertions++;

const sections = load('components/Control360Sections.tsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const rows = [
  { id: 1, cycle_id: 2, compliance_status: 'implemented', review_status: 'accepted', updated_at: '2026-09-28', cycle: { scope_name: 'نطاق أ', status: 'closed', system_id: null } },
  { id: 3, cycle_id: 4, compliance_status: 'not_implemented', review_status: 'pending', updated_at: '2026-09-27', cycle: { scope_name: 'نطاق ب', status: 'draft', system_id: 7 } },
];
const assessments = render(sections.Control360Assessments, { rows, framework: 'DCC' });
check(assessments.includes('نطاق أ') && assessments.includes('نطاق ب'), 'multiple assessment scopes remain distinct');
check(assessments.includes('/dcc-assessment?cycle=2&amp;item=1') && assessments.includes('cycle=4&amp;item=3'), 'exact assessment-item deep links');
check(assessments.includes('نتيجة غير معتمدة'), 'unapproved assessment visibly labelled');
const cscc = render(sections.Control360Assessments, { rows: rows.slice(0, 1), framework: 'CSCC' });
check(cscc.includes('/assessments?cycle=2&amp;item=1'), 'CSCC existing route preserved');
check(render(sections.Control360Assessments, { rows: [], framework: 'ECC' }).includes('التقييم غير مفعّل'), 'no invented ECC assessment');
check(render(sections.Control360Findings, { rows: [], actions: [], href: register }).includes('لا توجد ملاحظات'), 'honest findings empty state');
check(render(sections.Control360Findings, { rows: [], actions: [], href: register, error: 'read failed' }).includes('تعذر تحميل'), 'read failure not mistaken for no findings');
const events = [{ id: 1, entity_type: 'controls', action: 'update', actor_name: 'مراجع اختبار', occurred_at: '2026-09-28T12:00:00Z', previous_data: { implementation_status: 'not_started', secret: 'DO-NOT-RENDER' }, new_data: { implementation_status: 'implemented' } }];
const timeline = render(sections.Control360Activity, { rows: events, canViewCentral: false });
check(timeline.includes('تغيير حالة التطبيق') && timeline.includes('مراجع اختبار'), 'activity timestamp/actor/business label');
check(!timeline.includes('DO-NOT-RENDER') && !timeline.includes('/audit'), 'no raw payload or unusable central-audit link');
const page = readFileSync(new URL('../app/controls/[id]/page.tsx', import.meta.url), 'utf8');
check(page.includes('officialRequirement=control.official_text_ar;'), 'official text does not fall back to internal content');
check(page.includes('control?.control_owner_id===actor'), 'owner upload UI bound to assignment');
check(page.includes('canManage={canReview} canSubmit={canUpload}'), 'periodic workflow permissions preserved');
check(page.includes('تفاصيل إضافية') && page.includes('المعرّف الداخلي'), 'internal requirement code secondary only');

// Render the actual page with inert effects and supplied read-only view models.
// These are UI fixtures, not inserts or claims of live-RLS certification.
const ControlPage = load('app/controls/[id]/page.tsx').default;
const baseControl = {
  id: 42, control_code: '1-1-1', title_ar: 'عنوان الضابط - 1-1-1', description_ar: 'وصف داخلي غير رسمي',
  official_text_ar: 'النص الرسمي المحفوظ دون إعادة صياغة', hierarchy_level: 'control', parent_control_id: null,
  domain_ar: 'الحوكمة', implementation_status: 'not_started', evidence_status: 'not_uploaded', verification_status: 'not_verified',
  control_owner: 'مالك اختبار', control_owner_id: 'actor', audit_frequency: 'annually',
  frameworks: { code: 'DCC', name_ar: 'ضوابط الأمن السيبراني للبيانات', version: '2022-1', is_active: true, source_url: 'https://example.org/official.pdf' },
};
function controlPage(tab, role, control = baseControl, extras = {}) {
  routeParams = new URLSearchParams({ tab, from: 'workspace' }); stateIndex = 0;
  renderState = [control, [], false, '', role, 'actor', extras.eligible ?? [], extras.assessments ?? [], extras.findings ?? [], extras.actions ?? [], [], {}, false,
    [], [], [], [], null, null, undefined, null, extras.parent ?? null, extras.children ?? []];
  const html = render(ControlPage, {});
  renderState = null;
  return html;
}
const overview = controlPage('overview', 'admin');
check(overview.includes('DCC') && overview.includes('2022-1') && overview.includes('ضابط أساسي'), 'DCC primary header/framework/version');
check(overview.includes('/compliance/DCC?tab=controls') && overview.includes('العودة إلى ضوابط DCC'), 'framework controls contextual return');
check(overview.includes('لا توجد بنود تقييم أو ملاحظات') && !overview.includes('workflow-metric'), 'no six empty zero KPI cards');
check(overview.includes('المراجعة الدورية للضابط'), 'periodic review remains separate in overview');
const sub = controlPage('official', 'admin', { ...baseControl, hierarchy_level: 'sub_control', parent_control_id: 41 }, { parent: { id: 41, control_code: '1-1', title_ar: 'الضابط الأساسي', official_text_ar: 'نص الأصل' } });
check(sub.includes('ضابط فرعي') && sub.includes('/controls/41?'), 'DCC sub-control hierarchy preserved');
const official = controlPage('official', 'admin');
check(official.includes('النص الرسمي المحفوظ دون إعادة صياغة') && official.includes('وصف / إرشاد داخلي'), 'official and internal content visibly separated');
const absentOfficial = controlPage('official', 'admin', { ...baseControl, official_text_ar: null });
check(absentOfficial.includes('لا يوجد نص رسمي موثق') && absentOfficial.includes('وصف / إرشاد داخلي'), 'missing official text does not become internal wording');
const owner = controlPage('overview', 'control_owner');
check(owner.includes('/controls/42/evidence/new') && !owner.includes('/controls/42/assign'), 'assigned owner next action without admin assignment');
const auditor = controlPage('overview', 'nca_external_auditor');
check(!auditor.includes('/evidence/new') && !auditor.includes('/assign') && !auditor.includes('/audit-schedule'), 'auditor page has no operational mutation actions');
const archived = controlPage('overview', 'admin', { ...baseControl, frameworks: { ...baseControl.frameworks, is_active: false } });
check(archived.includes('ضابط مؤرشف') && !archived.includes('/evidence/new') && !archived.includes('/assign') && !archived.includes('/audit-schedule'), 'archived detail preserves traceability without operational actions');
const linkedEvidence = [
  { evidence_id: 1, evidence_name: 'دليل مباشر صالح', association: 'direct', version_number: 2, review_status: 'accepted', valid_until: null },
  { evidence_id: 2, evidence_name: 'دليل مشترك صالح', association: 'shared', version_number: 3, review_status: 'accepted', valid_until: null },
];
const evidenceTab = controlPage('evidence', 'nca_external_auditor', baseControl, { eligible: linkedEvidence });
check(evidenceTab.includes('دليل مباشر صالح') && evidenceTab.includes('دليل مشترك صالح') && evidenceTab.includes('مشترك عبر مواءمة معتمدة'), 'eligible direct/shared evidence distinction');
check(evidenceTab.includes('/evidence?framework=DCC&amp;control=42') && !evidenceTab.includes('/evidence/new'), 'auditor evidence register link is scoped and read-only');
check(controlPage('assessment', 'admin', baseControl, { assessments: rows }).includes('cycle=4&amp;item=3'), 'actual control page integrates assessment item deep link');
console.log(`PASS: ${assertions} Control 360 UI, role-presentation, context, scoped-read and regression assertions (mock reads; no DB writes)`);

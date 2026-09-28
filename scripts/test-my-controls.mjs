// UI/query-contract tests only. No database connection or business mutations.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const calls = [];
let response = () => ({ data: [], error: null });
let renderPage = 0;
const client = { rpc(name) { return this.from(name); }, from(name) {
 const state = { name, filters: [], orders: [] };
 return {
  select(columns) { state.columns = columns; return this; },
  in(column, value) { state.filters.push(['in', column, value]); return this; },
  eq(column, value) { state.filters.push(['eq', column, value]); return this; },
  neq(column, value) { state.filters.push(['neq', column, value]); return this; },
  order(column) { state.orders.push(column); return this; },
  range(from, to) { state.range = [from, to]; return this; },
  then(resolve, reject) { calls.push(state); return Promise.resolve(response(state)).then(resolve, reject); },
 };
} };
const cache = new Map();
function load(path) {
 if (cache.has(path)) return cache.get(path);
 const loadedModule = { exports: {} }; cache.set(path, loadedModule.exports);
 const compiled = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText + (path === 'app/findings/page.tsx' ? '\nexports.ActionCardTest = CorrectiveActionCard; exports.FindingDetailTest = FindingDetail;' : '');
 const resolve = name => {
  if (name.endsWith('.css')) return {};
  if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => [typeof initial === 'number' ? renderPage : initial, () => {}] };
  if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
  if (name === './supabase' || name === '@/lib/supabase') return { supabase: client };
  if (name === '@/lib/auth') return { requireProfile() { throw new Error('live auth forbidden in this test'); } };
  if (name.startsWith('@/')) { const relative = name.slice(2); return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts')); }
  if (name.startsWith('.')) { const relative = posix.join(posix.dirname(path), name); return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts')); }
  return require(name);
 };
 vm.runInNewContext(compiled, { exports: loadedModule.exports, module: loadedModule, require: resolve, Date, Intl, URLSearchParams, console }, { filename: path });
 return loadedModule.exports;
}

const personal = load('lib/my-controls.ts'), context = load('lib/my-controls-context.ts');
const control = load('lib/control360.ts'), journey = load('lib/assessment-journey.ts');
const owner = { id: 'owner', role: 'control_owner' }, team = { id: 'owner', role: 'cybersecurity_team' };
const today = '2026-09-28';
const base = { id: 42, control_code: '2-7-1', title_ar: 'ضابط أعمال تجريبي — بيانات عرض فقط', control_owner_id: 'owner', implementation_status: 'implemented', evidence_status: 'accepted', due_date: null, next_audit_date: null, frameworks: { code: 'DCC', name_ar: 'ضوابط الأمن السيبراني للبيانات', is_active: true } };
for (const [title, expected] of [
  ['اسم الضابط - 2-7-1', 'اسم الضابط'], ['اسم الضابط — ٢-٧-١', 'اسم الضابط'],
  ['2-7-1 — اسم الضابط', 'اسم الضابط'], ['اسم الضابط - 2-7', 'اسم الضابط'],
  ['اسم الضابط - ISO 27001', 'اسم الضابط - ISO 27001'], ['اسم يتضمن 12 شهرًا', 'اسم يتضمن 12 شهرًا'],
  ['إحالة إلى ضابط آخر - 1-8-1', 'إحالة إلى ضابط آخر - 1-8-1'],
]) check(personal.myControlTitle({ ...base, title_ar: title }) === expected, 'display-only exact/parent code decoration cleanup: ' + title);
const ordering = ['2-1-1', '1-10-1', '1-2-1-10', '1-2-1-2', '1-2-1', '1-11-1', '1-1-1'].map((control_code, index) => ({ ...base, id: index, control_code, frameworks: { ...base.frameworks, id: 3 } }));
check([...ordering].sort(personal.compareMyControls).map(c => c.control_code).join('|') === '1-1-1|1-2-1|1-2-1-2|1-2-1-10|1-10-1|1-11-1|2-1-1', 'numeric regulatory hierarchy and parent before sub-controls');
check([...ordering, { ...base, frameworks: { ...base.frameworks, id: 1, code: 'ECC' } }].sort(personal.compareMyControls)[0].frameworks.code === 'ECC', 'existing framework catalogue order precedes lexical code order');
const empty = { controls: [], requests: [], evidence: [], findings: [], actions: [], items: [] };
const data = (overrides = {}) => ({ ...empty, controls: [base], ...overrides });
const rows = (model = data(), actor = owner) => personal.deriveMyControls(model, actor, today, 'framework=DCC&q=2-7');
const sortedRows = rows(data({ controls: [{ ...base, id: 43, control_code: '1-10-1', evidence_status: 'not_uploaded', due_date: '2020-01-01' }, { ...base, id: 44, control_code: '1-2-1' }] }));
check(sortedRows[0].control.control_code === '1-2-1' && sortedRows[1].overdue, 'official list order does not obscure unchanged overdue/action semantics');
const request = { id: 1, control_id: 42, cycle_id: 9, requirement: 'طلب دوري تجريبي', due_date: '2026-09-27', status: 'open', requested_from: 'owner', reviewer_id: 'reviewer', control_owner_id: 'owner', control_code: '2-7-1', control_title: base.title_ar, framework_code: 'DCC' };
const finding = { id: 5, control_id: 42, framework_id: 2, owner_id: 'owner', created_by: 'author', status: 'open', due_date: null };
const action = { id: 6, finding_id: 5, owner_id: 'owner', status: 'open', due_date: null, verification_status: 'not_submitted' };
const item = { id: 8, cycle_id: 7, control_id: 42, control_code: '2-7-1', compliance_status: null, notes: null, owner_id: 'owner', review_status: 'pending', cycle: { id: 7, assessor_id: 'owner', status: 'in_progress', imported: false, due_date: null } };
check(rows()[0].actions.length === 0, 'assigned updated control has no invented action');
check(rows(data({ controls: [{ ...base, evidence_status: 'not_uploaded' }] }))[0].next.kind === 'evidence', 'missing evidence follows the existing state');
const periodic = rows(data({ requests: [request] }))[0];
check(periodic.actions.length === 1 && periodic.next.kind === 'periodic' && periodic.overdue, 'one request-bound action, not duplicated as generic upload');
check(periodic.next.href.includes('request=1') && periodic.next.href.includes('my_context='), 'existing governed upload route with durable list context');
for (const status of ['rejected', 'changes_requested']) check(rows(data({ requests: [{ ...request, status }] }))[0].evidenceNeeded, 'returned request: ' + status);
const waiting = rows(data({ requests: [{ ...request, status: 'submitted' }] }))[0];
check(waiting.waiting && waiting.actions.length === 0, 'owner submitted work waits, never self-reviews');
check(rows(data({ requests: [{ ...request, status: 'submitted' }] }), team)[0].actions.length === 0, 'team owner review tasks not duplicated into personal work');
check(rows(data({ requests: [{ ...request, requested_from: 'other' }] }))[0].actions.length === 0, 'someone else’s request is not my action');
const evidence = { id: 30, control_id: 42, source_control_id: 42, is_current: true, status: 'accepted', valid_until: '2026-09-27' };
check(rows(data({ evidence: [evidence] }))[0].evidenceNeeded, 'expired current direct evidence needs renewal');
check(!rows(data({ evidence: [{ ...evidence, is_current: false }] }))[0].evidenceNeeded, 'obsolete version is not a new work item');
check(rows(data({ evidence: [{ ...evidence, valid_until: null, status: 'pending_review' }], controls: [{ ...base, evidence_status: 'pending_review' }] }))[0].waiting, 'authoritative register review state');
check(!rows(data({ evidence: [{ ...evidence, source_control_id: 99, status: 'accepted', valid_until: null }] }))[0].evidenceNeeded, 'accepted shared record not relabelled missing/direct');
check(rows(data({ items: [item] }))[0].actions.length === 0, 'control/item ownership never grants assessor capability');
check(rows(data({ items: [item] }), team)[0].next.kind === 'assessment', 'team assigned assessor gets existing item workspace');
for (const actor of ['another-assessor', null]) check(rows(data({ items: [{ ...item, cycle: { ...item.cycle, assessor_id: actor } }] }), team)[0].actions.length === 0, 'assessor identity enforced in presentation');
for (const status of ['under_review', 'completed', 'approved', 'closed']) check(rows(data({ items: [{ ...item, cycle: { ...item.cycle, status } }] }), team)[0].actions.length === 0, 'no editing attention for locked cycle: ' + status);
check(rows(data({ items: [{ ...item, cycle: { ...item.cycle, imported: true } }] }), team)[0].next.kind === 'assessment', 'imported flag does not invent a restriction: assigned assessor and editable cycle still govern');
const actionsRow = rows(data({ findings: [finding], actions: [action, { ...action, id: 7 }] }))[0];
check(actionsRow.actions.length === 2 && actionsRow.next === null, 'multiple equal/undated actions: no invented priority');
const urgent = rows(data({ findings: [finding], actions: [action, { ...action, id: 7, due_date: '2026-09-27' }] }))[0];
check(urgent.next.label.includes('#7'), 'unique earliest overdue action is explainably urgent');
const tie = rows(data({ findings: [finding], actions: [{ ...action, due_date: '2026-09-27' }, { ...action, id: 7, due_date: '2026-09-27' }] }))[0];
check(tie.next === null, 'equal deadlines do not become arbitrary ID priorities');
check(rows(data({ findings: [{ ...finding, owner_id: 'other' }], actions: [action] }))[0].actions.length === 0, 'action linkage cannot bypass command’s parent-finding owner restriction');
check(rows(data({ findings: [{ ...finding, status: 'pending_verification' }], actions: [{ ...action, status: 'completed' }] }))[0].waiting, 'pending independent verification is waiting, not self-approval');
check(rows(data({ findings: [{ ...finding, status: 'closed' }] }))[0].actions.length === 0, 'closed finding never reopened by personal view');
check(personal.myControlsSummary([periodic, waiting]).attention === 1 && personal.myControlsSummary([periodic, waiting]).waiting === 1, 'summary counts assigned controls, not records');
const multi = [...rows(), ...rows(data({ controls: [{ ...base, id: 43, frameworks: { ...base.frameworks, code: 'CSCC' }, evidence_status: 'not_uploaded' }] }))];
for (const [filter, count] of [['framework=DCC', 1], ['framework=CSCC', 1], ['status=implemented', 2], ['evidence=1', 1], ['assessment=1', 0], ['findings=1', 0], ['attention=1', 1], ['overdue=1', 0], ['q=٢–٧–١', 2], ['q=unmatched', 0]]) check(personal.filterMyControls(multi, filter).length === count, 'personal URL filter: ' + filter);
const origin = context.myControlsOrigin('framework=DCC&attention=1&q=2-7&return=https://evil.test&framework=QA_SYNTH');
check(context.myControlsReturn(new URLSearchParams(origin)) === '/my-controls?framework=DCC&attention=1&q=2-7', 'return whitelist, no arbitrary URL');
check(context.myControlsFilters('framework=QA_SYNTH&status=bad&overdue=yes').size === 0, 'synthetic/invalid filter cannot expose business test records');
const controlURL = control.controlHref(42, origin);
check(context.myControlsReturn(new URLSearchParams(controlURL.split('?')[1])).includes('attention=1'), 'Control 360 refresh preserves personal filters');
const register = control.controlRegisterHref('findings', 'DCC', 42, origin);
check(context.myControlsReturn(new URLSearchParams(new URLSearchParams(register.split('?')[1]).get('return_context'))).includes('q=2-7'), 'central Finding/Action roundtrip');
for (const code of ['DCC', 'CSCC', 'TCC', 'OSMACC']) {
  const href = journey.assessmentItemHref(code, 7, 8, origin);
  const url = new URLSearchParams(href.split('?')[1]);
  check(url.get('cycle') === '7' && url.get('item') === '8' && context.myControlsReturn(url).includes('attention=1'), code + ' assessment item context survives refresh');
}
check(context.myControlsReturn(new URLSearchParams('from=review&my_context=attention%3D1')) === null, 'reviewer context not converted into owner context');

// Execute actual scoped read builders with a non-network client.
response = state => ({ data: state.name === 'controls' ? [base, { ...base, id: 50, control_owner_id: 'other' }, { ...base, id: 51, frameworks: { code: 'QA_SYNTH', is_active: true } }, { ...base, id: 52, frameworks: { code: 'ECC', is_active: false } }] : [], error: null });
const read = await personal.loadMyControls(owner);
check(read.controls.length === 1 && read.controls[0].id === 42, 'all assigned active base/sub controls, defensive owner/source filtering');
const controlsRead = calls.find(c => c.name === 'controls');
check(controlsRead.columns.includes('frameworks!inner(id,code,name_ar,is_active)'), 'read existing framework catalogue ID order without changing read scope');
for (const [column, value] of [['control_owner_id', 'owner'], ['frameworks.is_active', true]]) check(controlsRead.filters.some(f => f[0] === 'eq' && f[1] === column && f[2] === value), 'server-side assigned scope: ' + column);
check(controlsRead.filters.some(f => f[0] === 'neq' && f[1] === 'frameworks.code' && f[2] === 'QA_SYNTH'), 'QA_SYNTH excluded before paging');
check(!controlsRead.filters.some(f => f[1] === 'hierarchy_level'), 'assigned sub-controls not dropped');
check(!calls.some(c => c.name === 'assessment_items'), 'owner cannot edit assessment, no misleading global assessment read');
check(calls.find(c => c.name === 'evidence_requests').filters.some(f => f[1] === 'controls.control_owner_id' && f[2] === 'owner'), 'existing compact queue scoped on server');
for (const name of ['grc_evidence_register', 'grc_findings']) check(calls.find(c => c.name === name).filters.some(f => f[0] === 'in' && f[1] === 'control_id' && f[2].join() === '42'), name + ' batch scope');
calls.length = 0;
response = state => ({ data: state.name === 'controls' && state.range[0] === 0 ? Array.from({ length: 500 }, (_, i) => ({ ...base, id: i + 1 })) : state.name === 'controls' ? [{ ...base, id: 501 }] : [], error: null });
check((await personal.loadMyControls(team)).controls.length === 501, 'complete assigned scope beyond row cap');
check(calls.filter(c => c.name === 'grc_findings').length === 3, 'bounded batches, not N+1');
for (const q of calls.filter(c => c.name === 'assessment_items')) check(q.filters.some(f => f[1] === 'cycle.assessor_id' && f[2] === 'owner') && !q.columns.includes('approved_snapshot'), 'assigned active assessor scoped read with protected cycle columns');
response = () => ({ data: [], error: null }); calls.length = 0;
check((await personal.loadMyControls(owner)).controls.length === 0 && calls.length === 1, 'no assigned controls short circuits dependent reads');
await assert.rejects(personal.loadMyControls({ id: 'auditor', role: 'nca_external_auditor' }), /ضوابطي/); checks++;
response = () => ({ data: null, error: { message: 'read denied' } });
await assert.rejects(personal.loadMyControls(owner), /read denied/); checks++;

const View = load('components/MyControls.tsx').MyControlsView;
const render = (model, filter = '') => renderToStaticMarkup(React.createElement(View, { rows: model, requests: [], actor: owner, context: filter, onFilter() {}, onReset() {}, onRefresh() {} }));
check(render([]).includes('لا توجد ضوابط مسندة إليك حاليًا.') && !render([]).includes('my-controls-summary'), 'no assignment empty state without zero cards');
check(render(rows()).includes('جميع ضوابطك محدثة') && !render(rows()).includes('عدة إجراءات'), 'assigned/no-action empty state');
check(render(rows(), 'q=unmatched').includes('لا توجد نتائج مطابقة'), 'filtered zero is not no-assignment');
const html = render([actionsRow]);
check(html.includes('<summary>المزيد من الفلاتر') && !html.includes('مسح الفلاتر'), 'advanced filters behind disclosure, no inactive reset');
const activeHTML = render([actionsRow], 'framework=DCC&q=2-7&evidence=1&overdue=1');
check(activeHTML.includes('الفلاتر النشطة') && activeHTML.includes('إزالة فلتر يحتاج دليل') && activeHTML.includes('إزالة فلتر متأخر') && activeHTML.includes('مسح الفلاتر'), 'all active filters rendered as removable chips');
const identityHTML = render(rows(data({ controls: [{ ...base, title_ar: 'اسم موجز - 2-7-1' }] })));
check((identityHTML.match(/>2-7-1</g) ?? []).length === 1 && !identityHTML.includes('اسم موجز - 2-7-1'), 'one primary code/title identity, no duplicate code in tooltip');
function treeNodes(node, predicate) {
 if (!node || typeof node !== 'object') return [];
 if (Array.isArray(node)) return node.flatMap(child => treeNodes(child, predicate));
 return [...(predicate(node) ? [node] : []), ...treeNodes(node.props?.children, predicate)];
}
let interactiveContext = 'framework=DCC&status=implemented&q=2-7&evidence=1&overdue=1';
const interactiveView = () => View({ rows: [actionsRow], requests: [], actor: owner, context: interactiveContext, onRefresh() {}, onReset() { interactiveContext = ''; }, onFilter(key, value) { const next = context.myControlsFilters(interactiveContext); if (value) next.set(key, value); else next.delete(key); interactiveContext = next.toString(); } });
treeNodes(interactiveView(), node => node.type === 'button' && node.props['aria-label'] === 'إزالة فلتر يحتاج دليل')[0].props.onClick();
check(!new URLSearchParams(interactiveContext).has('evidence') && ['framework','status','q','overdue'].every(key => new URLSearchParams(interactiveContext).has(key)), 'chip removes only selected URL filter');
treeNodes(interactiveView(), node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } });
check(context.myControlsReturn(new URLSearchParams(context.myControlsOrigin(interactiveContext))) === context.myControlsHref(interactiveContext), 'advanced filter change keeps durable URL/return state');
const bookmarked = interactiveContext;
check(render([actionsRow], bookmarked).includes('إزالة فلتر يحتاج إجراء') && render([actionsRow], bookmarked).includes('إزالة فلتر متأخر'), 'refresh/back/forward render from URL rather than disclosure state');
treeNodes(interactiveView(), node => node.type === 'button' && node.props.children === 'مسح الفلاتر')[0].props.onClick();
check(interactiveContext === '' && !render([actionsRow], interactiveContext).includes('الفلاتر النشطة'), 'reset clears filters and chips');
check(html.includes('عدة إجراءات مطلوبة') && html.includes('dir="rtl"') && html.includes('scope="col"'), 'compact RTL workbench, no arbitrary action');
check(html.includes('my-controls-scroll') && html.includes('tabindex="0"'), 'keyboard-accessible mobile scroll region');
check(!html.includes('نسبة الالتزام') && !html.includes('تسجيل ملاحظة') && !html.includes('قبول التحقق'), 'personal attention not compliance/inline-edit/self-review');
const shell = readFileSync(new URL('../components/AppShell.tsx', import.meta.url), 'utf8');
check(shell.includes('personal: true') && shell.includes('!item.personal || account?.role === "control_owner"') && shell.includes('href: "/controls", label: "مكتبة الضوابط"') && shell.includes('sidebarHidden: true'), 'owner nav migrated without global/auditor duplicate');
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
check(home.indexOf("if (profile.role === 'control_owner') return;") < home.indexOf('const [controlResult,evidenceResult]') && home.includes("if (userRole === 'control_owner') return <MyControls/>"), 'owner landing short-circuits global dashboard reads');
for (const file of ['app/controls/[id]/page.tsx', 'app/evidence/page.tsx', 'app/findings/page.tsx', 'app/controls/[id]/evidence/new/page.tsx', 'components/AssessmentItemEditor.tsx']) check(readFileSync(new URL('../' + file, import.meta.url), 'utf8').includes('العودة إلى ضوابطي'), 'visible durable personal return: ' + file);
const findingsUI = readFileSync(new URL('../app/findings/page.tsx', import.meta.url), 'utf8');
check(findingsUI.includes("role==='control_owner'&&finding.owner_id===actor&&action.owner_id===actor") && findingsUI.includes('!actions.some(action=>action.owner_id===actor||action.completed_by===actor)'), 'action roles and independent Finding verification mirror command guards');
const findingComponents = load('app/findings/page.tsx');
const actionHTML = (role, actor, parentOwner = 'owner') => renderToStaticMarkup(React.createElement(findingComponents.ActionCardTest, { action: { ...action, title: 'إجراء اصطناعي', description: 'اختبار عرض', revision: 1 }, finding: { ...finding, owner_id: parentOwner }, role, actor, busy: false, evidence: [], run() {} }));
check(actionHTML('control_owner', 'owner').includes('إكمال الإجراء'), 'authorized assigned owner action is preserved');
check(!actionHTML('control_owner', 'owner', 'other').includes('إكمال الإجراء'), 'actual Action card hides command-rejected parent scope');
check(!actionHTML('nca_external_auditor', 'owner').includes('إكمال الإجراء') && !actionHTML('nca_external_auditor', 'owner').includes('تعديل الإجراء'), 'actual external auditor card read-only even if stale owner ID matches');
for (const role of ['admin', 'cybersecurity_team']) check(actionHTML(role, 'team').includes('إكمال الإجراء'), 'team operational capability unchanged: ' + role);
const detailHTML = (actor, linkedActions) => renderToStaticMarkup(React.createElement(findingComponents.FindingDetailTest, { finding: { ...finding, reference_code: 'TEST-ONLY', title: 'ملاحظة اصطناعية', description: '', source_type: 'assessment', source_record_id: 1, status: 'pending_verification', verification_status: 'pending', created_by: 'creator', owner_id: 'owner' }, actions: linkedActions, actor, role: 'cybersecurity_team', people: [], busy: false, navigationContext: origin, run() {} }));
check(!detailHTML('reviewer', [{ ...action, owner_id: 'reviewer', status: 'completed', verification_status: 'accepted' }]).includes('قبول التحقق'), 'actual Finding UI hides verification from action owner');
check(!detailHTML('reviewer', [{ ...action, completed_by: 'reviewer', status: 'completed', verification_status: 'accepted' }]).includes('قبول التحقق'), 'actual Finding UI hides verification from action completer');
check(detailHTML('reviewer', [{ ...action, completed_by: 'owner', status: 'completed', verification_status: 'accepted' }]).includes('قبول التحقق'), 'independent team verifier capability preserved');
check(detailHTML('reviewer', []).includes('my_context='), 'Finding detail Control 360 navigation retains personal context');
console.log(`PASS: ${checks} Phase 2D personal scope, action/SoD, URL, paging, empty-state and RTL assertions (isolated mocked reads; no QA/Production writes).`);

// Optional local synthetic visual harness. No Supabase connection, credentials,
// fixture inserts, or application mutation; renders the real presentation.
if (process.argv.includes('--visual')) {
  const { createServer } = await import('node:http');
  const css = readFileSync(new URL('../components/my-controls.css', import.meta.url), 'utf8');
  const visualData = data({ controls: [base, { ...base, id: 43, control_code: '2-8-1' }, { ...base, id: 44, control_code: '2-9-1' }, { ...base, id: 45, control_code: '2-10-1' }],
    requests: [request, { ...request, id: 2, control_id: 44, status: 'submitted' }], findings: [{ ...finding, control_id: 43 }], actions: [action, { ...action, id: 7 }] });
  visualData.controls = visualData.controls.map(c => ({ ...c, title_ar: `ضابط أعمال تجريبي - ${c.control_code}`, frameworks: { ...c.frameworks, id: 3 } }));
  const server = createServer((req, res) => {
    const filters = req.url?.split('?')[1] ?? '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 2D — synthetic visual check</title><style>body{margin:0;padding:24px;background:#f7f9f8;font-family:Arial,sans-serif}main{background:white;padding:20px;border-radius:12px;box-sizing:border-box}a{color:#07675e}${css}</style><p>عرض محلي اصطناعي — ليس بيانات QA ولا Production</p>${render(personal.deriveMyControls(visualData, owner, today, filters), filters)}</html>`);
  });
  server.listen(4188, '127.0.0.1', () => console.log('LOCAL SYNTHETIC VISUAL: http://127.0.0.1:4188'));
}

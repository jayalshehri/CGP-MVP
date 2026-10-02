// P2-B5.1: local classification/render/read-contract tests. No live services.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url), cache = new Map(), calls = [];
let checks = 0, response = () => ({ data: [], count: 0, error: null });
const check = (value, message) => { assert.ok(value, message); checks++; };
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function query(name, args, options) {
  const call = { name, args, options, columns: '', selectOptions: null, filters: [], orders: [], range: [] };
  return {
    select(columns, options) { call.columns = columns; call.selectOptions = options; return this; },
    eq(key, value) { call.filters.push(['eq', key, value]); return this; },
    in(key, value) { call.filters.push(['in', key, value]); return this; },
    is(key, value) { call.filters.push(['is', key, value]); return this; },
    or(value) { call.filters.push(['or', value]); return this; },
    order(key, options) { call.orders.push([key, options]); return this; },
    range(from, to) { call.range = [from, to]; return this; },
    then(resolve, reject) { calls.push(call); return Promise.resolve(response(call)).then(resolve, reject); },
  };
}
const client = { from: name => query(name), rpc: (name, args, options) => {
  if (!['grc_evidence_register', 'cgp_crosswalk'].includes(name)) throw new Error('Mutating/unauthorized RPC forbidden in queue test: ' + name);
  return query(name, args, options);
} };
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const fixtureModule = { exports: {} }; cache.set(path, fixtureModule.exports);
  const compiled = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect: () => {} };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) };
    if (name === '@/lib/supabase' || name === './supabase') return { supabase: client };
    if (name === '@/lib/auth') return { requireProfile() { throw new Error('Live authentication forbidden in test'); } };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const relative = name.startsWith('@/') ? name.slice(2) : posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts'));
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: fixtureModule.exports, module: fixtureModule, require: resolve, Date, Intl, URLSearchParams, Map, Set, console }, { filename: path });
  return fixtureModule.exports;
}
const work = load('lib/review-work-queue.ts'), read = load('lib/review-work-queue-read.ts'), context = load('lib/review-context.ts');
const view = load('components/ReviewWorkQueue.tsx').ReviewQueueView;
const actor = { id: 'reviewer', role: 'cybersecurity_team' }, today = '2026-09-29';
const empty = () => ({ frameworks: [{ id: 1, code: 'DCC', is_active: true }, { id: 2, code: 'QA_SYNTH', is_active: true }, { id: 3, code: 'OLD_ECC', is_active: false }], controls: [
  { id: 1, framework_id: 1, control_code: '1-1-1', title_ar: 'ضابط اصطناعي' }, { id: 2, framework_id: 1, control_code: '2-1-1', title_ar: 'مصدر مشاركة' },
  { id: 3, framework_id: 2, control_code: 'QA-1', title_ar: 'اختبار' }, { id: 4, framework_id: 3, control_code: 'OLD-1', title_ar: 'مؤرشف' }], evidence: [], cycles: [], items: [], itemLinks: [], mappings: [], findings: [], actions: [], periodic: [], people: [
    { user_id: 'owner', display_name: 'مالك الاختبار' }, { user_id: actor.id, display_name: 'المراجع الحالي' }], errors: {} });
const cycle = (id, state, extra = {}) => ({ id, framework_id: 1, status: state, scope_name: 'نطاق اختبار', reviewer_id: actor.id, assessor_id: 'assessor', approver_id: actor.id, due_date: '2026-09-30', ...extra });
const item = (id, cycleId, extra = {}) => ({ id, cycle_id: cycleId, control_id: 1, title_ar: 'متطلب اصطناعي', is_scoring: true, review_status: 'accepted', compliance_status: 'not_implemented', notes: 'مبرر', owner_id: 'owner', expected_compliance_date: '2026-10-01', corrective_action: 'معالجة', ...extra });
const evidence = (id, extra = {}) => ({ id, control_id: 1, source_control_id: 1, link_id: null, is_current: true, uploaded_by: 'owner', assigned_reviewer: null, status: 'pending_review', valid_until: null, file_name: 'test.pdf', ...extra });
const finding = (id, extra = {}) => ({ id, framework_id: 1, control_id: 1, source_type: 'assessment', assessment_item_id: 20, assessment_cycle_id: 10, reference_code: 'TEST-' + id, title: 'ملاحظة اصطناعية', severity: 'unclassified', created_by: 'creator', owner_id: 'owner', status: 'pending_verification', verification_status: 'pending', verification_evidence_id: null, due_date: null, ...extra });
const action = (id, parent, extra = {}) => ({ id, finding_id: parent, title: 'إجراء اصطناعي', owner_id: 'owner', completed_by: 'owner', status: 'completed', verification_status: 'pending', verification_evidence_id: null, due_date: null, ...extra });
const all = results => results.flatMap(category => category.items);
const classify = data => work.buildReviewWorkQueue(data, actor, today);
const types = data => all(classify(data)).map(item => item.type);

const data = empty();
data.evidence = [evidence(1), evidence(2, { assigned_reviewer: actor.id }), evidence(3, { status: 'accepted' })];
data.cycles = [cycle(10, 'under_review'), cycle(11, 'completed')];
data.items = [item(20, 10), item(21, 10, { is_scoring: false, review_status: 'pending' }), item(22, 11)];
data.findings = [finding(30), finding(31), finding(32, { verification_status: 'accepted', verified_by: actor.id })];
data.actions = [action(40, 30)];
data.periodic = [{ id: 50, control_id: 1, reviewer_id: actor.id, owner_id: 'owner', status: 'open', due_date: today }];
const results = classify(data), rows = all(results);
for (const type of ['CORRECTIVE_ACTION_VERIFICATION', 'FINDING_VERIFICATION', 'FINDING_CLOSURE']) check(work.workDecisionModes[type] === 'OPEN_RECORD_REQUIRED', type + ' decision remains in authoritative record');
check(work.workDecisionModes.PERIODIC_REVIEW_FOLLOWUP === 'NAVIGATION_ONLY', 'periodic review is navigation-only from queue');
for (const type of Object.keys(work.workTypeLabels)) check(rows.some(row => row.type === type), 'classifies ' + type);
check(rows.find(row => row.type === 'EVIDENCE_REVIEW' && row.sourceId === 1).responsibility === 'independent_team', 'unassigned evidence is team eligible, never personal');
check(rows.find(row => row.type === 'EVIDENCE_REVIEW' && row.sourceId === 2).assignee === actor.id, 'authoritative evidence assignment');
for (const type of ['CORRECTIVE_ACTION_VERIFICATION', 'FINDING_VERIFICATION']) check(rows.filter(row => row.type === type).every(row => row.responsibility === 'independent_team' && row.assignee === null), type + ' does not fabricate verifier assignment');
check(rows.find(row => row.type === 'FINDING_CLOSURE').assignee === actor.id, 'closure responsibility comes from recorded verifier');
check(rows.find(row => row.type === 'CORRECTIVE_ACTION_VERIFICATION').ownerLabel === 'مالك الاختبار', 'action owner comes from active profile directory');
check(rows.find(row => row.type === 'FINDING_VERIFICATION').severityLabel === 'غير مصنفة', 'finding severity uses authoritative value');
check(rows.find(row => row.type === 'FINDING_CLOSURE').reviewerLabel === 'أنت', 'recorded verifier shown as current reviewer');
check(rows.find(row => row.type === 'EVIDENCE_REVIEW').dueDate === null, 'does not turn validity into a due date');
for (const role of ['control_owner', 'nca_external_auditor', 'data_governance_team']) {
  const denied = work.buildReviewWorkQueue(data, { ...actor, role }, today);
  check(all(denied).length === 0, role + ' no decision work');
  check(work.reviewWorkSummary(denied, today).review === null, role + ' unavailable, not a false zero');
  calls.length = 0;
  await assert.rejects(read.loadReviewWorkSnapshot({ ...actor, role })); checks++;
  check(calls.length === 0, role + ' no queries');
}
const adminRows = all(work.buildReviewWorkQueue(data, { ...actor, role: 'admin' }, today));
check(adminRows.find(row => row.sourceId === 1 && row.type === 'EVIDENCE_REVIEW').responsibility === 'independent_team', 'admin cannot fabricate personal assignment');

for (const extra of [{ uploaded_by: actor.id }, { uploaded_by: null }, { assigned_reviewer: 'other' }, { is_current: false }, { status: 'accepted' }, { control_id: 3 }, { control_id: 4 }]) {
  const state = empty(); state.evidence = [evidence(1, extra)];
  check(!types(state).includes('EVIDENCE_REVIEW'), 'evidence rejects ' + JSON.stringify(extra));
}
const sharedPending = empty(); sharedPending.evidence = [evidence(1, { link_id: 100 })];
sharedPending.periodic = [{ id: 2, control_id: 1, status: 'open', reviewer_id: 'other' }];
check(!types(sharedPending).includes('EVIDENCE_REVIEW'), 'shared review preserves open-cycle reviewer assignment');
for (const extra of [{ reviewer_id: 'other' }, { assessor_id: actor.id }, { framework_id: 2 }]) {
  const state = empty(); state.cycles = [cycle(10, 'under_review', extra)]; state.items = [item(1, 10, { review_status: 'pending' })];
  check(!types(state).includes('ASSESSMENT_ITEM_REVIEW'), 'item SoD/scope ' + JSON.stringify(extra));
}
for (const status of ['draft', 'in_progress', 'under_review', 'approved', 'closed']) {
  const state = empty(); state.cycles = [cycle(10, status)]; state.items = [item(1, 10)];
  check(!types(state).includes('ASSESSMENT_APPROVAL'), 'approval only completed: ' + status);
}
for (const extra of [{ approver_id: 'other' }, { assessor_id: actor.id }]) {
  const state = empty(); state.cycles = [cycle(10, 'completed', extra)]; state.items = [item(1, 10)];
  check(!types(state).includes('ASSESSMENT_APPROVAL'), 'approval assignment/SoD');
}
const supported = empty(); supported.cycles = [cycle(10, 'completed')]; supported.items = [item(1, 10, { compliance_status: 'implemented' })]; supported.itemLinks = [{ item_id: 1, evidence_id: 5 }];
supported.evidence = [evidence(5, { status: 'accepted' })];
check(types(supported).includes('ASSESSMENT_APPROVAL'), 'direct accepted version supports approval discovery');
supported.evidence = [evidence(5, { status: 'accepted', source_control_id: 2, link_id: 100 })];
check(!types(supported).includes('ASSESSMENT_APPROVAL'), 'unapproved mapping cannot make approval ready');
supported.mappings = [{ source_id: 2, target_id: 1, validation_status: 'approved' }];
check(types(supported).includes('ASSESSMENT_APPROVAL'), 'approved shared version supports approval discovery');
for (const extra of [{ is_current: false }, { valid_until: '2026-09-28' }, { uploaded_by: actor.id }, { uploaded_by: null }, { status: 'rejected' }, { source_control_id: 4 }]) {
  supported.evidence = [evidence(5, { status: 'accepted', ...extra })];
  check(!types(supported).includes('ASSESSMENT_APPROVAL'), 'invalid evidence blocks approval discovery ' + JSON.stringify(extra));
}
for (const extra of [{ created_by: actor.id }, { owner_id: actor.id }]) {
  const state = empty(); state.findings = [finding(1, extra)];
  check(!types(state).includes('FINDING_VERIFICATION'), 'finding verifier independent ' + JSON.stringify(extra));
}
for (const extra of [{ owner_id: actor.id }, { completed_by: actor.id }]) {
  const state = empty(); state.findings = [finding(1)]; state.actions = [action(2, 1, extra)];
  check(!types(state).includes('CORRECTIVE_ACTION_VERIFICATION') && !types(state).includes('FINDING_VERIFICATION'), 'action/linkage SoD');
}
const remediation = empty(); remediation.findings = [finding(1)]; remediation.actions = [action(2, 1, { verification_evidence_id: 999 })];
check(types(remediation).includes('CORRECTIVE_ACTION_VERIFICATION'), 'invalid evidence remains actionable for rejection, never silently disappears');
check(all(classify(remediation))[0].reason.includes('استكمال'), 'invalid action evidence is not described as ready for acceptance');
check(!types(remediation).includes('FINDING_VERIFICATION'), 'action completion does not equal independent acceptance');
remediation.actions[0].verification_status = 'accepted';
check(types(remediation).includes('FINDING_VERIFICATION'), 'accepted actions permit finding verification');
remediation.findings[0].verification_status = 'accepted'; remediation.findings[0].verified_by = 'other';
check(!types(remediation).includes('FINDING_CLOSURE'), 'only recorded verifier may close');
remediation.findings[0].verified_by = actor.id;
check(!types(remediation).includes('FINDING_CLOSURE'), 'closure rechecks current action evidence');
remediation.actions[0].verification_evidence_id = null;
check(types(remediation).includes('FINDING_CLOSURE'), 'explicit independent closure remains a separate work type');
for (const extra of [{ framework_id: 2 }, { source_type: 'internal_audit' }, { status: 'closed' }]) {
  const state = empty(); state.findings = [finding(1, extra)]; check(all(classify(state)).length === 0, 'finding source guard ' + JSON.stringify(extra));
}
const legacy = empty(); legacy.assessment_findings = [{ id: 1, status: 'verification', owner_id: actor.id }];
check(all(classify(legacy)).length === 0, 'legacy findings never merged/inferred into shared model');
for (const extra of [{ reviewer_id: 'other' }, { owner_id: actor.id }, { due_date: '2026-09-30' }, { status: 'completed' }, { control_id: 3 }]) {
  const state = empty(); state.periodic = [{ id: 1, control_id: 1, reviewer_id: actor.id, owner_id: 'owner', status: 'open', due_date: today, ...extra }];
  check(!types(state).includes('PERIODIC_REVIEW_FOLLOWUP'), 'periodic scope/state/due ' + JSON.stringify(extra));
}

const fallback = rows[0];
const sorted = work.sortReviewWork([{ ...fallback, sourceId: 4, key: '4', dueDate: null }, { ...fallback, sourceId: 3, key: '3', dueDate: today }, { ...fallback, sourceId: 2, key: '2', dueDate: '2026-09-28' }, { ...fallback, sourceId: 1, key: '1', dueDate: '2026-09-28' }], today);
check(sorted.map(i => i.key).join('|') === '1|2|3|4', 'overdue then date then stable ID fallback, null dates last');
check(work.sortReviewWork([...sorted].reverse(), today).map(i => i.key).join('|') === '1|2|3|4', 'stable independent of input order');
for (const [due, expected] of [['overdue', 2], ['today', 1], ['undated', 1], ['upcoming', 0]]) check(work.filterReviewWork(sorted, 'due=' + due, today).length === expected, 'due filter ' + due);
check(work.reviewWorkPage(Array.from({ length: 34 }, (_, id) => ({ ...fallback, sourceId: id })), 2).items.length === 15, 'UI paging');
check(work.reviewWorkPage(sorted, 999).page === 1, 'page clamps after filter/data changes');
for (const row of rows) {
  const href = work.reviewWorkHref(row, 'type=' + row.type + '&framework=DCC&responsibility=assigned&page=2&redirect=https://bad.test');
  const params = new URLSearchParams(href.split('?')[1]);
  check(context.reviewContextReturn(params) === `/review?type=${row.type}&framework=DCC&responsibility=assigned&page=2`, 'durable context for ' + row.type);
  check(!href.includes('bad.test'), 'no arbitrary return URL ' + row.type);
}
check(rows.find(i => i.type === 'CORRECTIVE_ACTION_VERIFICATION').sourceRoute.includes('action=40'), 'action record navigation');
check(rows.find(i => i.type === 'FINDING_VERIFICATION').sourceRoute.includes('finding=31') && rows.find(i => i.type === 'FINDING_VERIFICATION').sourceRoute.includes('decision=verification'), 'exact finding verification navigation');
check(rows.find(i => i.type === 'FINDING_CLOSURE').sourceRoute.includes('finding=32') && rows.find(i => i.type === 'FINDING_CLOSURE').sourceRoute.includes('decision=closure'), 'exact finding closure navigation');
check(rows.find(i => i.type === 'PERIODIC_REVIEW_FOLLOWUP').sourceRoute === '/controls/1?tab=overview&review_cycle=50', 'exact periodic cycle navigation');
check(rows.find(i => i.type === 'ASSESSMENT_ITEM_REVIEW').sourceRoute.includes('cycle=10&item=21'), 'exact assessment item/cycle navigation');
for (const dependency of ['evidence', 'actions', 'frameworks', 'cycles']) {
  const state = { ...data, errors: { [dependency]: 'Read unavailable' } }, categories = classify(state), summary = work.reviewWorkSummary(categories, today);
  check(categories.some(c => c.status === 'unavailable' && !c.items.length), 'failed read has no invented tasks: ' + dependency);
  check(summary.overdue === null, 'incomplete total never zero: ' + dependency);
  const html = renderToStaticMarkup(React.createElement(view, { categories, raw: '', update() {} }));
  check(html.includes('غير متاح') && html.includes('غير مكتملين'), 'render failure distinct from empty: ' + dependency);
}
const html = renderToStaticMarkup(React.createElement(view, { categories: results, raw: '', update() {} }));
check(html.includes('مسند إليّ') && html.includes('متاح للفريق المستقل'), 'render distinguishes responsibility');
check(html.includes('<table') && html.includes('الإجراء التالي'), 'compact actionable queue');
check(!html.includes('قبول الدليل') && !html.includes('رفض') && !html.includes('إغلاق بقرار مستقل'), 'queue has navigation, no duplicate decision buttons');
check(!html.includes('QA_SYNTH'), 'business queue hides synthetic framework');
check(html.includes('aria-label="ملخص الأعمال المؤهلة قبل الفلاتر"') && html.includes('أنواع قرارات مستقلة'), 'summary explicitly represents pre-filter independent decision responsibilities');
check(['مراجعة', 'اعتماد', 'تحقق', 'إغلاق'].every(label => html.includes(`<span>${label}</span>`)), 'four decision types rendered in the primary summary');
check(html.includes('<aside class="review-overdue-summary"') && html.includes('حالة عابرة لأنواع العمل'), 'overdue is separate from decision stages');
check(html.includes(`نتائج القائمة: ${rows.length}`), 'unfiltered list count is stated separately from summary');
check(html.includes('class="review-work-type review-periodic"') && html.includes('مراجعة دورية #50'), 'periodic control review has distinct presentation and cycle context');
check(html.includes('class="review-row-details"') && html.includes('سبب الظهور:'), 'secondary row metadata is progressively disclosed');
check(html.includes('class="review-responsibility assigned"') && html.includes('class="review-responsibility independent_team"'), 'personal assignment and independent team remain visibly distinct');
const filteredHtml = renderToStaticMarkup(React.createElement(view, { categories: results, raw: 'framework=ZZ', update() {} }));
check(filteredHtml.includes('نتائج القائمة: 0') && filteredHtml.includes(`من ${rows.length} عملًا مؤهلًا قبل الفلاتر`), 'filtered zero is labeled against pre-filter eligible count');
check(filteredHtml.includes('لا توجد أعمال تطابق الفلاتر الحالية') && filteredHtml.includes('مراجعة</span>'), 'filtered-out work is not described as absent');
const zeroHtml = renderToStaticMarkup(React.createElement(view, { categories: classify(empty()), raw: '', update() {} }));
check(zeroHtml.includes('لا توجد أعمال مراجعة أو قرار مؤهلة ضمن صلاحياتك حاليًا') && zeroHtml.includes('نتائج القائمة: 0'), 'genuine zero remains distinct from filtering');
const unavailableHtml = renderToStaticMarkup(React.createElement(view, { categories: results.map(c => ({ ...c, status: 'unavailable', error: 'قراءة غير متاحة', items: [] })), raw: '', update() {} }));
check(unavailableHtml.includes('نتائج القائمة غير متاحة') && !unavailableHtml.includes('نتائج القائمة: 0'), 'unavailable read never becomes a false zero');
const recordOnly = results.map(category => ({ ...category, items: category.items.filter(item => item.type === 'FINDING_CLOSURE' || item.type === 'PERIODIC_REVIEW_FOLLOWUP') }));
const recordHtml = renderToStaticMarkup(React.createElement(view, { categories: recordOnly, raw: '', update() {}, actor, onReview() {} }));
check(!recordHtml.includes('review-inline-primary') && recordHtml.includes('فتح قرار الإغلاق') && recordHtml.includes('finding=32'), 'finding closure stays open-record-only with exact source link');
check(recordHtml.includes('review_cycle=50') && recordHtml.includes('مراجعة دورية #50'), 'periodic review stays navigation-only with exact cycle link');
check(source('components/ReviewWorkQueue.tsx').includes('مراجعة الأدلة والإصدارات ←') && source('components/EvidenceReviewContext.tsx').includes('title="مراجعة الأدلة والإصدارات"'), 'evidence versions entry uses approved operational terminology');
check(source('components/ReviewWorkQueue.tsx').includes("requireProfile(['admin', 'cybersecurity_team'])"), 'owner and external auditor do not gain Review Center decision access');

let offsets = [];
const pagedRows = await read.readReviewPages((from, to) => { offsets.push([from, to]); return Promise.resolve({ data: Array.from({ length: Math.min(100, 1250 - from) }, (_, id) => ({ id: from + id })), count: 1250, error: null }); });
check(pagedRows.length === 1250 && offsets[1][0] === 100 && offsets.length === 13, 'pages below configured server row cap without silent truncation');
await assert.rejects(read.readReviewPages(() => Promise.resolve({ data: [], error: null, count: null }))); checks++;
await assert.rejects(read.readReviewPages(() => Promise.resolve({ data: [], error: null, count: 1 }))); checks++;
await assert.rejects(read.readReviewPages(from => Promise.resolve({ data: [{ id: from }], error: null, count: from ? 3 : 2 }))); checks++;
let batchSizes = [];
await read.readReviewBatches(Array.from({ length: 451 }, (_, id) => id), ids => { batchSizes.push(ids.length); return Promise.resolve({ data: ids.map(id => ({ id })), count: ids.length, error: null }); });
check(batchSizes.join('|') === '200|200|51', 'bounded batching, not query-per-record');
calls.length = 0; await read.loadReviewWorkSnapshot(actor);
check(calls.length === 8, 'empty sources need only eight parallel source reads, no N+1');
check(calls.every(c => c.options?.count === 'exact' || c.selectOptions?.count === 'exact'), 'every source read asks exact count');
check(!calls.some(c => c.columns.includes('approved_snapshot') || c.name === 'assessment_findings'), 'protected snapshots/legacy model not fetched');
check(calls.some(c => c.name === 'profiles' && c.columns === 'user_id,display_name'), 'display names use existing active profile read, no raw UUID in queue');
check(calls.find(c => c.name === 'assessment_cycles').filters.some(f => f[0] === 'or' && f[1].includes(actor.id)), 'cycle read scoped by authoritative assignments');
response = call => call.name === 'grc_findings' ? { data: null, error: { message: 'permission denied' }, count: null } : { data: [], error: null, count: 0 };
const failed = await read.loadReviewWorkSnapshot(actor);
check(!!failed.errors.findings, 'authorization failure captured explicitly');
check(work.reviewWorkSummary(classify(failed), today).verification === null, 'failed findings query cannot become zero');
const peopleFailure = { ...data, errors: { people: 'Read unavailable' } };
check(classify(peopleFailure).find(c => c.type === 'CORRECTIVE_ACTION_VERIFICATION').status === 'unavailable', 'owner directory failure is unavailable, not false zero');
check(classify(peopleFailure).find(c => c.type === 'EVIDENCE_REVIEW').status === 'ready', 'unrelated evidence category remains available');
for (const file of ['components/ReviewWorkQueue.tsx', 'lib/review-work-queue.ts', 'lib/review-work-queue-read.ts']) check(!/\.(insert|update|upsert)\(|\.delete\(\s*\)|cgp_\w+_command|cgp_review_evidence/.test(source(file)), 'navigation-only file has no mutation: ' + file);
for (const file of ['app/findings/page.tsx', 'components/AssessmentWorkspace.tsx', 'app/controls/[id]/page.tsx']) check(source(file).includes('reviewContextReturn'), 'existing surface has explicit queue return: ' + file);
check(source('app/findings/page.tsx').includes('finding-action-${action.id}') && source('app/findings/page.tsx').includes('finding-decision'), 'source record has exact action/decision anchors');
check(source('app/findings/page.tsx').includes('hasRequestedFinding?') && source('app/findings/page.tsx').includes('السجل المطلوب غير متاح'), 'missing exact finding fails safely without selecting another');
check(source('components/ControlReviewPanel.tsx').includes('c.id===targetCycleId&&c.status===\'open\'') && source('components/ControlReviewPanel.tsx').includes('لم نفتح دورة أخرى'), 'stale periodic link never opens a different cycle');
check(source('components/EvidenceReviewContext.tsx').includes("requireProfile(['admin','cybersecurity_team'])"), 'existing evidence decision authorization preserved');
check(source('app/review/page.tsx').includes('redirectLegacyEvidence') && source('app/review/page.tsx').includes("next.set('evidence', String(legacyId))"), 'legacy evidence hash links still resolve to the decision workspace');

// Exercise the real installed SDK and the actual application query, not just
// a permissive chain mock. Simulate PostgREST's SETOF-record projection: an
// ORDER BY field absent from select must produce the original 42703 failure.
const httpCalls = [], mappingDependent = ['ASSESSMENT_REVIEW_COMPLETION', 'ASSESSMENT_APPROVAL', 'CORRECTIVE_ACTION_VERIFICATION', 'FINDING_VERIFICATION', 'FINDING_CLOSURE'];
let httpRows = [], rpcFailure = false;
const rpcClient = createClient('https://local-contract.invalid', 'local-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, options) => {
    const url = new URL(String(input)), params = url.searchParams, headers = new Headers(options.headers);
    const columns = params.get('select').split(','), orders = params.get('order').split(',');
    const call = { url, headers, method: options.method, offset: Number(params.get('offset')), limit: Number(params.get('limit')) };
    httpCalls.push(call);
    assert.equal(url.hostname, 'local-contract.invalid', 'all HTTP calls intercepted locally'); checks++;
    assert.equal(url.pathname, '/rest/v1/rpc/cgp_crosswalk'); checks++;
    const unavailableOrder = orders.some(order => !columns.includes(order.split('.')[0]));
    if (rpcFailure || unavailableOrder) return new Response(JSON.stringify({ code: '42703', message: 'column record.id does not exist' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    assert.equal(params.get('validation_status'), 'eq.approved'); checks++;
    assert.equal(params.get('order'), 'id.asc'); checks++;
    assert.equal(params.get('select'), 'id,source_id,target_id,validation_status'); checks++;
    assert.ok(headers.get('Prefer').includes('count=exact')); checks++;
    const approved = httpRows.filter(row => row.validation_status === 'approved').sort((a, b) => a.id - b.id);
    // Model a server cap smaller than the requested 500-row page.
    const page = approved.slice(call.offset, call.offset + Math.min(call.limit, 97));
    const range = page.length ? `${call.offset}-${call.offset + page.length - 1}/${approved.length}` : `*/${approved.length}`;
    return new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': range } });
  } },
});
const originalRpc = client.rpc;
client.rpc = (name, args, options) => name === 'cgp_crosswalk' ? rpcClient.rpc(name, args, options) : originalRpc(name, args, options);
response = () => ({ data: [], count: 0, error: null });
const zeroHttp = await read.loadReviewWorkSnapshot(actor);
check(!zeroHttp.errors.mappings && zeroHttp.mappings.length === 0, 'HTTP 200/count zero stays zero, not unavailable');
for (const type of mappingDependent) check(classify(zeroHttp).find(category => category.type === type).status === 'ready', type + ' available with zero approved mappings');

httpCalls.length = 0;
httpRows = Array.from({ length: 1003 }, (_, i) => ({ id: 1003 - i, source_id: 2, target_id: 1, validation_status: 'approved' }));
httpRows.push({ id: 0, source_id: 2, target_id: 1, validation_status: 'pending' });
const populatedHttp = await read.loadReviewWorkSnapshot(actor);
check(!populatedHttp.errors.mappings && populatedHttp.mappings.length === 1003, 'approved crosswalk HTTP reads succeed across server-capped pages');
check(populatedHttp.mappings.every((row, i) => row.id === i + 1), 'numeric id ordering stable with no gaps/duplicates/unapproved mappings');
check(httpCalls.length === 11 && httpCalls.every((call, i) => call.offset === i * 97 && call.limit === 500), 'paging advances by actual returned rows and retains 500-row request size');
for (const type of mappingDependent) check(classify(populatedHttp).find(category => category.type === type).status === 'ready', type + ' no longer unavailable due to projection/order mismatch');

// Prove this regression test would reject the exact old query shape.
const badShape = await rpcClient.rpc('cgp_crosswalk', {}, { count: 'exact' }).select('source_id,target_id,validation_status').eq('validation_status', 'approved').order('id').range(0, 499);
check(badShape.error?.code === '42703', 'HTTP contract catches the original unavailable ordering field');
rpcFailure = true;
const realHttpFailure = await read.loadReviewWorkSnapshot(actor);
check(!!realHttpFailure.errors.mappings, 'real HTTP error remains unavailable, never mislabeled zero');
for (const type of mappingDependent) check(classify(realHttpFailure).find(category => category.type === type).status === 'unavailable', type + ' still fail-closed on real mapping read failure');
client.rpc = originalRpc;
console.log(`PASS: ${checks} P2-B5.1 classification, SoD, role, source separation, navigation, render, paging/batching and error-vs-zero assertions; no live DB/RPC writes.`);

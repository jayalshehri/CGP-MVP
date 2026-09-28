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
const client = { from(name) {
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
 const compiled = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 const resolve = name => {
  if (name.endsWith('.css')) return {};
  if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => [typeof initial === 'number' ? renderPage : initial, () => {}] };
  if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
  if (name === './supabase' || name === '@/lib/supabase') return { supabase: client };
  if (name === '@/lib/auth') return { requireProfile() { throw new Error('live auth forbidden in this test'); } };
  if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
  if (name.startsWith('.')) { const relative = posix.join(posix.dirname(path), name); return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts')); }
  return require(name);
 };
 vm.runInNewContext(compiled, { exports: loadedModule.exports, module: loadedModule, require: resolve, Date, Intl, URLSearchParams, console }, { filename: path });
 return loadedModule.exports;
}
const queue = load('lib/grc-work-queue.ts');
const owner = { id: 'owner', role: 'control_owner' }, team = { id: 'reviewer', role: 'cybersecurity_team' };
const base = { id: 1, control_id: 107, cycle_id: 1, requirement: 'مراجعة دورية', due_date: '2026-09-28', status: 'open', requested_from: 'owner', reviewer_id: 'reviewer', control_owner_id: 'owner', control_code: '2-7-1', control_title: 'عنوان الضابط', framework_code: 'DCC' };
for (const status of ['open', 'changes_requested', 'rejected']) {
 const action = queue.requestAction({ ...base, status }, owner);
 check(action?.label === 'تقديم الدليل' && action.href === '/controls/107/evidence/new?request=1', 'exact existing request-bound submission route: ' + status);
}
for (const role of ['admin', 'cybersecurity_team']) check(queue.requestAction(base, { id: 'team', role })?.label === 'تقديم الدليل', 'existing team assistance is not removed');
check(queue.requestAction(base, { id: 'other', role: 'control_owner' }) === null, 'unassigned owner has no mutation action');
for (const status of ['open', 'submitted']) check(queue.requestAction({ ...base, status }, { id: 'reviewer', role: 'nca_external_auditor' }) === null, 'external auditor remains read-only');
check(queue.requestAction(base, { id: 'owner', role: 'data_governance_team' }) === null, 'no role expansion');
check(queue.requestAction({ ...base, status: 'submitted' }, owner) === null, 'submitted request is not a request to upload again');
const review = queue.requestAction({ ...base, status: 'submitted' }, team, 'from=workspace&view=followup');
check(review?.label === 'مراجعة الدليل' && review.href.includes('tab=evidence') && review.href.includes('from=workspace'), 'assigned reviewer navigates to governed evidence workflow');
check(queue.requestAction({ ...base, status: 'submitted' }, { id: 'other', role: 'admin' }) === null, 'unassigned reviewer gets no review shortcut');
check(queue.requestAction({ ...base, status: 'submitted', requested_from: 'reviewer' }, team) === null, 'no self-review shortcut');
for (const status of ['accepted', 'cancelled']) check(queue.requestAction({ ...base, status }, owner) === null, 'closed request does not accept new submission');
const dates = ['2026-09-27', '2026-09-28', '2026-10-28', '2026-10-29'];
const items = dates.map((due_date, index) => ({ ...base, due_date, id: index + 1 }));
const summary = queue.workQueueSummary([...items, { ...base, id: 8, requested_from: 'other' }, { ...base, id: 9, status: 'submitted' }], owner, '2026-09-28');
check(summary.required === 4 && summary.overdue === 1 && summary.dueSoon === 2, 'exact assigned actionable counters, inclusive today/30-day boundary');
check(queue.workQueueSummary(items, team, '2026-09-28').required === 0, 'team assistance capability does not mislabel someone else’s assignment as mine');
check(queue.workQueueSummary([{ ...base, status: 'submitted' }], team, '2026-09-28').required === 1, 'assigned independent reviewer counter');
check(queue.workQueueSummary([{ ...base, due_date: '2027-01-10' }], owner, '2026-12-28').dueSoon === 1, '30-day calculation crosses year boundary');

const raw = request => ({ ...request, controls: { id: request.control_id, control_code: request.control_code, title_ar: request.control_title, control_owner_id: request.control_owner_id, frameworks: { code: request.framework_code, is_active: true } }, control_review_cycles: { id: request.cycle_id, status: 'open' } });
response = () => ({ data: [raw({ ...items[3], control_title: 'QA: legitimate business title' }), raw(items[0]), raw({ ...base, framework_code: 'QA_SYNTH' }), { ...raw(base), controls: { ...raw(base).controls, frameworks: { code: 'DCC', is_active: false } } }, { ...raw(base), control_review_cycles: { id: 1, status: 'completed' } }], error: null });
const read = await queue.loadWorkRequests(107, 'DCC');
check(read.length === 2 && read[0].due_date === '2026-09-27' && read[1].due_date === '2026-10-29', 'overdue first, nearest then later; inactive/test/closed-cycle excluded');
check(read[1].control_title.startsWith('QA:'), 'legitimate QA-named business record not hidden by title');
const query = calls[0];
check(query.name === 'evidence_requests' && calls.length === 1, 'one scoped join, no all-controls fetch or N+1');
for (const [op, column, value] of [['eq', 'controls.frameworks.is_active', true], ['neq', 'controls.frameworks.code', 'QA_SYNTH'], ['eq', 'control_review_cycles.status', 'open'], ['eq', 'control_id', 107], ['eq', 'controls.frameworks.code', 'DCC']]) check(query.filters.some(filter => JSON.stringify(filter) === JSON.stringify([op, column, value])), 'server-side filter before pagination: ' + column);
check(query.columns.includes('controls!inner') && query.columns.includes('frameworks!inner') && query.columns.includes('control_review_cycles!inner'), 'inner embeddings filter parent request rows');
check(query.orders.join('|') === 'due_date|id', 'stable deadline/ID ordering');
check(!query.columns.includes('*'), 'only required queue columns selected');
calls.length = 0;
response = state => ({ data: state.range[0] === 0 ? Array.from({ length: 500 }, (_, i) => raw({ ...base, id: i + 1 })) : [raw({ ...base, id: 501 })], error: null });
check((await queue.loadWorkRequests()).length === 501 && calls.length === 2 && calls[1].range[0] === 500, 'complete pending read, not misleading first-100 counters');
response = () => ({ data: null, error: { message: 'read denied' } });
await assert.rejects(queue.loadWorkRequests(), /read denied/); checks++;

const { GrcWorkQueue } = load('components/GrcAttention.tsx');
const render = (requests, actor = owner, compact = false, context = '') => renderToStaticMarkup(React.createElement(GrcWorkQueue, { requests, actor, compact, returnContext: context }));
const html = render([base], owner, false, 'from=workspace&domain=2');
check(html.includes('<table') && ['الضابط', 'نوع الطلب', 'الحالة', 'الاستحقاق', 'الإجراء'].every(label => html.includes(label)), 'compact five-column table');
check(html.includes('dir="rtl"') && html.includes('scope="col"'), 'RTL and accessible table headings');
check(html.includes('details') && !html.includes('details open'), 'secondary request text is collapsed');
const controlLink = /href="(\/controls\/107\?[^\"]+)"/.exec(html)?.[1]?.replaceAll('&amp;', '&');
const controlParams = new URLSearchParams(controlLink?.split('?')[1]);
check(controlParams.get('from') === 'workspace' && controlParams.get('domain') === '2' && controlParams.get('tab') === 'overview', 'control reference is contextual Control 360 link');
check((html.match(/workflow-primary/g) ?? []).length === 1 && !html.includes('فتح الضابط'), 'one primary action, no competing open-control button');
check(html.includes('28/09/2026'), 'compact Gregorian date');
check((html.match(/<b>/g) ?? []).length === 3, 'at most three queue summary indicators');
const empty = render([]);
check(empty.includes('لا توجد طلبات تتطلب إجراءً منك حاليًا.') && !empty.includes('grc-queue-summary') && !empty.includes('<table'), 'honest empty state, no zero cards');
const waiting = render([{ ...base, status: 'submitted' }]);
check(waiting.includes('بانتظار المراجعة') && !waiting.includes('workflow-primary') && waiting.includes('لا توجد طلبات تتطلب إجراءً منك حاليًا.'), 'submitted status retained without misleading upload or actionable KPI');
check(!render([base], { id: 'owner', role: 'nca_external_auditor' }).includes('workflow-primary'), 'auditor DOM has no mutation action');
const many = Array.from({ length: 21 }, (_, i) => ({ ...base, id: i + 1 }));
check((render(many).match(/<tr>/g) ?? []).length === 11, 'full queue displays ten rows plus header');
check((render(many, owner, true).match(/<tr>/g) ?? []).length === 6, 'Home compact queue displays five rows plus header');
check(render(many).includes('التالي'), 'all remaining requests reachable through pagination');
renderPage = 2;
check((render(many).match(/<tr>/g) ?? []).length === 2, 'last page renders remaining row');
check((render([base]).match(/<tr>/g) ?? []).length === 2, 'page clamps safely after queue shrink');
console.log(`Work queue UI/query contracts: PASS — ${checks} assertions; no DB writes.`);

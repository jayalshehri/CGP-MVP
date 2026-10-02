// Phase 2C UI and read-contract tests. Mocked Data API; no live writes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url), cache = new Map(), calls = [];
let assertions = 0, response = () => ({ data: [], error: null }), states = [], stateIndex = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function query(name, args) {
  const call = { name, args, filters: [], columns: '', range: null };
  return {
    select(value) { call.columns = value; return this; },
    eq(key, value) { call.filters.push(['eq', key, value]); return this; },
    in(key, value) { call.filters.push(['in', key, value]); return this; },
    order() { return this; }, single() { return this; },
    range(from, to) { call.range = [from, to]; return this; },
    then(resolve, reject) { calls.push(call); return Promise.resolve(response(call)).then(resolve, reject); },
  };
}
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const loadedModule = { exports: {} }; cache.set(path, loadedModule.exports);
  const compiled = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect: () => {}, useState: initial => [stateIndex < states.length ? states[stateIndex++] : typeof initial === 'function' ? initial() : initial, () => {}] };
    if (name === 'next/navigation') return { usePathname: () => '/dcc-assessment', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, replace: () => {} }) };
    if (name === '@/lib/supabase' || name === './supabase') return { supabase: { from: name => query(name), rpc: (name, args) => query(name, args) } };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, scroll: _scroll, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const relative = name.startsWith('@/') ? name.slice(2) : posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts'));
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: loadedModule.exports, module: loadedModule, require: resolve, URLSearchParams, Date, Intl, console }, { filename: path });
  return loadedModule.exports;
}
const journey = load('lib/assessment-journey.ts');
const raw = 'cycle=4&item=9&q=حماية&review=pending&evidence=missing&page=2&from=review&redirect=https://evil.test';
for (const code of ['DCC', 'CSCC', 'TCC', 'OSMACC']) {
  const href = journey.assessmentItemHref(code, 4, 10, raw), params = new URLSearchParams(href.split('?')[1]);
  check(params.get('cycle') === '4' && params.get('item') === '10', code + ' exact item/cycle');
  check(params.get('q') === 'حماية' && params.get('page') === '2' && params.get('from') === 'review', code + ' durable filter/review context');
  check(!params.has('redirect'), code + ' rejects arbitrary return URL');
}
for (const code of ['ECC', 'CCC']) check(journey.assessmentItemHref(code, 4, 9) === null, 'no invented ' + code + ' route');
for (const value of ['-1', '0', 'abc', '1.5', '9007199254740992']) check(!journey.assessmentContext('cycle=' + value).has('cycle'), 'invalid context fails closed');
const cycle = { id: 4, status: 'in_progress', assessor_id: 'evaluator', reviewer_id: 'reviewer', approver_id: 'approver', scope_name: 'نطاق تجريبي' };
for (const role of ['control_owner', 'nca_external_auditor']) check(journey.cycleActions(cycle, 'evaluator', role).length === 0, 'no cycle mutation for ' + role);
check(journey.cycleActions(cycle, 'evaluator', 'admin')[0][0] === 'submit', 'existing evaluator transition');
check(journey.cycleActions(cycle, 'reviewer', 'admin').length === 0, 'reviewer cannot submit evaluator work');
check(journey.cycleActions({ ...cycle, status: 'under_review' }, 'reviewer', 'cybersecurity_team')[0][0] === 'complete', 'reviewer assignment preserved');
const item = { id: 9, cycle_id: 4, control_id: 42, control_code: '2-1-1', title_ar: 'متطلب', description_ar: 'وصف محفوظ', domain_ar: 'مجال', is_scoring: true, compliance_status: 'implemented', notes: 'مبرر', review_status: 'pending', revision: 1 };
const items = [item, { ...item, id: 10, compliance_status: null, review_status: 'changes_requested' }];
for (const [filter, expected] of [['result=unassessed', 10], ['review=pending', 9], ['evidence=linked', 9], ['evidence=missing', 10], ['attention=input', 10], ['attention=findings', 9]]) {
  const result = journey.filterAssessmentItems(items, new URLSearchParams(filter), new Map([[9, 1]]), new Set([9]));
  check(result.length === 1 && result[0].id === expected, 'real filter ' + filter);
}
check(journey.filterAssessmentItems(items, new URLSearchParams('q=وصف'), new Map(), new Set()).length === 2, 'search includes saved regulatory description');
check(journey.itemNeedsInput({ ...item, compliance_status: 'not_implemented' }), 'negative result requires existing engine fields');
check(!journey.itemNeedsInput(item), 'existing completed result recognized, not new scoring');
const reads = load('lib/assessment-journey-read.ts');
await reads.loadFrameworkCycles(3);
check(calls.at(-1).filters.some(([, key, value]) => key === 'framework_id' && value === 3), 'cycles framework-scoped');
check(!calls.at(-1).columns.includes('approved_snapshot') && !calls.at(-1).columns.includes('*'), 'allowed cycle columns only');
response = call => ({ data: call.name === 'assessment_items' ? items : [], error: null });
const begin = calls.length; await reads.loadAssessmentCycle(4);
const cycleCalls = calls.slice(begin);
check(cycleCalls.find(call => call.name === 'assessment_items').filters.some(([, key, value]) => key === 'cycle_id' && value === 4), 'items cycle-scoped');
check(cycleCalls.find(call => call.name === 'grc_findings').filters.some(([, key, value]) => key === 'assessment_cycle_id' && value === 4), 'shared findings cycle-scoped');
check(cycleCalls.find(call => call.name === 'assessment_findings').filters.some(([kind, key, ids]) => kind === 'in' && key === 'item_id' && ids.length === 2), 'legacy gaps separate and batched');
check(!cycleCalls.some(call => call.name === 'grc_evidence_register'), 'no global evidence register per cycle');
response = call => ({ data: call.name === 'controls' ? { official_text_ar: 'النص الرسمي' } : [], error: null });
await reads.loadAssessmentItemContext('DCC', 42, [70]);
check(calls.slice(-3).some(call => call.name === 'cgp_framework_evidence_eligible' && call.args.p_framework_code === 'DCC' && call.args.p_control_id === 42), 'authoritative P2A1 control-scoped API');
check(calls.slice(-3).some(call => call.name === 'evidence' && call.filters.some(([kind, key, ids]) => kind === 'in' && key === 'id' && ids[0] === 70)), 'linked historical versions ID-scoped');
await reads.loadAssessmentReviewQueue('reviewer');
check(calls.at(-1).filters.some(([, key, value]) => key === 'cycle.reviewer_id' && value === 'reviewer'), 'review queue assigned only');
check(calls.at(-1).filters.some(([, key, value]) => key === 'cycle.status' && value === 'under_review'), 'review queue live review only');
check(!calls.at(-1).columns.includes('approved_snapshot'), 'review join does not request snapshot');
response = () => ({ data: [], error: { message: 'denied' } });
await assert.rejects(() => reads.loadAssessmentCycle(4)); assertions++;
const control = load('lib/control360.ts');
const returnContext = new URLSearchParams({ from: 'assessment', assessment_context: raw }).toString();
const controlHref = control.controlHref(42, returnContext, 'activity');
check(new URLSearchParams(controlHref.split('?')[1]).get('from') === 'assessment', 'Control 360 tabs retain assessment origin');
check(!new URLSearchParams(controlHref.split('?')[1]).get('assessment_context').includes('redirect'), 'control return is sanitized');
const editor = load('components/AssessmentItemEditor.tsx').default;
const eligible = [{ evidence_id: 70, file_name: 'direct.pdf', version_number: 2, association: 'direct' }, { evidence_id: 71, file_name: 'shared.pdf', version_number: 3, association: 'shared' }];
function renderEditor(role, status, actor, data = { officialText: 'النص الرسمي فقط', eligible, linked: [] }, overrides = {}) {
  states = [data, '', 0, false]; stateIndex = 0;
  return renderToStaticMarkup(React.createElement(editor, { item, cycle: { ...cycle, status }, people: [], projects: [], evidenceIds: [], actor, role, busy: false, context: raw, returnHref: '/review#assessment-review', previousHref: '/dcc-assessment?cycle=4&item=8', nextHref: '/dcc-assessment?cycle=4&item=10', sharedCount: 2, command: () => { throw new Error('render must not mutate'); }, ...overrides }));
}
const editable = renderEditor('admin', 'in_progress', 'evaluator');
check(editable.includes('النص الرسمي فقط') && editable.includes('النص المحفوظ ضمن دورة التقييم'), 'official vs saved cycle text separate');
check(editable.includes('دليل مباشر') && editable.includes('دليل مشترك عبر مواءمة معتمدة'), 'direct/shared distinguished');
check(editable.includes('direct.pdf') && editable.includes('shared.pdf'), 'eligible API options rendered, no independent status filtering');
check(editable.includes('حفظ نتيجة التقييم') && !editable.includes('قبول النتيجة'), 'one evaluator primary action');
check(editable.includes('البند السابق') && editable.includes('البند التالي'), 'focused previous/next links');
check(editable.includes('/review#assessment-review') && editable.includes('assessment_context='), 'review/finding/control durable roundtrip');
const reviewer = renderEditor('cybersecurity_team', 'under_review', 'reviewer');
check(reviewer.includes('قبول النتيجة') && reviewer.includes('طلب استكمال') && !reviewer.includes('حفظ نتيجة التقييم'), 'reviewer controls independent from evaluator');
for (const role of ['control_owner', 'nca_external_auditor']) {
  const html = renderEditor(role, 'under_review', 'reviewer');
  check(!html.includes('قبول النتيجة') && !html.includes('حفظ نتيجة التقييم'), role + ' no mutation controls');
}
check(renderEditor('admin', 'closed', 'evaluator').includes('عرض فقط'), 'closed item read-only');
check(renderEditor('admin', 'in_progress', 'evaluator', { officialText: null, eligible: [], linked: [] }).includes('لا توجد أدلة مؤهلة'), 'honest evidence empty state');
check(!renderEditor('admin', 'in_progress', 'evaluator', { officialText: null, eligible: [], linked: [] }).includes('النص الرسمي فقط'), 'missing official text not fabricated');
// Invoke UI handlers against a recording mock, not an assessment command on QA.
const recorded = [], form = { compliance_status: 'implemented', notes: 'تعديل صريح', corrective_action: '', expected_compliance_date: '', owner_id: '' };
states = [{ officialText: 'رسمي', eligible, linked: [] }, '', 0, false, form, [70, 71], 'قرار مستقل']; stateIndex = 0;
const tree = editor({ item, cycle, people: [], projects: [], evidenceIds: [], actor: 'evaluator', role: 'admin', busy: false, context: raw, returnHref: '/review#assessment-review', sharedCount: 0,
  command: async (action, payload) => { recorded.push({ action, payload }); return true; } });
const nodes = [];
function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(walk); return; } nodes.push(node); walk(node.props?.children); }
walk(tree);
await nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
check(recorded.length === 1 && recorded[0].action === 'save', 'save invokes exactly one existing command');
check(recorded[0].payload.item_id === 9 && recorded[0].payload.revision === 1, 'save preserves item identity and revision conflict guard');
check(recorded[0].payload.evidence_ids.join(',') === '70,71', 'direct/shared versions linked by ID without file mutation');
check(recorded[0].payload.notes === 'تعديل صريح' && !('review_status' in recorded[0].payload), 'result save does not forge review status');
check(nodes.some(node => node.type === 'p' && node.props.role === 'status' && node.props.children.includes('تعديلات غير محفوظة')), 'dirty state visible before explicit save');
const queue = load('components/AssessmentReviewQueue.tsx').default;
states = [[], false, 0, 'pending', 0]; stateIndex = 0;
check(renderToStaticMarkup(React.createElement(queue, { actor: 'reviewer' })).includes('لا توجد بنود تقييم'), 'review empty state');
const workspace = source('components/AssessmentWorkspace.tsx');
const Workspace = load('components/AssessmentWorkspace.tsx').default;
function renderLanding(role, status, rows = items, shared = [], cycleOverrides = {}) {
  const scope = { ...cycle, status, framework_id: 3, framework_version: '2022-1', created_at: '2026-09-28', due_date: null, next_review_date: null, scope_confirmed_at: null, system_id: null, imported: false, ...cycleOverrides };
  states = [{ id: 3, code: 'DCC', version: '2022-1' }, 'evaluator', role, [scope], rows, [], [], [], [], shared, [], '4:0', false, false, '', '', 0, 'operational']; stateIndex = 0;
  return renderToStaticMarkup(React.createElement(Workspace, { frameworkCode: 'DCC' }));
}
const landing = renderLanding('admin', 'in_progress');
check(landing.includes('نطاق تجريبي') && landing.includes('تم تقييم 1 من 2') && landing.includes('50%'), 'selected scope and X/Y completion');
check(landing.includes('اكتمال التقييم ليس نسبة امتثال') && landing.includes('الالتزام المعتمد — دورة #4'), 'completion separate from approved cycle compliance');
check(landing.includes('class="ae-preview"') && landing.includes('النتيجة') && landing.includes('<th>الأدلة</th>'), 'compact item queue');
check(landing.indexOf('aria-label="الدورة الحالية"') < landing.indexOf('قائمة عمل بنود التقييم') && landing.indexOf('قائمة عمل بنود التقييم') < landing.indexOf('إدارة الدورة والمزيد'), 'current cycle then queue then administration');
check(landing.includes('<details class="ae-card ae-cycle-admin ae-no-print">') && !landing.includes('ae-cycle-admin ae-no-print" open'), 'administration collapsed by default');
check(!landing.includes('0 مشتركة') && !landing.includes('0 ملاحظة مشتركة'), 'no zero finding indicator noise');
check(renderLanding('admin', 'in_progress', items, [{assessment_item_id:9,status:'open'}]).includes('1 ملاحظة مشتركة'), 'existing finding indicator retained');
check(!landing.includes('الاستحقاق:'), 'absent due date omitted');
check(renderLanding('admin', 'in_progress', items, [], {due_date:'2026-10-01'}).includes('الاستحقاق:'), 'meaningful due date retained');
const header = landing.slice(landing.indexOf('aria-label="الدورة الحالية"'), landing.indexOf('قائمة عمل بنود التقييم'));
check(header.includes('متابعة التقييم') && !header.includes('إرسال للمراجعة'), 'incomplete cycle has only continue as primary');
const ready = renderLanding('admin', 'in_progress', [item]);
const readyHeader = ready.slice(ready.indexOf('aria-label="الدورة الحالية"'), ready.indexOf('قائمة عمل بنود التقييم'));
check(readyHeader.includes('إرسال للمراجعة') && !readyHeader.includes('متابعة التقييم'), 'ready cycle has only submit as primary');
const contextual = renderLanding('admin', 'in_progress', [item, {...item,id:11,is_scoring:false,compliance_status:null}]);
check(contextual.slice(contextual.indexOf('aria-label="الدورة الحالية"'),contextual.indexOf('قائمة عمل بنود التقييم')).includes('إرسال للمراجعة'), 'non-scoring context does not masquerade as unfinished scoring work');
check(landing.includes('جمع الأدلة') && landing.includes('إرسال للمراجعة') && landing.includes('تصدير CSV'), 'secondary commands and export retained');
check(renderLanding('cybersecurity_team','under_review', items, [], {reviewer_id:'evaluator'}).includes('قُبلت مراجعة'), 'review state in compact header');
const ordered = ['المتطلب الرسمي','نتيجة التقييم والمبرر','<legend>الأدلة</legend>','<h3>المراجعة</h3>','<h3>الملاحظات والإجراءات</h3>'].map(label=>editable.indexOf(label));
check(ordered.every((position,index)=>position>=0 && (index===0 || position>ordered[index-1])), 'focused item sections in task order');
check(editable.includes('form="assessment-result-9"') && editable.includes('id="assessment-result-9"'), 'sticky save associated with original result form');
check((editable.match(/حفظ نتيجة التقييم/g)||[]).length===1, 'only one save action');
const endpoint = renderEditor('admin','in_progress','evaluator', undefined, {previousHref:undefined,nextHref:undefined});
check(endpoint.includes('<button disabled="">السابق</button>') && endpoint.includes('<button disabled="">التالي</button>'), 'boundary navigation disabled without fabricated links');
check(!landing.includes('تقييم وقياس الالتزام'), 'no second generic framework header');
check(renderLanding('nca_external_auditor', 'closed').includes('نطاق تجريبي') && !renderLanding('nca_external_auditor', 'closed').includes('إنشاء مسودة'), 'auditor historical landing no mutation');
check(renderLanding('control_owner', 'in_progress').includes('ضمن نطاق تكليفك فقط'), 'owner partial scope explicitly labelled');
check(renderLanding('admin', 'draft').includes('بدء التقييم') && renderLanding('admin', 'draft').includes('إعداد المسؤوليات ونطاق الحساب'), 'draft retains certified setup/start workflow');
check(renderLanding('admin', 'in_progress', []).includes('لا توجد بنود في الدورة ضمن صلاحياتك'), 'honest empty cycle item state');
check(workspace.includes("supabase.rpc('cgp_assessment_command'") && workspace.includes('cycle_revision:cycle?.revision'), 'RPC command and optimistic revision preserved');
check(!workspace.includes("rpc('grc_evidence_register')"), 'no global evidence read');
check(!workspace.includes('setInterval') && !source('components/AssessmentItemEditor.tsx').includes('setInterval'), 'no autosave');
check(source('app/findings/page.tsx').includes(".eq('assessment_item_id',idFromUrl)"), 'finding item filter applied server-side');
check(source('app/controls/[id]/page.tsx').includes('assessmentBack'), 'Control 360 explicit item return');
for (const [route, code] of [['dcc-assessment', 'DCC'], ['assessments', 'CSCC'], ['tcc-assessment', 'TCC'], ['osmacc-assessment', 'OSMACC']]) check(source('app/' + route + '/page.tsx').includes('frameworkCode="' + code + '"'), code + ' shared route shell unchanged');
console.log(`PASS: ${assertions} Assessment Journey UI, role, context, read-contract and regression assertions (mocked; no DB writes).`);

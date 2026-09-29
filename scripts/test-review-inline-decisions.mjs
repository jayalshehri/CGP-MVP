// Local/mocked contract and server-render tests. Live clients are forbidden.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require = createRequire(import.meta.url), cache = new Map(), calls = [];
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let checks = 0, response = () => ({ data: [], count: 0, error: null }), mockedState = null, stateIndex = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const actor = { id: 'independent-reviewer', role: 'cybersecurity_team' }, today = '2026-09-29';
function query(name, args) {
  const call = { name, args, filters: [] };
  return {
    select() { return this; }, order() { return this; }, range() { return this; },
    eq(key, value) { call.filters.push([key, value]); return this; },
    in(key, value) { call.filters.push([key, value]); return this; },
    is(key, value) { call.filters.push([key, value]); return this; },
    then(resolve, reject) { calls.push(call); return Promise.resolve(response(call)).then(resolve, reject); },
  };
}
const client = {
  from: name => query(name),
  rpc(name, args) {
    if (!['grc_evidence_register', 'cgp_review_evidence'].includes(name)) throw new Error('Unexpected RPC in mock');
    return query(name, args);
  },
};
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const mod = { exports: {} }; cache.set(path, mod.exports);
  const js = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect() {}, useState(initial) { const actual = React.useState(initial); return mockedState ? [mockedState[stateIndex++], () => {}] : actual; } };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) };
    if (name === './supabase' || name === '@/lib/supabase') return { supabase: client };
    if (name === './auth' || name === '@/lib/auth') return { requireProfile: async () => ({ user: { id: actor.id }, profile: { role: actor.role } }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const relative = name.startsWith('@/') ? name.slice(2) : posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts'));
    }
    return require(name);
  };
  vm.runInNewContext(js, { exports: mod.exports, module: mod, require: resolve, Date, Intl, URL, URLSearchParams, Map, Set, console }, { filename: path });
  return mod.exports;
}
const safety = load('lib/review-decision-safety.ts'), decision = load('lib/review-evidence-decision.ts');
const queue = load('lib/review-work-queue.ts'), read = load('lib/review-work-queue-read.ts');
const view = load('components/ReviewWorkQueue.tsx').ReviewQueueView;
const dialog = load('components/ReviewEvidenceDecision.tsx');
const material = () => ({ record: { id: 51, control_id: 10, source_control_id: 10, link_id: null, evidence_name: 'دليل اختبار محلي', description: 'وصف الدليل', file_name: 'fixture.pdf', file_path: '10/fixture.pdf', evidence_group: 'fixture-group', version_number: 3, uploaded_at: '2026-09-28T12:00:00Z', uploaded_by: 'uploader', uploader_name: 'مقدم مستقل', assigned_reviewer: null, is_current: true, status: 'pending_review', valid_until: null }, control: { id: 10, framework_id: 1, control_code: '1-2-3', title_ar: 'ضابط اختبار محلي', description_ar: 'سياق الضابط', frameworks: { id: 1, code: 'DCC', name_ar: 'إطار الاختبار', version: '2022-1', is_active: true } } });
const baseWork = { key: 'EVIDENCE_REVIEW:51:direct', type: 'EVIDENCE_REVIEW', sourceModel: 'evidence', sourceId: 51, sourceRoute: '/review?view=evidence-history&evidence=51', title: 'دليل اختبار محلي', framework: 'DCC', controlId: 10, controlCode: '1-2-3', cycleId: null, itemId: null, state: 'pending_review', assignee: null, responsibility: 'independent_team', reason: 'بانتظار مراجع مستقل', dueDate: null, actionLabel: 'فتح الدليل' };
const classifications = ['INLINE_SAFE', 'OPEN_RECORD_REQUIRED', 'OPEN_RECORD_REQUIRED', 'OPEN_RECORD_REQUIRED', 'OPEN_RECORD_REQUIRED', 'OPEN_RECORD_REQUIRED', 'OPEN_RECORD_REQUIRED', 'NO_MUTATION'];
check(Object.keys(safety.decisionSafetyMatrix).length === 8, 'all eight work types classified');
Object.entries(safety.decisionSafetyMatrix).forEach(([type, entry], index) => {
  check(entry.classification === classifications[index] && entry.reason.length > 20, type + ' conservative documented decision');
});
const category = item => ({ type: item.type, status: 'ready', items: [item] });
const categories = Object.keys(queue.workTypeLabels).map((type, index) => category({ ...baseWork, type, key: type === 'EVIDENCE_REVIEW' ? baseWork.key : type + ':' + index }));
for (const role of ['admin', 'cybersecurity_team', 'control_owner', 'nca_external_auditor']) {
  const html = renderToStaticMarkup(React.createElement(view, { categories, actor: { ...actor, role }, onReview() {}, raw: 'framework=DCC', update() {} }));
  check((html.match(/فحص الدليل والقرار/g) ?? []).length === (['admin', 'cybersecurity_team'].includes(role) ? 1 : 0), role + ' only approved inline row action');
  check(html.includes('فتح دورة التقييم للاعتماد'), 'approval stays in cycle, never inline: ' + role);
  check(!html.includes('تأكيد إغلاق') && !html.includes('قبول الدليل'), 'no blind approval/closure: ' + role);
}
for (const change of [{ key: 'EVIDENCE_REVIEW:51:99' }, { sourceModel: 'grc_findings' }, { state: 'accepted' }, { controlId: null }]) {
  check(!safety.canOfferInlineEvidence({ ...baseWork, ...change }, actor.role), 'no inline for unsafe/shared context ' + JSON.stringify(change));
}
const htmlMaterial = renderToStaticMarkup(React.createElement(dialog.EvidenceDecisionMaterial, { material: material(), work: baseWork }));
for (const required of ['fixture.pdf', 'إصدار 3', '#51', '1-2-3', 'إطار الاختبار', 'سياق الضابط', 'بانتظار مراجع مستقل', 'معاينة', 'تنزيل الدليل']) check(htmlMaterial.includes(required), 'exact material visible: ' + required);
mockedState = [material(), false, '', 'changes_requested', '', false, false, false]; stateIndex = 0;
const htmlDialog = renderToStaticMarkup(React.createElement(dialog.default, { work: baseWork, actor, raw: 'framework=DCC&page=2', onClose() {}, async onSettled() {} }));
mockedState = null;
check(htmlDialog.includes('<dialog') && htmlDialog.includes('dir="rtl"'), 'native accessible RTL confirmation');
check(htmlDialog.includes('required=""') && htmlDialog.includes('اطلعت على ملف هذا الإصدار') && htmlDialog.includes('تأكيد القرار وتسجيله'), 'reason + version inspection + explicit confirmation');
check(htmlDialog.includes('لا يعتمد امتثال الضابط ولا يغلق دورة تقييم أو ملاحظة'), 'plain consequences without conflating lifecycle');
check(/type="submit"[^>]*disabled=""/.test(htmlDialog), 'cannot confirm before inputs');
check(!htmlDialog.includes('<option value="accepted" selected'), 'acceptance is not default choice');

function dependencies(changes = {}) {
  let executions = [], reads = 0;
  const deps = {
    actor: async () => actor,
    material: async () => { reads++; return material(); },
    execute: async (...args) => { executions.push(args); return { error: null }; },
    today: () => today,
    ...changes,
  };
  return { deps, executions, reads: () => reads };
}
for (const value of ['accepted', 'rejected', 'changes_requested']) {
  const test = dependencies();
  const result = await decision.submitInlineEvidenceDecision(material(), actor, value, '  سبب مستقل  ', true, test.deps);
  check(result.ok && test.executions.length === 1, value + ' executes once, no claim/retry');
  check(test.executions[0].join('|') === '51|' + value + '|سبب مستقل', 'existing signature trimmed reason');
  check((await decision.submitInlineEvidenceDecision(material(), actor, value, ' ', true, test.deps)).failure.kind === 'validation', 'reason mandatory for ' + value);
  check(test.executions.length === 1, 'empty reason never reaches command');
}
for (const [value, reason, inspected] of [['accepted', 'سبب', false], ['bogus', 'سبب', true]]) {
  const test = dependencies();
  check(!(await decision.submitInlineEvidenceDecision(material(), actor, value, reason, inspected, test.deps)).ok, 'pre-submit validation');
  check(test.executions.length === 0 && test.reads() === 0, 'no backend call for invalid inputs');
}
for (const role of ['control_owner', 'nca_external_auditor']) {
  const test = dependencies();
  check((await decision.submitInlineEvidenceDecision(material(), { ...actor, role }, 'accepted', 'سبب', true, test.deps)).failure.kind === 'authorization', role + ' denied independent of render');
  check(!test.executions.length, role + ' zero commands');
}
for (const role of ['admin', 'cybersecurity_team']) {
  const own = material(); own.record.uploaded_by = actor.id;
  const test = dependencies();
  check((await decision.submitInlineEvidenceDecision(own, { ...actor, role }, 'accepted', 'سبب', true, test.deps)).failure.kind === 'sod', role + ' cannot self-review');
  check(!test.executions.length, role + ' SoD before command');
}
for (const change of [{ version_number: 4 }, { is_current: false }, { status: 'accepted' }, { assigned_reviewer: 'other' }, { file_path: '10/other.pdf' }, { valid_until: '2026-09-28' }, { uploaded_by: 'other-uploader' }, { link_id: 9 }, { control_id: 11 }]) {
  const fresh = material(); Object.assign(fresh.record, change);
  const test = dependencies({ material: async () => fresh });
  check((await decision.submitInlineEvidenceDecision(material(), actor, 'accepted', 'سبب', true, test.deps)).failure.kind === 'stale', 'fresh read rejects changed context ' + JSON.stringify(change));
  check(!test.executions.length, 'stale has no mutation');
}
for (const change of [{ frameworks: { ...material().control.frameworks, is_active: false } }, { title_ar: 'changed' }]) {
  const fresh = material(); Object.assign(fresh.control, change);
  const test = dependencies({ material: async () => fresh });
  check((await decision.submitInlineEvidenceDecision(material(), actor, 'accepted', 'سبب', true, test.deps)).failure.kind === 'stale', 'control context fingerprint');
}
for (const freshActor of [{ ...actor, id: 'other-session' }, { ...actor, role: 'control_owner' }]) {
  const test = dependencies({ actor: async () => freshActor });
  check((await decision.submitInlineEvidenceDecision(material(), actor, 'accepted', 'سبب', true, test.deps)).failure.kind === 'authorization', 'session reauthentication before decision');
  check(!test.executions.length, 'changed session no command');
}
const expired = material(); expired.record.valid_until = '2026-09-28';
for (const value of ['accepted', 'rejected', 'changes_requested']) {
  const test = dependencies({ material: async () => expired });
  const result = await decision.submitInlineEvidenceDecision(expired, actor, value, 'سبب الصلاحية', true, test.deps);
  check(value === 'accepted' ? !result.ok && !test.executions.length : result.ok && test.executions.length === 1, 'expiry preserves decision semantics ' + value);
}
for (const [error, kind] of [[{ code: '42501' }, 'authorization'], [{ message: 'Self review denied' }, 'sod'], [{ message: 'Evidence is no longer pending. Refresh the page.' }, 'stale'], [{ message: 'Decision reason required' }, 'validation'], [{ code: '57014' }, 'network'], [{ message: 'Failed to fetch' }, 'network'], [{ message: 'SECRET raw business failure' }, 'backend']]) {
  const test = dependencies({ execute: async (...args) => { test.executions.push(args); return { error }; } });
  const result = await decision.submitInlineEvidenceDecision(material(), actor, 'accepted', 'سبب', true, test.deps);
  check(!result.ok && result.failure.kind === kind && test.executions.length === 1, 'backend denial/uncertainty classified, never success/retried: ' + kind);
  check(!result.failure.message.includes('SECRET'), 'raw backend text not exposed');
}
check(decision.sanitizeDecisionError({ kind: 'network', message: 'SECRET' }).message !== 'SECRET', 'even structured failures sanitized');
check((await decision.loadInlineEvidenceMaterial(baseWork, actor, dependencies().deps)).record.id === 51, 'fresh context loading');
await assert.rejects(decision.loadInlineEvidenceMaterial({ ...baseWork, key: 'EVIDENCE_REVIEW:51:9' }, actor, dependencies().deps)); checks++;
await assert.rejects(decision.loadInlineEvidenceMaterial(baseWork, actor, dependencies({ material: async () => null }).deps)); checks++;

// Exercise the production adapter against a mocked client, including exact RPC payload.
response = call => call.name === 'grc_evidence_register' ? { data: [material().record], count: 1, error: null } : call.name === 'controls' ? { data: [material().control], count: 1, error: null } : { data: null, error: null };
calls.length = 0;
check((await decision.submitInlineEvidenceDecision(material(), actor, 'rejected', 'سبب موثق', true)).ok, 'existing command adapter');
const mutation = calls.filter(call => call.name === 'cgp_review_evidence');
check(mutation.length === 1 && JSON.stringify(mutation[0].args) === JSON.stringify({ p_evidence_id: 51, p_decision: 'rejected', p_notes: 'سبب موثق' }), 'exact existing audited command, no alternative command');
const snapshot = { frameworks: [{ id: 1, code: 'DCC', is_active: true }], controls: [material().control], evidence: [material().record], cycles: [], items: [], itemLinks: [], mappings: [], findings: [], actions: [], periodic: [], errors: {} };
check(queue.buildReviewWorkQueue(snapshot, actor, today).flatMap(c => c.items).length === 1, 'pre-decision row');
response = () => ({ data: [{ ...material().record, status: 'rejected' }], count: 1, error: null }); calls.length = 0;
const refreshed = await read.refreshReviewEvidenceSnapshot(snapshot, actor);
check(calls.length === 1 && calls[0].name === 'grc_evidence_register', 'only affected evidence input refreshed');
check(!queue.buildReviewWorkQueue(refreshed, actor, today).flatMap(c => c.items).length, 'successful decision removed from authoritative queue');
check(snapshot.evidence[0].status === 'pending_review' && refreshed.items === snapshot.items, 'cached inputs preserved, no unrelated reload/reset');
const raw = 'type=EVIDENCE_REVIEW&framework=DCC&responsibility=independent_team&page=2';
check(queue.reviewFilters(raw).toString() === raw, 'active URL/paging context preserved');
const recordParams = new URLSearchParams(queue.reviewWorkHref(baseWork, raw).split('?')[1]);
check(new URLSearchParams(recordParams.get('review_context')).get('page') === '2', 'full-record link retains paging');
response = () => ({ data: null, count: null, error: { code: '57014' } });
const unavailable = await read.refreshReviewEvidenceSnapshot(snapshot, actor);
check(unavailable.errors.evidence && queue.reviewWorkSummary(queue.buildReviewWorkQueue(unavailable, actor, today), today).review === null, 'refresh failure unavailable, never false-zero or decision failure');
for (const role of ['control_owner', 'nca_external_auditor']) { calls.length = 0; await assert.rejects(read.refreshReviewEvidenceSnapshot(snapshot, { ...actor, role })); checks++; check(!calls.length, role + ' no refresh reads'); }

const mutationSource = source('lib/review-evidence-decision.ts');
for (const file of ['lib/review-evidence-decision.ts', 'lib/review-decision-safety.ts', 'components/ReviewEvidenceDecision.tsx', 'components/ReviewWorkQueue.tsx']) {
  // next.delete is URLSearchParams filter maintenance, not a database delete.
  const withoutUrlDeletes = source(file).replace(/next\.delete\([^)]*\)/g, '');
  check(!/\.(insert|update|delete|upsert)\s*\(/.test(withoutUrlDeletes), file + ' no direct writes');
}
check(!mutationSource.includes('start_review') && !mutationSource.includes('cgp_review_shared_evidence_link'), 'no automatic claim or shared-decision bypass');
const rpcSQL = source('supabase/migrations/20260903222239_secure_cgp_workflow.sql'), lifecycleSQL = source('supabase/migrations/20260916101814_grc_review_lifecycle.sql');
check(rpcSQL.includes('Evidence is no longer pending') && rpcSQL.includes("and is_current and status in ('pending_review','under_review')"), 'existing authoritative pending/current recheck');
check(lifecycleSQL.includes('actor=new.uploaded_by') && lifecycleSQL.includes('new.assigned_reviewer<>actor'), 'backend independent reviewer and assignment enforced');
check(lifecycleSQL.includes('insert into public.evidence_reviews') && lifecycleSQL.includes("array['controls','evidence','evidence_reviews'"), 'existing review history plus audit path');
check(lifecycleSQL.includes('Approval of a document never overwrites a control assessment'), 'evidence decision not assessment decision');
check(source('components/ReviewWorkQueue.tsx').includes('refreshReviewEvidenceSnapshot(context.snapshot, actor)'), 'affected reads wired to result callback');
check(source('components/ReviewEvidenceDecision.tsx').includes('submitting.current') && source('components/ReviewEvidenceDecision.tsx').includes('if (busy) event.preventDefault()'), 'duplicate-submit and in-flight close guards');
check(source('components/review-work-queue.css').includes('100dvh') && source('components/review-work-queue.css').includes('focus-visible'), 'bounded responsive dialog and keyboard focus');
const cert = load('lib/qa-review-certification.ts');
const qaUrl = 'https://lkozjnpfufdpzqtzdxhe.supabase.co';
const certEnv = { VERCEL_ENV: 'preview', CGP_QA_CERT_MODE: 'true', NEXT_PUBLIC_SUPABASE_URL: qaUrl };
check(cert.qaReviewCertificationEnabled(certEnv), 'QA Preview and explicit flag enable certification');
for (const badEnv of [
  { ...certEnv, CGP_QA_CERT_MODE: undefined },
  { ...certEnv, CGP_QA_CERT_MODE: 'TRUE' },
  { ...certEnv, VERCEL_ENV: 'production' },
  { ...certEnv, VERCEL_ENV: 'development' },
  { ...certEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.supabase.co' },
  { ...certEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://lkozjnpfufdpzqtzdxhe.supabase.co.evil.example' },
  { ...certEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://prod.supabase.co' },
]) check(!cert.qaReviewCertificationEnabled(badEnv), 'fail-closed certification gate ' + JSON.stringify(badEnv));
const qaMaterial = material();
qaMaterial.control.control_code = 'QA-C-01';
qaMaterial.control.frameworks.code = 'QA_SYNTH';
const qaSnapshot = { ...snapshot, frameworks: [{ id: 1, code: 'QA_SYNTH', is_active: true }], controls: [qaMaterial.control], evidence: [qaMaterial.record] };
check(queue.buildReviewWorkQueue(qaSnapshot, actor, today).every(category => !category.items.length), 'normal business queue still excludes QA_SYNTH');
const qaCategories = queue.buildReviewWorkQueue(qaSnapshot, actor, today, true);
check(qaCategories.flatMap(category => category.items).length === 1 && qaCategories[0].items[0].sourceRoute === '/review/qa-certification', 'certification queue scoped to QA-C-01');
check(queue.buildReviewWorkQueue({ ...qaSnapshot, controls: [{ ...qaMaterial.control, control_code: 'QA-C-02' }] }, actor, today, true).every(category => !category.items.length), 'other QA controls excluded');
check(decision.materialFailure(qaMaterial, actor)?.kind === 'validation' && decision.materialFailure(qaMaterial, actor, true) === null, 'QA_SYNTH opt-in only for certified control');
for (const role of ['control_owner', 'nca_external_auditor']) {
  check(decision.materialFailure(qaMaterial, { ...actor, role }, true)?.kind === 'authorization', role + ' no certification decision rights');
}
const ownQa = structuredClone(qaMaterial); ownQa.record.uploaded_by = actor.id;
check(decision.materialFailure(ownQa, actor, true)?.kind === 'sod', 'certification cannot bypass independent review');
const qaWork = qaCategories[0].items[0];
const qaDeps = dependencies({ material: async () => qaMaterial });
check((await decision.loadInlineEvidenceMaterial(qaWork, actor, qaDeps.deps, true)).record.id === qaMaterial.record.id, 'certification uses normal inline material loading');
check((await decision.submitInlineEvidenceDecision(qaMaterial, actor, 'accepted', 'سبب شهادة', true, qaDeps.deps, true)).ok && qaDeps.executions.length === 1, 'certification uses same decision pipeline');
const staleQa = structuredClone(qaMaterial); staleQa.record.status = 'accepted';
const staleDeps = dependencies({ material: async () => staleQa });
check((await decision.submitInlineEvidenceDecision(qaMaterial, actor, 'accepted', 'سبب شهادة', true, staleDeps.deps, true)).failure.kind === 'stale' && !staleDeps.executions.length, 'certification stale-state blocks RPC');
response = call => call.name === 'grc_evidence_register' ? { data: [qaMaterial.record], count: 1, error: null } : call.name === 'controls' ? { data: [qaMaterial.control], count: 1, error: null } : { data: null, error: null };
check((await read.loadReviewEvidenceContext(qaMaterial.record.id, null)).rows.length === 0, 'normal context hides QA_SYNTH');
check((await read.loadReviewEvidenceContext(qaMaterial.record.id, null, true)).rows.length === 1, 'certification context sees only certified control');
calls.length = 0;
check((await decision.submitInlineEvidenceDecision(qaMaterial, actor, 'rejected', 'سبب شهادة', true, undefined, true)).ok, 'certification production adapter succeeds through existing command');
check(calls.filter(call => call.name === 'cgp_review_evidence').length === 1, 'certification has exactly one authoritative RPC path');
check(source('app/review/qa-certification/page.tsx').includes('CGP_QA_CERT_MODE: process.env.CGP_QA_CERT_MODE') && source('app/review/qa-certification/page.tsx').includes('notFound()'), 'server route denied unless gate passes');
check(!source('app/review/page.tsx').includes('certificationMode'), 'normal Review Center cannot opt in via query');
console.log(`P2-B5.2 local decision/render/read/audit contracts: PASS (${checks} assertions; mocked only; zero QA mutations).`);

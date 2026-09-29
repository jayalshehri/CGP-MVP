// Local contract test for the gated Preview-only B5.3 visual harness. No live services.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url), cache = new Map();
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
let checks = 0;
function check(value, reason) { assert.ok(value, reason); checks++; }
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const fixtureModule = { exports: {} };
  cache.set(path, fixtureModule.exports);
  const compiled = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect: () => {} };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {} }) };
    if (name === '@/lib/supabase' || name === './supabase') return { supabase: new Proxy({}, { get() { throw new Error('No live Supabase access in visual test'); } }) };
    if (name === '@/lib/auth') return { requireProfile() { throw new Error('No live auth in visual test'); } };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const relative = name.startsWith('@/') ? name.slice(2) : posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL('../' + relative + '.tsx', import.meta.url)) ? '.tsx' : '.ts'));
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: fixtureModule.exports, module: fixtureModule, require: resolve, Date, Intl, URL, URLSearchParams, Map, Set, console }, { filename: path });
  return fixtureModule.exports;
}

const cert = load('lib/qa-review-certification.ts');
const fixture = load('lib/review-b53-visual-fixture.ts');
const view = load('components/ReviewWorkQueue.tsx').ReviewQueueView;
const env = { VERCEL_ENV: 'preview', CGP_QA_CERT_MODE: 'true', NEXT_PUBLIC_SUPABASE_URL: 'https://lkozjnpfufdpzqtzdxhe.supabase.co' };
check(cert.qaReviewCertificationEnabled(env), 'existing QA Preview gate allows exact target');
for (const bad of [
  { ...env, VERCEL_ENV: 'production' }, { ...env, VERCEL_ENV: undefined },
  { ...env, CGP_QA_CERT_MODE: undefined }, { ...env, CGP_QA_CERT_MODE: 'false' },
  { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://different.supabase.co' },
]) check(!cert.qaReviewCertificationEnabled(bad), 'gate fails closed: ' + JSON.stringify(bad));
const route = source('app/review/qa-b53-visual/page.tsx');
check(route.includes('await connection()') && route.includes('qaReviewCertificationEnabled') && route.includes('notFound()'), 'server evaluates existing gate per request');
check(!/supabase\.|\.rpc\(|\.insert\(|\.update\(|\.delete\(/.test(route), 'route has no data operations');
const harness = source('components/ReviewB53VisualHarness.tsx');
check(harness.includes("requireProfile(['admin', 'cybersecurity_team'])"), 'harness requires an active authorized reviewer');
check(harness.includes('visualCertificationMode') && !/supabase\.|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.remove\(/.test(harness), 'harness has no business mutation path');
const populated = fixture.b53VisualCategories('populated', 'local-reviewer');
const rows = populated.flatMap(category => category.items);
for (const type of ['CORRECTIVE_ACTION_VERIFICATION', 'FINDING_VERIFICATION', 'FINDING_CLOSURE', 'PERIODIC_REVIEW_FOLLOWUP']) {
  check(rows.filter(row => row.type === type).length === 1, type + ' one deterministic row');
}
check(rows.every(row => row.sourceRoute === '/review/qa-b53-visual'), 'mock rows never target real source records');
check(rows.some(row => row.responsibility === 'assigned') && rows.some(row => row.responsibility === 'independent_team'), 'both responsibility states');
check(rows.some(row => row.dueDate === '2020-01-01') && rows.some(row => row.severityLabel === 'عالية'), 'overdue and severity fields');
check(populated.some(category => category.status === 'ready' && category.items.length === 0), 'empty category alongside four populated categories');
const props = { categories: populated, raw: '', update() {}, actor: { id: 'local-reviewer', role: 'cybersecurity_team' } };
const mockHtml = renderToStaticMarkup(React.createElement(view, { ...props, visualCertificationMode: true }));
check((mockHtml.match(/disabled=""/g) ?? []).length >= 4 && !mockHtml.includes('href='), 'all four mock CTAs disabled, no navigable records');
check(mockHtml.includes('يحتاج تحققًا') && mockHtml.includes('ينتظر الإغلاق'), 'separate verification/closure counters');
check(mockHtml.includes('متأخر') && mockHtml.includes('مسند إليّ') && mockHtml.includes('متاح للفريق المستقل'), 'overdue and responsibility labels');
check(mockHtml.includes('P2B53-VISUAL-MOCK') && mockHtml.includes('التحقق المستقل'), 'long identifier and Arabic title rendered');
const normalHtml = renderToStaticMarkup(React.createElement(view, props));
check(normalHtml.includes('href=') && !normalHtml.includes('review-visual-disabled'), 'normal Review Center renderer unchanged by default');
const zeroHtml = renderToStaticMarkup(React.createElement(view, { ...props, categories: fixture.b53VisualCategories('zero', 'local-reviewer'), visualCertificationMode: true }));
check(zeroHtml.includes('لا توجد أعمال مراجعة أو قرار مؤهلة') && !zeroHtml.includes('غير مكتملين'), 'genuine zero state');
const unavailableHtml = renderToStaticMarkup(React.createElement(view, { ...props, categories: fixture.b53VisualCategories('unavailable', 'local-reviewer'), visualCertificationMode: true }));
check(unavailableHtml.includes('بعض فئات العمل غير متاحة') && unavailableHtml.includes('غير مكتملين'), 'read failure distinct from zero');
check(!/\.rpc\(|\.insert\(|\.update\(|\.delete\(/.test(source('lib/review-b53-visual-fixture.ts')), 'fixture cannot mutate QA');
console.log(`PASS: ${checks} P2-B5.3 QA visual gate, production-renderer, mock CTA, scenario and no-write assertions.`);

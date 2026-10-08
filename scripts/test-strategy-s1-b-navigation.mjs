// Offline contract + actual page render tests. No live auth, data or writes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = new URL('../', import.meta.url), require = createRequire(import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
const project = { id: 37, project_code: 'NOT-AN-ID', name_ar: 'مشروع محدد', status: 'planned', priority: 'high', progress_percent: 15, portfolio_priority: 'P1', execution_year: 1, work_type: 'technical_project', executive_owner_code: 'it', executive_owner_other: null, duration_value: 6, duration_unit: 'month', archived_at: null, archived_by: null, archive_reason: null, import_staging_id: null, mapping_reference_count: 0, mapping_exact_count: 0, mapping_source_error_count: 0, mapping_completeness: 'mapping_pending', description_ar: null };
let activeUrl = new URL('https://local.test/roadmap'), fixture = {}, pathId = '37';
const history = [activeUrl.href]; let position = 0;
const browser = {
  get location() { return activeUrl; },
  history: {
    pushState(_state, _unused, href) { activeUrl = new URL(href, activeUrl); history.splice(++position); history.push(activeUrl.href); },
    replaceState(_state, _unused, href) { activeUrl = new URL(href, activeUrl); history[position] = activeUrl.href; },
  },
};
const move = delta => { position += delta; activeUrl = new URL(history[position]); };
const go = href => browser.history.pushState(null, '', href);

function load(path, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const fixtureModule = { exports: {} }; cache.set(path, fixtureModule.exports);
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    transformers: { before: [context => {
      const visit = node => {
        // Inject local render fixtures into existing state declarations, never app source.
        if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText() === 'useState') {
          const name = node.name.elements[0].name.getText();
          if (Object.hasOwn(fixture, name)) return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type,
            ts.factory.updateCallExpression(node.initializer, node.initializer.expression, node.initializer.typeArguments, [ts.factory.createElementAccessExpression(ts.factory.createIdentifier('__fixture'), ts.factory.createStringLiteral(name))]));
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }] },
  }).outputText;
  const resolve = name => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, useEffect: () => {} };
    if (name === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    if (name === 'next/navigation') return { useParams: () => ({ id: pathId }), useSearchParams: () => activeUrl.searchParams, useRouter: () => ({ push: go, replace() { throw new Error('Unexpected redirect'); } }) };
    if (name === '@/lib/supabase') return { supabase: new Proxy({}, { get() { throw new Error('No live service allowed'); } }) };
    if (name === '@/lib/auth') return { requireProfile() { throw new Error('No live auth allowed'); } };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const relative = name.startsWith('@/') ? name.slice(2) : posix.join(posix.dirname(path), name);
      return load(relative + (existsSync(new URL(relative + '.tsx', root)) ? '.tsx' : '.ts'), cache);
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: fixtureModule.exports, module: fixtureModule, require: resolve, URLSearchParams, console, window: browser, __fixture: fixture }, { filename: path });
  return fixtureModule.exports;
}
const nav = load('lib/strategy-navigation.ts');
const params = text => new URLSearchParams(text);
const plain = value => JSON.parse(JSON.stringify(value));
for (const id of ['', '0', '-1', '1.2', '1e2', '0x25', ' 37 ', '0037', 'NaN', '9007199254740992', 'NOT-AN-ID']) equal(nav.projectIdFromPath(id), null, `invalid path ${id}`);
equal(nav.projectIdFromPath('37'), 37, 'canonical identity');
assert.throws(() => nav.projectHref(0, 'register')); checks++;
const originRoutes = { roadmap: '/roadmap/dashboard', register: '/roadmap', analysis: '/roadmap/analysis', executive: '/roadmap/executive' };
for (const [origin, route] of Object.entries(originRoutes)) {
  const link = nav.projectHref(37, origin);
  equal(new URL(link, activeUrl).pathname, '/roadmap/37', `${origin} exact identity`);
  equal(nav.projectReturn(params(`from=${origin}`)).href, route, `${origin} contextual return`);
  go(route); go(link); move(-1); equal(activeUrl.pathname, route, `${origin} Back`); move(1); equal(activeUrl.pathname, '/roadmap/37', `${origin} Forward`);
}
for (const from of ['', 'unknown', '__proto__', 'constructor', 'https://evil.test', '//evil.test', 'javascript:alert(1)']) {
  equal(nav.projectReturn(params(`from=${encodeURIComponent(from)}&returnUrl=https://evil.test`)).href, '/roadmap', 'invalid origin cannot redirect');
}
const registerParams = params('q=مشروع&priority=P1&execution_year=1&work_type=unset&owner=it&status=planned&duration_unit=month&duration_min=3&duration_max=6.5&mapping=partially_mapped&archive=include');
const registerLink = nav.projectHref(37, 'register', registerParams);
equal(nav.projectReturn(new URL(registerLink, activeUrl).searchParams).href, `/roadmap?${registerParams}`, 'all register filters roundtrip');
equal(plain(nav.registerState(params('year=2030&status=approved&priority=high&execution_year=4&work_type=technology_project&owner=finance&duration_unit=quarter&duration_min=-1&duration_max=abc&mapping=done&missing=everything&archive=yes'))), { q: '', priority: 'all', execution_year: 'all', work_type: 'all', owner: 'all', status: 'all', duration_unit: 'all', duration_min: '', duration_max: '', mapping: 'all', missing: 'all', archive: 'active' }, 'invalid and legacy (quarter/high) register filters default');
equal(plain(nav.portfolioFiltersFrom(nav.registerState(registerParams))), { query: 'مشروع', archive: 'all', priority: 'P1', year: '1', workType: 'unset', owner: 'it', status: 'planned', durationUnit: 'month', durationMin: '3', durationMax: '6.5', mappingCompleteness: 'partially_mapped' }, 'URL state maps exactly to canonical QA PortfolioFilters');
equal(nav.registerState(params('archive=archived')).archive, 'archived', 'archived-only filter');
const roadmapLink = nav.projectHref(37, 'roadmap', params('focus_year=1&focus_quarter=Q1&year=2029'));
equal(roadmapLink, '/roadmap/37?tab=overview&from=roadmap&focus_year=1', 'exact roadmap contract (execution year; quarter ignored)');
equal(nav.projectReturn(new URL(roadmapLink, activeUrl).searchParams).href, '/roadmap/dashboard?focus_year=1', 'focus context roundtrip');
for (const value of ['focus_year=2027&focus_quarter=Q1', 'focus_year=4', 'focus_quarter=Q1']) equal(nav.roadmapFocus(params(value)), null, 'invalid/legacy focus ignored');
for (const tab of ['overview', 'requirements', 'controls', 'evidence', 'treatments', 'audit']) equal(nav.projectView(params(`tab=${tab}`), []).tab, tab, `tab ${tab}`);
equal(plain(nav.projectView(params('tab=history&framework=HIDDEN&coverage=invalid&verification=accepted'), ['DCC'])), { tab: 'overview', framework: 'all', coverage: 'all', verification: 'all' }, 'invalid detail filters default');
go(registerLink);
nav.updateStrategyQuery('tab', 'requirements'); nav.updateStrategyQuery('tab', 'evidence');
move(-1); equal(nav.projectView(activeUrl.searchParams, []).tab, 'requirements', 'tab Back');
move(1); equal(nav.projectView(activeUrl.searchParams, []).tab, 'evidence', 'tab Forward');
for (const [key, value] of [['framework', 'DCC'], ['coverage', 'partial'], ['verification', 'verified']]) nav.updateStrategyQuery(key, value);
const refreshed = new URL(activeUrl.href);
equal(plain(nav.projectView(refreshed.searchParams, ['DCC'])), { tab: 'evidence', framework: 'DCC', coverage: 'partial', verification: 'verified' }, 'refresh restores nondefault tab and filters');
equal(nav.projectReturn(refreshed.searchParams).href, `/roadmap?${registerParams}`, 'detail changes preserve register return');
go('/roadmap'); const initialHistory = history.length;
for (const text of ['م', 'مش', 'مشروع']) nav.updateStrategyQuery('q', text);
equal(history.length, initialHistory, 'search keystrokes replace, never push');
nav.updateStrategyQuery('execution_year', '2'); equal(history.length, initialHistory + 1, 'explicit filter pushes');
move(-1); equal(nav.registerState(activeUrl.searchParams).execution_year, 'all', 'register filter Back');
move(1); equal(nav.registerState(activeUrl.searchParams).execution_year, '2', 'register filter Forward');
equal(nav.registerState(new URL(activeUrl.href).searchParams).q, 'مشروع', 'refresh preserves Arabic query');

export function render(path, href, state = {}) {
  activeUrl = new URL(href, 'https://local.test');
  fixture = { loading: false, projects: [project], project, error: '', role: 'admin', reads: { projects: 'COMPLETE', links: 'COMPLETE', requirements: 'COMPLETE', mapping: 'COMPLETE', controls: 'COMPLETE', treatments: 'COMPLETE' }, ...state };
  return renderToStaticMarkup(React.createElement(load(path).default));
}
for (const [path, origin] of [['app/roadmap/page.tsx', 'register'], ['app/roadmap/dashboard/page.tsx', 'roadmap'], ['app/roadmap/analysis/page.tsx', 'analysis'], ['app/roadmap/executive/page.tsx', 'executive']]) {
  const html = render(path, originRoutes[origin]);
  // UX-2: analysis is aggregate-only (no project list); it links to the register, never to a guessed project.
  if (origin === 'analysis') check(!/\/roadmap\/\d+\?/.test(html), 'analysis renders no per-project links');
  else check(html.includes(`/roadmap/37?tab=overview&amp;from=${origin}`), `${origin} production page exact link rendered`);
  check(!html.includes('/roadmap/NOT-AN-ID'), 'project code is never identity');
}
const detail = 'app/roadmap/[id]/page.tsx';
const detailHTML = render(detail, '/roadmap/37?tab=requirements&from=analysis');
check(detailHTML.includes('aria-selected="true" tabindex="0">المتطلبات'), 'real detail selected tab rendered');
check(detailHTML.includes('href="/roadmap/analysis"') && detailHTML.includes('العودة إلى'), 'real detail contextual return');
const req = { project_id: 37, requirement_id: 12, coverage_type: 'full', cybersecurity_requirements: { id: 12, requirement_code: 'R12', title_ar: 'متطلب', status: 'active' } };
const control = { requirement_id: 12, control_id: 41, coverage_type: 'partial', mapping_confidence: 'confirmed', controls: { id: 41, control_code: 'C41', title_ar: 'ضابط', implementation_status: 'not_implemented', evidence_status: 'accepted', verification_status: 'verified', frameworks: { code: 'DCC' } } };
const filteredHTML = render(detail, '/roadmap/37?tab=controls&framework=DCC&coverage=partial&verification=verified', { projectRequirements: [req], requirementControls: [control] });
for (const value of ['DCC', 'partial', 'verified']) check(filteredHTML.includes(`value="${value}" selected=""`), `actual filter ${value} reconstructs on refresh`);
for (const unavailable of ['المشروع غير موجود أو ليس ضمن صلاحيتك.', 'رقم المشروع غير صحيح.']) {
  const html = render(detail, '/roadmap/999?project_id=37&from=executive', { project: null, error: unavailable });
  check(html.includes('role="alert"') && !html.includes(project.name_ar) && html.includes('href="/roadmap/executive"'), 'missing/deleted/unauthorized shows safe error, no substituted project');
}
const detailSource = source(detail);
check(detailSource.includes('ProjectDetailContent key={id} id={id}'), 'path change remounts data and unsaved local drafts, not query change');
check(detailSource.includes('const projectId = projectIdFromPath(id)') && detailSource.includes('.eq("id", projectId).single()'), 'query uses only exact path identity');
check(detailSource.includes('if (p.error || !p.data) throw new Error("المشروع غير موجود أو ليس ضمن صلاحيتك.")'), 'RLS-hidden and missing records share unavailable behavior');
check(!detailSource.includes('params.get("project_id")') && !detailSource.includes('projects[0]'), 'no query/first-record fallback');
const dashboardSource = source('app/roadmap/dashboard/page.tsx');
check(dashboardSource.includes('yearHeadings.current.get(focusId)?.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" })'), 'bounded heading ref, instant start alignment (including reduced motion)');
check(!/planned_quarter|focus_quarter|Q1|Q4/.test(dashboardSource), 'no quarter logic remains in the roadmap');
check(dashboardSource.includes('if (loading || error || !focusId) return') && dashboardSource.includes('cancelAnimationFrame(frame)'), 'post-render restoration is gated and cancelled on cleanup');
check(!dashboardSource.includes('querySelector') && !dashboardSource.includes('block: "center"'), 'no URL selectors or stretched-cell centering');
const focusedRoadmap = render('app/roadmap/dashboard/page.tsx', '/roadmap/dashboard?focus_year=1');
check(focusedRoadmap.includes('id="roadmap-year-1-heading" class="quarterly-context-heading"><bdi>السنة الأولى · P1</bdi>'), 'exact execution-year heading rendered above cards');
equal((focusedRoadmap.match(/data-reading-focus="true"/g) || []).length, 1, 'exactly one focused year');
for (const query of ['', '?focus_year=2027&focus_quarter=Q1', '?focus_year=5']) {
  check(!render('app/roadmap/dashboard/page.tsx', '/roadmap/dashboard' + query).includes('data-reading-focus'), 'direct or invalid context never substitutes another year');
}
check(!source('lib/strategy-navigation.ts').includes('supabase') && !source('lib/strategy-navigation.ts').includes('returnUrl'), 'URL helper has no data/redirect authority');
console.log(`S1-B exact navigation, URL history and production component renders: ${checks} assertions PASS (offline only)`);

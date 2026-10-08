// Offline only: real page renders, complete/paged read contract, dependency truth.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { render } from './test-strategy-s1-b-navigation.mjs';
const root = new URL('../', import.meta.url);
const source = p => readFileSync(new URL(p, root), 'utf8');
const js = ts.transpileModule(source('lib/strategy-read.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { readStrategyRows, combinedStatus, createReadEpoch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const result = (data, count = data.length) => ({ data, count, error: null });
const zero = await readStrategyRows(async () => result([]), row => row.id);
equal(zero, { data: [], status: 'COMPLETE', error: false }, 'authorized empty read is factual zero, no hidden-record inference');
equal((await readStrategyRows(async () => ({ data: null, error: { message: 'secret SQL detail' }, count: null }), row => row.id)).status, 'UNAVAILABLE', 'primary failure is not zero');
equal((await readStrategyRows(async () => result([], null), row => row.id)).status, 'UNAVAILABLE', 'missing exact count fails closed');
equal((await readStrategyRows(async () => { throw Error('network'); }, row => row.id)).data, [], 'rejected network request safely unavailable');
const rows = Array.from({ length: 1301 }, (_, id) => ({ id })), ranges = [];
const full = await readStrategyRows(async (from, to) => { ranges.push([from, to]); return result(rows.slice(from, Math.min(to + 1, from + 200)), rows.length); }, row => row.id);
equal(full.status, 'COMPLETE', 'server cap below requested size still completes');
equal(full.data.length, 1301, 'over API cap total complete');
equal(ranges.map(r => r[0]), [0, 200, 400, 600, 800, 1000, 1200], 'offset advances by actual returned row count');
const later = await readStrategyRows(async from => from ? ({ data: null, error: {}, count: null }) : result(rows.slice(0, 500), rows.length), row => row.id);
equal(later, { data: [], error: true, status: 'PARTIAL' }, 'later failure discards partial total');
equal((await readStrategyRows(async () => result([{ id: 1 }], 2), row => row.id)).status, 'PARTIAL', 'duplicate/repeated page fails closed');
equal((await readStrategyRows(async from => result([{ id: from }], from ? 3 : 2), row => row.id)).status, 'PARTIAL', 'count drift fails closed');
equal(combinedStatus('COMPLETE', 'UNAVAILABLE'), 'PARTIAL', 'independent mixed success');
equal(combinedStatus('UNAVAILABLE', 'UNAVAILABLE'), 'UNAVAILABLE', 'all unavailable');
equal(combinedStatus('COMPLETE', 'COMPLETE'), 'COMPLETE', 'required sources complete');
const epoch = createReadEpoch(), first = epoch.begin(), second = epoch.begin();
check(!epoch.valid(first) && epoch.valid(second), 'older reload cannot overwrite newer read');
epoch.cancel(); check(!epoch.valid(second), 'unmount invalidates pending read');

const complete = { projects: 'COMPLETE', links: 'COMPLETE', requirements: 'COMPLETE', mapping: 'COMPLETE', controls: 'COMPLETE', treatments: 'COMPLETE' };
const renderPage = (name, states = {}, query = '') => render(`app/roadmap/${name ? name + '/' : ''}page.tsx`, `/roadmap${name === '[id]' ? '/37' : name ? '/' + name : ''}${query}`, { reads: complete, ...states });
const kpi = (html, label) => html.match(new RegExp(`<span>${label}</span><strong>(.*?)</strong>`))?.[1];
// UX-2 summary strip: <dt>label</dt><dd>value</dd> (value may be a filter link).
const strip = (html, label) => html.match(new RegExp(`<dt>${label}</dt><dd>(?:<a [^>]*>)?<bdi>(.*?)</bdi>`))?.[1];
let html = renderPage('', { projects: [] });
equal(strip(html, 'المشاريع'), '0', 'complete register zero');
html = renderPage('', { projects: [], reads: { ...complete, projects: 'UNAVAILABLE' } });
equal(strip(html, 'المشاريع'), 'غير متاح', 'primary count unavailable');
check(!html.includes('لا توجد مشاريع مطابقة'), 'no false empty register on failure');
html = renderPage('', { reads: { ...complete, links: 'UNAVAILABLE', mapping: 'UNAVAILABLE' } });
check(html.includes('مشروع محدد'), 'register independent projects survive');
equal(strip(html, 'ضوابط بربط مباشر'), 'غير متاح', 'relationship count unavailable');
check(html.includes('قراءة جزئية'), 'partial read explained safely');
check(!renderPage('').includes('عبر المتطلبات:'), 'complete empty requirement relationship is not shown as a zero');
// UX-2 analysis KPI cards: <span>label</span><strong><bdi>value</bdi>…
const card = (html, label) => html.match(new RegExp(`<span>${label}</span><strong><bdi>(.*?)</bdi>`))?.[1];
html = renderPage('analysis', { reads: { ...complete, links: 'UNAVAILABLE' } });
equal(card(html, 'بنود تحتاج انتباه الإدارة'), 'غير متاح', 'attention count requires direct relationships');
equal(card(html, 'مشاريع P1'), '1', 'project-only analysis survives');
check(!html.includes('لا توجد بنود تحتاج انتباه الإدارة'), 'no false no-attention conclusion');
html = renderPage('analysis', { reads: { ...complete, treatments: 'UNAVAILABLE' } });
equal(card(html, 'بنود تحتاج انتباه الإدارة'), 'غير متاح', 'treatment-dependent attention unavailable, not zero');
check(html.includes('بعض قواعد التنبيه غير متاحة'), 'partial attention rules explained');
check(!html.includes('data-read-status="UNAVAILABLE"'), 'independent project analysis still partial not page failure');
html = renderPage('dashboard', { reads: { ...complete, links: 'UNAVAILABLE' } }, '?focus_year=1');
check(html.includes('quarterly-project') && html.includes('data-reading-focus="true"'), 'roadmap placement/context survives enrichment failure');
equal(strip(html, 'ضوابط بربط مباشر'), 'غير متاح', 'roadmap enrichment not zero');
equal(kpi(html, 'المشاريع المتأخرة'), undefined, 'date-based delay KPI removed with the portfolio model');
check((html.match(/disabled=""/g) || []).length >= 2, 'both roadmap exports blocked');
html = renderPage('dashboard', { projects: [], reads: { ...complete, projects: 'UNAVAILABLE' } });
check(!html.includes('quarterly-project') && !html.includes('لا توجد مشاريع مسجلة لهذه السنة'), 'failed snapshot cannot masquerade as empty year');
html = renderPage('executive', { projects: [], reads: { ...complete, treatments: 'UNAVAILABLE' } });
equal(kpi(html, 'فئات التنبيه الإداري'), 'غير متاح', 'executive composite alert count blocked');
check(!html.includes('لا توجد فئات تنبيه وفق القواعد الحالية'), 'no false no-alert conclusion');
check(html.includes('بعض قواعد التنبيه غير متاحة'), 'partial executive rule availability');
html = renderPage('executive', { reads: { ...complete, links: 'UNAVAILABLE' }, treatments: [{ project_id: 37, priority: 'high' }] });
check(!html.includes('لديه معالجة عالية بلا رابط'), 'failed links cannot manufacture mapping alert');
html = renderPage('[id]', { reads: { ...complete, requirements: 'UNAVAILABLE', controls: 'UNAVAILABLE' } });
check(html.includes('مشروع محدد') && html.includes('نظرة عامة'), 'detail primary survives secondary failure');
equal(kpi(html, 'ضوابط عبر المتطلبات'), 'غير متاح', 'detail dependent rollup unavailable');
html = renderPage('[id]', { reads: { ...complete, treatments: 'UNAVAILABLE' } }, '?tab=treatments');
check(html.includes('تعذر تحميل المعالجات') && !html.includes('لم تسجل معالجات'), 'treatment failure not empty');
check(html.includes('تقنيات مرشحة'), 'independent primary project technologies retained');
html = renderPage('[id]', { reads: { ...complete, controls: 'UNAVAILABLE' } }, '?tab=evidence');
check(!html.includes('لا توجد أدلة مرتبطة') && html.includes('تعذر تحميل هذا الجزء'), 'evidence section fails safely when parent source unavailable');
html = renderPage('[id]', {}, '?tab=evidence');
check(html.includes('لا توجد علاقة مسجلة ضمن هذا المصدر'), 'complete no-control relationship does not claim evidence-object absence');
for (const path of ['app/roadmap/page.tsx', 'app/roadmap/[id]/page.tsx']) {
  check(!source(path).includes('?? "not_uploaded"'), 'no fabricated evidence status for inaccessible embedded record');
}
check(source('app/roadmap/page.tsx').includes('missingEmbedded'), 'register null embedded source invalidates rollup');
check(source('app/roadmap/[id]/page.tsx').includes('rows.every(row => single(row.cybersecurity_requirements))'), 'null embedded requirement not no relationship');
check(source('app/roadmap/[id]/page.tsx').includes('return control && single(control.frameworks)'), 'null embedded control/framework cannot become false no relation');

// Query source/filter contract preserved. Paging/order/count are the only read-query additions.
const base = '3def47d94d30250c42e4b5b9eedc954493c9adae';
const paths = ['', 'analysis', 'dashboard', 'executive', '[id]'].map(p => `app/roadmap/${p ? p + '/' : ''}page.tsx`);
const extract = (text, method) => [...text.matchAll(new RegExp(`\\.${method}\\(([^)]*)\\)`, 'g'))].map(m => m[1].replace(/\s/g, '')).sort();
function calculations(path, text) {
  // Normalize ONLY the explicit S1-C availability guards, not formulas or source arrays.
  const normalized = text.replaceAll('mappingReady ? requirementCoverage : []', 'requirementCoverage')
    .replaceAll('mappingReady ? requirementControlLinks : []', 'requirementControlLinks')
    .replaceAll('if (!mappingReady) return map;', '')
    .replaceAll('(planningReady ? projects : [])', 'projects')
    .replaceAll('linksReady && treatmentsReady && highTreatmentsWithoutControlLinks.size', 'highTreatmentsWithoutControlLinks.size');
  const file = ts.createSourceFile(path, normalized, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const printer = ts.createPrinter({ removeComments: true });
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'useMemo') found.push(printer.printNode(ts.EmitHint.Unspecified, node.arguments[0], file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
for (const path of paths) {
  const before = execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' }), now = source(path);
  // S2-B deliberately replaced relationship aggregations, and Portfolio Phase 1
  // replaced the quarter/date planning formulas on analysis, roadmap and
  // executive views (priority/execution year/duration). Those contracts are
  // covered by test-portfolio-phase1-model; only the read-shape checks remain here.
  void calculations;
  if (!path.includes('/[id]/')) equal(extract(now, 'from'), extract(before, 'from'), `${path} original source tables retained`);
  check(now.includes('readStrategyRows('), `${path} paged authorized reads`);
  check(now.includes('.order("id")'), `${path} selected primary ID stable ordering`);
  check(now.includes('.order("project_id").order("control_id")') || now.includes('.order("requirement_id").order("control_id")'), `${path} selected compound relationship keys ordered`);
  check(!now.includes('setError(detail)'), `${path} raw read errors not exposed`);
}
const s1Metrics = text => text.split('// --- Requirement layer rollups')[0];
check(!/target_end_date|planned_quarter|planned_year/.test(s1Metrics(source('app/roadmap/portfolio-metrics.ts'))), 'portfolio planning formulas no longer depend on dates or quarters');
check(!source('lib/strategy-read.ts').includes('service_role'), 'no privileged fallback');
check(!source('app/roadmap/page.tsx').includes('ينتظر تطبيق تحديث قاعدة البيانات'), 'read failure never presented as proven missing configuration');
console.log(`S1-C read reliability: ${checks} assertions PASS (offline, no data writes)`);

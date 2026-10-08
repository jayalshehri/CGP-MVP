// Portfolio UX / analytics cleanup contracts. Offline renders with synthetic
// fixtures; no network, credentials, database or QA data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { render } from './test-strategy-s1-b-navigation.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
const kpi = (html, label) => html.match(new RegExp(`<span>${label}</span><strong>(.*?)</strong>`))?.[1];

// --- Arabic counted phrases (CLDR plural rules), reusable, not hard-coded values.
const countJs = ts.transpileModule(read('lib/arabic-count.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { projectCount } = await import(`data:text/javascript;base64,${Buffer.from(countJs).toString('base64')}`);
equal([0, 1, 2, 3, 10, 11, 18, 43, 75, 99, 100, 102, 103].map(projectCount),
  ['0 مشروع', 'مشروع واحد', 'مشروعان', '3 مشاريع', '10 مشاريع', '11 مشروعًا', '18 مشروعًا', '43 مشروعًا', '75 مشروعًا', '99 مشروعًا', '100 مشروع', '102 مشروع', '103 مشاريع'], 'Arabic counted noun forms');
for (const path of ['app/roadmap/page.tsx', 'app/roadmap/dashboard/page.tsx', 'app/roadmap/analysis/page.tsx', 'app/roadmap/executive/page.tsx']) {
  check(!/\} مشاريع<|\} مشروعًا|length\} مشروع/.test(read(path)), `${path}: no hand-built count phrases`);
}

// --- Arabic duration wording (display only), reusable across units and values.
const modelJs = ts.transpileModule(read('lib/project-portfolio.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { formatDuration } = await import(`data:text/javascript;base64,${Buffer.from(modelJs).toString('base64')}`);
equal([[1, 'month'], [2, 'month'], [3, 'month'], [10, 'month'], [11, 'month'], [100, 'month'], [1.5, 'month'], [1, 'week'], [2, 'week'], [4, 'week'], [1, 'year'], [2, 'year'], [3, 'year'], [1, 'day'], [2, 'day'], [14, 'day']].map(([v, u]) => formatDuration(v, u)),
  ['شهر واحد', 'شهران', '3 أشهر', '10 أشهر', '11 شهرًا', '100 شهر', '1.5 شهر', 'أسبوع واحد', 'أسبوعان', '4 أسابيع', 'سنة واحدة', 'سنتان', '3 سنوات', 'يوم واحد', 'يومان', '14 يومًا'], 'Arabic duration forms');
equal(formatDuration(null, 'month'), 'غير محددة', 'missing duration unchanged');

// --- Fixtures: two active projects and one archived project that owns historical requirement paths.
const base = { status: 'planned', progress_percent: 0, description_ar: null, target_outcome: null, recommended_technologies: null, updated_at: null,
  archived_by: null, archive_reason: null, import_staging_id: null, executive_owner_other: null, work_type: 'technical_project',
  mapping_reference_count: 0, mapping_exact_count: 0, mapping_source_error_count: 0, mapping_completeness: 'mapping_pending', archived_at: null };
const projects = [
  { ...base, id: 101, project_code: 'A', name_ar: 'نشط أول', portfolio_priority: 'P1', execution_year: 1, executive_owner_code: 'cybersecurity', duration_value: 6, duration_unit: 'month' },
  { ...base, id: 102, project_code: 'B', name_ar: 'نشط ثان', portfolio_priority: 'P2', execution_year: 2, executive_owner_code: 'dmo', duration_value: 2, duration_unit: 'week' },
  { ...base, id: 103, project_code: 'D', name_ar: 'نشط ثالث', portfolio_priority: 'P1', execution_year: 1, executive_owner_code: 'it', duration_value: 8, duration_unit: 'month' },
  { ...base, id: 105, project_code: 'E', name_ar: 'نشط رابع', portfolio_priority: 'P3', execution_year: 3, executive_owner_code: 'it', duration_value: 6, duration_unit: 'month' },
  { ...base, id: 104, project_code: 'C', name_ar: 'مؤرشف', portfolio_priority: null, execution_year: null, executive_owner_code: null, work_type: null, duration_value: null, duration_unit: null,
    archived_at: '2026-10-06T10:26:14Z', archive_reason: 'cutover' },
];
// R1/R2 belong to the archived project only; R3 to active A. Control 1 is shared by R1 and R3.
const canonical = {
  projectRequirements: [{ project_id: 104, requirement_id: 1, coverage_type: 'full' }, { project_id: 104, requirement_id: 2, coverage_type: 'partial' }, { project_id: 101, requirement_id: 3, coverage_type: 'full' }],
  requirementControls: [
    { requirement_id: 1, control_id: 1, coverage_type: 'full', mapping_confidence: 'confirmed' },
    { requirement_id: 2, control_id: 2, coverage_type: 'full', mapping_confidence: 'confirmed' },
    { requirement_id: 2, control_id: 3, coverage_type: 'partial', mapping_confidence: 'probable' },
    { requirement_id: 3, control_id: 4, coverage_type: 'full', mapping_confidence: 'confirmed' },
    { requirement_id: 3, control_id: 1, coverage_type: 'supporting', mapping_confidence: 'probable' },
  ],
};
const reads = { projects: 'COMPLETE', links: 'COMPLETE', requirements: 'COMPLETE', mapping: 'COMPLETE', controls: 'COMPLETE', treatments: 'COMPLETE', legacy: 'COMPLETE' };
const allFilters = { priority: 'all', execution_year: 'all', work_type: 'all', executive_owner: 'all', status: 'all' };
const page = (path, state = {}) => render(path, `/roadmap/${path.split('/')[2]}`, { projects, reads, canonical, links: [], ...state });
const LABEL = 'ضوابط مميزة عبر المتطلبات';
const bigNumber = html => html.match(/ضوابط مميزة مرتبطة بالمشاريع عبر المتطلبات[\s\S]*?executive-big-number">(.*?)</)?.[1];

// --- Finding 1: requirement-derived controls follow the displayed scope and filters.
// UX-2: they are shown only when non-zero (roadmap strip item, analysis note).
const stripValue = (html, label) => html.match(new RegExp(`<dt>${label.replace(/[()]/g, '\\$&')}</dt><dd>(?:<a [^>]*>)?<bdi>(.*?)</bdi>`))?.[1];
const viaRequirements = {
  'app/roadmap/dashboard/page.tsx': html => stripValue(html, LABEL.replace('مميزة ', '')),
  'app/roadmap/analysis/page.tsx': html => html.match(/عبر المتطلبات: <bdi>\d+<\/bdi> متطلب · <bdi>(\d+)<\/bdi> ضابط/)?.[1],
};
for (const [path, value] of Object.entries(viaRequirements)) {
  equal(value(page(path)), '2', `${path}: active default excludes the archived project's paths (controls 4 and shared 1)`);
  equal(value(page(path, { scope: 'archived' })), '3', `${path}: archived scope shows archived paths only`);
  equal(value(page(path, { scope: 'all' })), '4', `${path}: all scope counts the shared control once (no double counting)`);
  equal(value(page(path, { filters: { ...allFilters, priority: 'P2' } })), undefined, `${path}: zero requirement-derived controls are hidden`);
  equal(value(page(path, { filters: { ...allFilters, executive_owner: 'cybersecurity' } })), '2', `${path}: owner filter keeps only matching projects`);
  const unread = page(path, { canonical: null });
  check(value(unread) === undefined && unread.includes('قراءة جزئية'), `${path}: unreadable canonical source is disclosed, never shown as zero`);
  check(page(path).includes('<span>المحفظة</span><select'), `${path}: portfolio scope selector`);
}
equal(stripValue(page('app/roadmap/dashboard/page.tsx', { links: [{ project_id: 101, control_id: 4 }, { project_id: 104, control_id: 9 }] }), 'ضوابط بربط مباشر'), '1', 'direct links counted separately and scoped');
equal(bigNumber(page('app/roadmap/executive/page.tsx')), '2', 'executive requirement-derived controls = active portfolio only');
check(read('lib/portfolio-analytics.ts').includes('canonicalRelationships(projects.map(project => project.id)'), 'KPI computed from the displayed projects');
for (const path of ['app/roadmap/dashboard/page.tsx', 'app/roadmap/analysis/page.tsx', 'app/roadmap/executive/page.tsx']) {
  check(!read(path).includes('readCanonicalPortfolio('), `${path}: no whole-portfolio aggregate`);
}

// --- Finding 3 (UX-2): planned load replaces the duration tables; stored units are never converted
// except years (x12); day/week durations are disclosed, not counted.
let html = page('app/roadmap/analysis/page.tsx');
check(html.includes('<span>الحمل التخطيطي — السنة الأولى</span><strong><bdi>14</bdi><small>مشروع-شهر</small></strong><small>مشروعان</small>'), 'year-1 load: 6 + 8 project-months, two projects');
check(html.includes('بوحدة يوم/أسبوع غير محتسبة'), 'week duration disclosed, not converted');
html = page('app/roadmap/analysis/page.tsx', { filters: { ...allFilters, execution_year: '2' } });
check(html.includes('<span>الحمل التخطيطي — السنة الأولى</span><strong><bdi>0</bdi>'), 'planned load follows the filters');
html = page('app/roadmap/analysis/page.tsx', { scope: 'all' });
check(html.includes('5 مشاريع — كل المحفظة') && html.includes('<small>كل المحفظة</small>') && !html.includes('المحفظة الجميع'), 'all scope reads «كل المحفظة»');
check(page('app/roadmap/analysis/page.tsx').includes('<small>المحفظة النشطة</small>'), 'active scope label');

// --- Finding 2: bidi-safe roadmap card line (UX-2: no 0% for planned work).
html = page('app/roadmap/dashboard/page.tsx');
check(html.includes('<small class="bidi-meta"><bdi class="rm-nowrap">Cybersecurity</bdi> · <bdi class="rm-nowrap">6 أشهر</bdi></small>'), 'owner and duration isolated in roadmap cards; no 0% progress');

// --- Finding 4/5 (detail): separate explicit labels; Arabic years; bidi-safe header.
const project = projects[0];
html = render('app/roadmap/[id]/page.tsx', '/roadmap/101?tab=overview', { project, reads, legacyLinks: [{ project_id: 101, control_id: 4, controls: { id: 4, control_code: '2-1-1-1', title_ar: 'ضابط' } }] });
equal([kpi(html, 'ضوابط عبر المتطلبات'), kpi(html, 'روابط مباشرة')], ['0', '1'], 'requirement-derived and direct counts are separate and explicit');
check(!html.includes('<span>الضوابط المرتبطة</span>'), 'ambiguous combined label removed');
check(html.includes('السنة الأولى') && !/السنة \d/.test(html), 'detail uses Arabic ordinal year labels');
check(html.includes('المالك: <bdi>Cybersecurity</bdi>') && html.includes('<bdi>6 أشهر</bdi>'), 'detail header isolates mixed-direction fragments');
html = render('app/roadmap/page.tsx', '/roadmap', { projects, reads, open: true, selected: null, form: { project_code: 'X', name_ar: 'x', description_ar: '', portfolio_priority: 'P2', work_type: '', executive_owner_code: '', executive_owner_other: '', duration_value: '', duration_unit: '', status: 'planned', progress_percent: '0', target_outcome: '' } });
check(html.includes('<output>السنة الثانية</output>') && !/السنة \d/.test(html), 'form derives Arabic ordinal year label');

// --- Mobile: page-level overflow contract (legend wraps; tables scroll inside their wrapper).
const css = read('app/roadmap/roadmap.css');
const lastRule = selector => css.lastIndexOf(selector);
check(lastRule('.coverage-legend li{white-space:normal') > lastRule('.coverage-legend li{display:flex;align-items:center;gap:7px;white-space:nowrap}'), 'legend items wrap (later rule overrides nowrap)');
check(css.includes('.project-summary-grid>*{min-width:0}') && css.includes('.coverage-summary-card,.mapping-quality-card{min-width:0;overflow-wrap:anywhere}'), 'summary cards can shrink below content width');
check(/\.controls-table-wrap\{overflow-x:auto/.test(css) && /\.rm-table-wrap\{overflow-x:auto/.test(css), 'tables scroll inside their own wrapper');

// --- Register (UX-2): mapping completeness is a badge with its exact/reference count;
// direct links are summarised once in the strip; details live on the project page.
html = render('app/roadmap/page.tsx', '/roadmap', { projects: [{ ...projects[0], import_staging_id: 'x', mapping_reference_count: 6, mapping_exact_count: 1, mapping_completeness: 'partially_mapped' }], reads, links: [{ project_id: 101, control_id: 4 }] });
check(html.includes('class="rm-mapping partially_mapped" title="ربط جزئي — مراجع بانتظار المراجعة">ربط جزئي<bdi class="rm-mapping-count">1/6</bdi>'), 'mapping badge with exact/reference count');
check(html.includes('<dt>ضوابط بربط مباشر</dt><dd><bdi>1</bdi></dd>'), 'direct links counted once in the summary strip');
check(!html.includes('<details>'), 'no per-row explanatory details in the register');

// --- Executive breadcrumb / title.
check(read('components/AppShell.tsx').includes('pathname === "/roadmap/executive" ? "ملخص محفظة المشاريع السيبرانية"'), 'executive breadcrumb label');
html = page('app/roadmap/executive/page.tsx');
check(html.includes('<span>مشروعان</span>') && html.includes('<span>مشروع واحد</span>'), 'executive year cards use Arabic counted phrases');

console.log(`Portfolio UX/analytics cleanup: ${checks} assertions PASS (offline, synthetic fixtures)`);

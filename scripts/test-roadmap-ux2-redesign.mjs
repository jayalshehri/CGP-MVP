// Roadmap UX-2 information simplification contracts. Offline renders with synthetic
// fixtures; no network, credentials, database or QA/Production data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { render } from './test-strategy-s1-b-navigation.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const load = async path => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };

const base = { status: 'planned', progress_percent: 0, description_ar: null, target_outcome: null, recommended_technologies: null, updated_at: null,
  archived_at: null, archived_by: null, archive_reason: null, import_staging_id: null, executive_owner_other: null, work_type: 'technical_project',
  mapping_reference_count: 0, mapping_exact_count: 0, mapping_source_error_count: 0, mapping_completeness: 'mapping_pending' };
const projects = [
  { ...base, id: 1, project_code: 'PF43-001', name_ar: 'IAM — إدارة الهويات والوصول', portfolio_priority: 'P1', execution_year: 1, executive_owner_code: 'cybersecurity', duration_value: 8, duration_unit: 'month',
    import_staging_id: 's1', mapping_reference_count: 6, mapping_exact_count: 1, mapping_completeness: 'partially_mapped' },
  { ...base, id: 2, project_code: 'PF43-002', name_ar: 'Backup — النسخ الاحتياطي', portfolio_priority: 'P1', execution_year: 1, executive_owner_code: 'it', duration_value: 4, duration_unit: 'month', target_outcome: 'نتيجة' },
  { ...base, id: 3, project_code: 'PF43-003', name_ar: 'DLP — منع تسرب البيانات', portfolio_priority: 'P2', execution_year: 2, executive_owner_code: 'dmo', duration_value: 2, duration_unit: 'month', status: 'in_progress', progress_percent: 40 },
  { ...base, id: 4, project_code: 'PF43-004', name_ar: 'Exit Strategy — ضمانات الخروج', portfolio_priority: 'P3', execution_year: 3, executive_owner_code: 'other', executive_owner_other: 'Procurement / Legal', duration_value: 1, duration_unit: 'month' },
  { ...base, id: 9, project_code: 'APPSEC-01', name_ar: 'Secure Application Development', portfolio_priority: null, execution_year: null, executive_owner_code: null, work_type: null, duration_value: null, duration_unit: null,
    status: 'completed', archived_at: '2026-10-08T06:00:00Z', archived_by: 'u', archive_reason: 'cutover' },
];
const reads = { projects: 'COMPLETE', links: 'COMPLETE', requirements: 'COMPLETE', mapping: 'COMPLETE', controls: 'COMPLETE', treatments: 'COMPLETE' };
const links = [{ project_id: 1, control_id: 10 }, { project_id: 3, control_id: 10 }, { project_id: 3, control_id: 11 }];
const register = (href = '/roadmap', state = {}) => render('app/roadmap/page.tsx', href, { projects, reads, links, ...state });
const strip = html => [...(html.match(/<dl class="rm-summary"[\s\S]*?<\/dl>/)?.[0] ?? '').matchAll(/<dt>(.*?)<\/dt><dd>(?:<a [^>]*>)?<bdi>(.*?)<\/bdi>/g)].map(m => [m[1], m[2]]);

// ------------------------------------------------------------ presentation rules
const rules = await load('lib/roadmap-presentation.ts');
equal([rules.showProgress({ status: 'planned', progress_percent: 0 }), rules.showProgress({ status: 'planned', progress_percent: 10 }), rules.showProgress({ status: 'in_progress', progress_percent: 0 })], [false, true, true], 'progress hidden only for planned work at 0%');
equal([rules.showCardStatus({ status: 'planned' }), rules.showCardStatus({ status: 'on_hold' })], [false, true], 'card status only when not planned');
equal(rules.showDurationUnitFilter([{ duration_unit: 'month' }, { duration_unit: 'month' }, { duration_unit: null }]), false, 'one duration unit: unit filter hidden');
equal(rules.showDurationUnitFilter([{ duration_unit: 'month' }, { duration_unit: 'week' }]), true, 'mixed units: unit filter shown');
equal(rules.showDurationUnitFilter([{ duration_unit: 'month' }], 'week'), true, 'an applied unit filter stays visible');
equal(rules.missingData(projects[0]), ['outcome'], 'missing target outcome detected');
equal(rules.missingData(projects[4]), ['priority', 'owner', 'duration', 'outcome'], 'legacy project missing every planning field');
equal(rules.mappingDistribution(projects.slice(0, 4)), { verified: 0, partially_mapped: 1, mapping_pending: 3, source_error: 0 }, 'mapping completeness distribution');

// ------------------------------------------------------------ register
let html = register();
const source = read('app/roadmap/page.tsx');
equal(strip(html), [['المشاريع', '4'], ['P1', '2'], ['P2', '1'], ['P3', '1'], ['ضوابط بربط مباشر', '2'], ['بيانات ناقصة', '3']], 'one compact summary strip (active scope)');
check(!html.includes('roadmap-metric') && !source.includes('function Metric('), 'no KPI card grid in the register');
check(!html.includes('مخططة') && !html.includes('مواءمات مؤكدة') && !html.includes('Probable'), 'no redundant or confirmed/probable KPIs');
const headers = [...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map(m => m[1]);
equal(headers, ['المشروع', 'الأولوية', 'نوع العمل', 'الجهة المالكة', 'المدة', 'الحالة', 'اكتمال الربط', 'الإجراءات'], 'eight columns, priority and year presented once');
check(html.includes('<span class="rm-priority P1"><bdi>P1</bdi><small>السنة الأولى</small></span>') && !headers.includes('سنة التنفيذ'), 'priority badge carries its execution year (no duplicate column)');
check(!html.includes('<option value="P1">P1 — السنة الأولى</option>') && html.includes('<span>الأولوية / سنة التنفيذ</span>'), 'one merged priority/year filter');
check(!html.includes('<span>وحدة المدة</span>') && !html.includes('حدود المدة تقارن'), 'duration unit filter and explanation hidden when all durations share a unit');
check(!html.includes('>0%<'), 'no 0% progress for planned projects');
check(html.includes('<span class="rm-status in_progress">قيد التنفيذ</span><small class="rm-progress"><bdi>40%</bdi></small>'), 'progress shown once work started');
check(html.includes('<bdi class="rm-code" dir="ltr">PF43-001</bdi>'), 'project code isolated');
check(html.includes('<bdi class="rm-nowrap">Cybersecurity</bdi>') && html.includes('<bdi class="rm-nowrap">Procurement / Legal</bdi>'), 'owner labels isolated and kept on one line');
check(html.includes('ربط جزئي<bdi class="rm-mapping-count">1/6</bdi>'), 'mapping completeness badge with exact/reference count');
check(!html.includes('عبر المتطلبات:') && !html.includes('متطلبات مرتبطة'), 'zero requirement-derived relationships are not shown');
check(!html.includes('تعريف التغطية') && !html.includes('<details>'), 'long explanations removed from the main screen');
const css = read('app/roadmap/roadmap.css');
check(/\.rm-code\{white-space:nowrap/.test(css) && /\.rm-nowrap\{white-space:nowrap\}/.test(css) && /\.rm-priority\{[^}]*white-space:nowrap/.test(css), 'codes, owners and priority badges never wrap');
check(/\.rm-table-wrap\{overflow-x:auto/.test(css) && css.includes('@media(max-width:760px)') && /\.rm-register thead\{display:none\}/.test(css), 'table scrolls inside its wrapper; stacked rows on small screens');

// Requirement-derived relationships appear only when they exist.
html = register('/roadmap', {
  requirementCoverage: [{ project_id: 1, requirement_id: 5, coverage_type: 'full', cybersecurity_requirements: { id: 5 } }],
  requirementControlLinks: [{ requirement_id: 5, control_id: 20, coverage_type: 'full', mapping_confidence: 'confirmed', evidence_status: 'accepted', verification_status: 'verified' }],
});
check(strip(html).some(([label, value]) => label === 'متطلبات مرتبطة' && value === '1'), 'requirement summary shown when non-zero');
check(html.includes('عبر المتطلبات: <bdi>1</bdi> متطلب · <bdi>1</bdi> ضابط'), 'per-project requirement line shown when non-zero');

// Archived rows: clear badge, no completion prompt, no edit action.
html = register('/roadmap?archive=archived');
check(html.includes('<span class="rm-archived">مؤرشف</span>') && !html.includes('بانتظار التصنيف'), 'archived badge, not "pending classification"');
check(!html.includes('>تعديل</button>'), 'edit hidden for archived projects');

// Data-quality filter (moved from analysis): missing target outcome.
html = register('/roadmap?missing=outcome');
check(html.includes('IAM — إدارة الهويات والوصول') && !html.includes('Backup — النسخ الاحتياطي'), 'missing-data filter narrows the register');
check(html.includes('<option value="outcome" selected="">بلا نتيجة مستهدفة</option>'), 'missing-data filter state reconstructs from the URL');

// Mixed duration units bring the unit filter back.
html = register('/roadmap', { projects: [projects[0], { ...projects[1], duration_unit: 'week' }] });
check(html.includes('<span>وحدة المدة</span>'), 'unit filter shown when units differ');

// ------------------------------------------------------------ planned portfolio load
const matrix = rules.plannedLoadMatrix([
  ...projects,
  { ...base, id: 5, project_code: 'X5', name_ar: 'سنة', portfolio_priority: 'P1', executive_owner_code: 'cybersecurity', duration_value: 1, duration_unit: 'year' },
  { ...base, id: 6, project_code: 'X6', name_ar: 'أسبوع', portfolio_priority: 'P1', executive_owner_code: 'it', duration_value: 3, duration_unit: 'week' },
  { ...base, id: 7, project_code: 'X7', name_ar: 'بلا مالك', portfolio_priority: 'P2', executive_owner_code: null, duration_value: 5, duration_unit: 'month' },
]);
const cell = (owner, year) => matrix.rows.find(row => row.owner === owner)?.cells[year - 1];
equal(matrix.rows.map(row => row.owner), ['cybersecurity', 'it', 'dmo', 'other', 'unset'], 'owner rows (unset only when present)');
equal(cell('cybersecurity', 1), { projects: 2, months: 20, unmeasured: 0 }, 'cybersecurity year 1: 8 months + 1 year (12) = 20 project-months');
equal(cell('it', 1), { projects: 2, months: 4, unmeasured: 1 }, 'week durations are not converted; counted as unmeasured');
equal(cell('unset', 2), { projects: 1, months: 5, unmeasured: 0 }, 'projects without an owner are kept visible');
equal(matrix.totals.map(total => [total.projects, total.months]), [[4, 24], [2, 7], [1, 1]], 'year totals');
equal(matrix.unscheduled, 1, 'unprioritised (archived legacy) project is outside the execution years');
equal(matrix.rows.find(row => row.owner === 'cybersecurity').total, { projects: 2, months: 20, unmeasured: 0 }, 'row totals');
equal(rules.plannedLoadMatrix([]).rows.map(row => row.owner), ['cybersecurity', 'it', 'dmo', 'other'], 'empty scope keeps the fixed owner rows');

// ------------------------------------------------------------ analysis
const analysisPath = 'app/roadmap/analysis/page.tsx';
const analysisSource = read(analysisPath);
const analysisState = { projects, reads, links, treatments: [], canonical: { projectRequirements: [], requirementControls: [] } };
html = render(analysisPath, '/roadmap/analysis', analysisState);
const cards = [...html.matchAll(/<article class="rm-kpi">(?:<a [^>]*>)?<span>(.*?)<\/span><strong><bdi>(.*?)<\/bdi>/g)].map(m => [m[1], m[2]]);
equal(cards, [['المشاريع', '4'], ['مشاريع P1', '2'], ['الحمل التخطيطي — السنة الأولى', '12'], ['بنود تحتاج انتباه الإدارة', '0']], 'four management KPIs: projects, P1, year-1 planned load (8+4), attention items');
check(html.includes('<h2 id="planned-load-title">الحمل التخطيطي للمحفظة</h2>') && html.includes('ولا يمثل موارد أو FTE أو نسبة استغلال'), 'planned load is labelled as plan, not resources');
check(!/Capacity|السعة|القدرة الاستيعابية|utili[sz]ation|استغلال الموارد/.test(analysisSource.replace('ولا يمثل موارد أو FTE أو نسبة استغلال', '')), 'no capacity / FTE / utilisation claim');
check(!html.includes('aria-label="الأولوية"') && !html.includes('aria-label="سنة التنفيذ"'), 'no separate priority and execution-year tables');
check(!html.includes('<td>مخطط</td>') && !analysisSource.includes('"status"]'), 'no status table');
check(!html.includes('مدة المشاريع المسجّلة') && !html.includes('وحدة المدة'), 'no duration tables or unit filter');
check(!html.includes('اكتمال عناصر التخطيط') && !html.includes('النتيجة المستهدفة'), 'data completeness moved out of analysis');
check(!html.includes('عبر المتطلبات:'), 'zero requirement-derived coverage hidden');
for (const key of ['verified', 'partially_mapped', 'mapping_pending', 'source_error']) check(html.includes(`<a href="/roadmap?mapping=${key}"`), `mapping completeness ${key} links to the register filter`);
check(render(analysisPath, '/roadmap/analysis', { ...analysisState, scope: 'all' }).includes('<a href="/roadmap?mapping=verified&amp;archive=include"'), 'mapping links keep the selected portfolio scope');
check(html.includes('<span>مشروع تقني</span>') && !html.includes('<span>تقييم</span>'), 'work type mix lists non-zero categories only');
check(html.includes('لا توجد بنود تحتاج انتباه الإدارة وفق القواعد الحالية.'), 'empty attention state stated once');
// Attention rules are shared: analysis count equals the executive list for the same active scope.
const attentionState = { ...analysisState, projects: [...projects, { ...base, id: 8, project_code: 'X8', name_ar: 'متوقف', portfolio_priority: 'P2', executive_owner_code: 'it', duration_value: 2, duration_unit: 'month', status: 'on_hold' }], treatments: [{ project_id: 2, priority: 'high' }, { project_id: 9, priority: 'high' }] };
html = render(analysisPath, '/roadmap/analysis', attentionState);
const analysisAttention = html.match(/<span>بنود تحتاج انتباه الإدارة<\/span><strong><bdi>(\d+)<\/bdi>/)?.[1];
const executiveHtml = render('app/roadmap/executive/page.tsx', '/roadmap/executive', attentionState);
equal(analysisAttention, String((executiveHtml.match(/<article class="(decision|data|risk)"><b>/g) ?? []).length), 'analysis attention count = executive attention list (same rules, same scope)');
equal(analysisAttention, '2', 'stopped project + active high treatment without direct link; archived treatment ignored');

// ------------------------------------------------------------ roadmap
const roadmapPath = 'app/roadmap/dashboard/page.tsx';
html = render(roadmapPath, '/roadmap/dashboard', { projects, reads, links, canonical: { projectRequirements: [], requirementControls: [] } });
equal(strip(html), [['المشاريع', '4'], ['مؤرشفة (خارج العرض)', '1'], ['ضوابط بربط مباشر', '2']], 'roadmap strip: planning facts only (no average progress, no zero requirement counts, no zero unprioritised)');
const year1 = html.split('id="roadmap-year-1"')[1]?.split('</section>')[0] ?? '';
check(year1.includes('<bdi class="rm-code" dir="ltr">PF43-001</bdi>') && !year1.includes('register-priority') && !/>P1</.test(year1.replace('<bdi>السنة الأولى · P1</bdi>', '')), 'cards carry no repeated P1 badge');
check(!year1.includes('السنة الأولى</small>') && !year1.includes('rm-status'), 'cards do not repeat the year; planned status hidden');
check(!html.includes('>0%<'), 'no 0% on planned cards');
const year2 = html.split('id="roadmap-year-2"')[1]?.split('</section>')[0] ?? '';
check(year2.includes('<span class="rm-status in_progress">قيد التنفيذ</span>') && year2.includes('<bdi>40%</bdi>'), 'status and progress shown once work started');
check(!html.includes('At Risk') && !html.includes('مشاريع بلا أولوية'), 'no placeholder or empty unprioritised panel');
html = render(roadmapPath, '/roadmap/dashboard', { projects, reads, links, scope: 'all' });
check(html.includes('<h2 id="unplanned-title">مشاريع بلا أولوية</h2>') && strip(html).some(([label, value]) => label === 'بلا أولوية' && value === '1'), 'unprioritised projects surfaced only when present');

// ------------------------------------------------------------ shared design system
for (const path of ['app/roadmap/page.tsx', roadmapPath, analysisPath]) {
  const text = read(path);
  check(text.includes('<RoadmapTabs active=') && text.includes('<PageHeader title=') && text.includes('<FilterBar label='), `${path}: shared tabs, header and filter bar`);
  check(!text.includes('roadmap-exec-hero') && !text.includes('portfolio-hero') && !text.includes('project-register-hero'), `${path}: no page-specific hero`);
}
for (const path of [roadmapPath, analysisPath]) check(read(path).includes('label="الأولوية / سنة التنفيذ"'), `${path}: merged priority/year filter`);
check(/\.rm-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css) && /@media\(max-width:1100px\)\{\.rm-kpis\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/.test(css), 'analysis cards: 4 → 2 columns');
check(/\.rm-grid-2\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css) && /@media\(max-width:760px\)\{\.rm-grid-2\{grid-template-columns:1fr\}/.test(css), 'analysis panels: 2 → 1 column on small screens');
check(/@media \(max-width:800px\)\{\.year-roadmap-grid\{grid-template-columns:1fr\}/.test(css), 'roadmap years stack on small screens');

console.log(`Roadmap UX-2 redesign: ${checks} assertions PASS (offline, synthetic fixtures)`);

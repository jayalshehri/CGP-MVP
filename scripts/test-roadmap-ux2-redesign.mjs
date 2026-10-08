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
check(/\.rm-table-wrap\{overflow-x:auto/.test(css) && css.includes('@media(max-width:760px)') && /\.rm-table thead\{display:none\}/.test(css), 'table scrolls inside its wrapper; stacked rows on small screens');

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

console.log(`Roadmap UX-2 redesign: ${checks} assertions PASS (offline, synthetic fixtures)`);

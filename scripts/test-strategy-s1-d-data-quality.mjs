// Deterministic field contracts and real component renders; no network.
// Re-based on the canonical QA portfolio model (lib/project-portfolio.ts):
// quarter and project dates are not register fields, so the S1-D edit-safety
// guarantees are asserted on the QA model fields plus the S1-D target outcome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { render } from './test-strategy-s1-b-navigation.mjs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const baseline = path => execFileSync('git', ['show', `bbc737d6b3eadaa46ab98047913503266fc590d0:${path}`], { cwd: root, encoding: 'utf8' });
const transpile = path => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const modelUrl = `data:text/javascript;base64,${Buffer.from(transpile('lib/project-portfolio.ts')).toString('base64')}`;
const load = async path => import(`data:text/javascript;base64,${Buffer.from(transpile(path).replaceAll('"@/lib/project-portfolio"', JSON.stringify(modelUrl))).toString('base64')}`);
const { projectToForm, projectWriteFields, missingPlanningInformation } = await load('lib/strategy-project-fields.ts');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
const project = { id: 37, project_code: 'LOCAL-37', name_ar: 'مشروع محلي', status: 'on_hold', portfolio_priority: 'P2', execution_year: 2, work_type: 'policy_governance', executive_owner_code: 'other', executive_owner_other: 'إدارة الحوكمة', duration_value: 8, duration_unit: 'month', archived_at: null, archived_by: null, archive_reason: null, import_staging_id: null, mapping_reference_count: 0, mapping_exact_count: 0, mapping_source_error_count: 0, mapping_completeness: 'mapping_pending', progress_percent: 42, description_ar: 'وصف مستقل', target_outcome: 'نتيجة مستقلة', recommended_technologies: 'قيمة تقنية قديمة', updated_at: '2026-10-03T11:00:00Z',
  // Deprecated columns still present on the row; the form must never write them.
  planned_year: 2027, planned_quarter: 'Q1', priority: 'medium', initiative_type: 'policy_governance', executive_owner: 'نص قديم', planned_start_date: '2027-01-01', target_end_date: '2027-05-01', forecast_end_date: '2027-06-01', actual_start_date: '2027-01-03', actual_end_date: '2027-06-02' };
const original = structuredClone(project), form = projectToForm(project);
equal(form.target_outcome, project.target_outcome, 'existing outcome loads');
equal([form.portfolio_priority, form.duration_value, form.duration_unit, form.executive_owner_other, form.progress_percent], ['P2', '8', 'month', 'إدارة الحوكمة', '42'], 'model fields load');
equal(projectWriteFields(form, project), {}, 'untouched fields omitted');
const deprecated = ['planned_year', 'planned_quarter', 'priority', 'initiative_type', 'executive_owner', 'planned_start_date', 'target_end_date', 'forecast_end_date', 'actual_start_date', 'actual_end_date', 'execution_year', 'archived_at', 'archived_by', 'archive_reason', 'import_staging_id', 'mapping_completeness', 'mapping_exact_count'];
for (const key of deprecated) {
  check(!Object.hasOwn(form, key), `${key} not part of the portfolio form`);
  check(!Object.hasOwn(projectWriteFields({ ...form, target_outcome: 'x', portfolio_priority: 'P1' }, project), key), `${key} never written on edit`);
  check(!Object.hasOwn(projectWriteFields({ ...form, project_code: 'NEW-1' }), key), `${key} never written on create`);
}
for (const [key, value, expected] of [['target_outcome', 'نتيجة معدلة', 'نتيجة معدلة'], ['description_ar', 'وصف معدل', 'وصف معدل'], ['status', 'planned', 'planned'], ['portfolio_priority', 'P3', 'P3'], ['duration_value', '9', 9]]) {
  equal(projectWriteFields({ ...form, [key]: value }, project), { [key]: expected }, `${key}: only explicitly changed field in update`);
}
equal(projectWriteFields({ ...form, project_code: 'CHANGED-CODE' }, project), {}, 'project code is creation-only: never sent on edit');
equal(projectWriteFields({ ...form, project_code: 'NEW-CODE' }).project_code, 'NEW-CODE', 'project code is sent on create');
equal(projectWriteFields({ ...form, executive_owner_code: 'it' }, project), { executive_owner_code: 'it', executive_owner_other: null }, 'Other text cleared to NULL when owner is not Other');
equal(projectWriteFields({ ...form, duration_value: '', duration_unit: '' }, project), { duration_value: null, duration_unit: null }, 'edit may clear duration only as a pair');
assert.throws(() => projectWriteFields({ ...form, duration_unit: '' }, project)); checks++;
assert.throws(() => projectWriteFields({ ...form, executive_owner_other: ' ' }, project)); checks++;
for (const key of ['target_outcome', 'description_ar']) {
  const empty = { ...project, [key]: null }, draft = projectToForm(empty);
  equal(draft[key], '', `${key} null renders empty input`);
  equal(projectWriteFields(draft, empty), {}, `${key} null remains untouched/omitted`);
  equal(projectWriteFields({ ...form, [key]: '' }, project), { [key]: null }, `${key} explicit clear is null, not unchanged`);
}
for (const status of ['planned', 'in_progress', 'on_hold', 'completed']) {
  equal(projectWriteFields({ ...form, status }, project), status === project.status ? {} : { status }, `status edit never synthesizes model fields, dates or progress for ${status}`);
}
// Historical (archived) projects keep NULL classification; nothing is inferred from legacy fields.
const historical = { ...project, portfolio_priority: null, execution_year: null, work_type: null, executive_owner_code: null, executive_owner_other: null, duration_value: null, duration_unit: null, archived_at: '2026-10-06T10:26:14Z', archive_reason: 'cutover' };
equal([projectToForm(historical).portfolio_priority, projectToForm(historical).work_type, projectToForm(historical).executive_owner_code], ['', '', ''], 'no classification derived from legacy high/medium/low, initiative_type or free text');
equal(projectWriteFields(projectToForm(historical), historical), {}, 'untouched historical row writes nothing');
equal(projectWriteFields({ ...projectToForm(historical), status: 'completed' }, historical), { status: 'completed' }, 'historical row status edit does not force classification');
equal(project, original, 'normalizers do not mutate loaded records');
const create = projectWriteFields({ ...form, target_outcome: '', status: 'completed' });
equal([create.target_outcome, create.status], [null, 'planned'], 'create: optional outcome NULL, status always planned');
assert.throws(() => projectWriteFields({ ...form, portfolio_priority: '' })); checks++;
check(!Object.hasOwn(create, 'recommended_technologies'), 'register never clears technology edited through existing detail workflow');
equal(missingPlanningInformation(project), { priority: false, owner: false, duration: false, outcome: false }, 'complete model');
equal(missingPlanningInformation({ ...historical, target_outcome: ' ' }), { priority: true, owner: true, duration: true, outcome: true }, 'successfully read factual null/blank fields');

const register = 'app/roadmap/page.tsx', detail = 'app/roadmap/[id]/page.tsx', analysis = 'app/roadmap/analysis/page.tsx';
let html = render(register, '/roadmap?q=محلي&status=on_hold&priority=P2', { projects: [project], open: true, selected: project, form });
for (const value of ['نتيجة مستقلة', 'وصف مستقل', 'إدارة الحوكمة', 'السنة 2', '8 أشهر']) check(html.includes(value), `${value} appears in real register`);
check(!/type="date"|الربع|Q1/.test(html), 'no date or quarter inputs in the register');
const outcome = html.match(/<label[^>]*>النتيجة المستهدفة[\s\S]*?<\/label>/)?.[0];
check(outcome && !outcome.includes('required='), 'outcome optional in actual form');
html = render(detail, '/roadmap/37?tab=overview&from=roadmap&focus_year=2', { project });
for (const text of ['P2 — السنة الثانية', 'السنة 2', '8 أشهر', 'إدارة الحوكمة', 'سياسة وحوكمة', 'الربط بانتظار المراجعة']) check(html.includes(text), `detail shows ${text}`);
check(!/تاريخ الانتهاء المستهدف|تاريخ البدء|dateTime="2027/.test(html), 'detail no longer shows project dates');
check(html.includes('آخر تعديل:') && !/آخر مراجعة|آخر اعتماد|آخر تحقق/.test(html), 'updated_at only modification');
check(html.includes(`dateTime="${project.updated_at}"`), 'stored updated_at preserved');
html = render(detail, '/roadmap/37', { project: { ...historical, target_outcome: null } });
for (const label of ['لا توجد نتيجة مستهدفة مسجلة', 'غير مصنّفة', 'بانتظار التصنيف', 'مؤرشفة — cutover']) check(html.includes(label), `loaded absence/archive: ${label}`);
html = render(detail, '/roadmap/37', { project: null, error: 'المشروع غير موجود أو ليس ضمن صلاحيتك.' });
check(!html.includes('لا توجد نتيجة مستهدفة') && !html.includes('بانتظار التصنيف'), 'failed record never becomes missing-field conclusion');
for (const status of ['UNAVAILABLE', 'PARTIAL']) {
  html = render(analysis, '/roadmap/analysis', { projects: [project], reads: { projects: status, links: 'COMPLETE', treatments: 'COMPLETE' } });
  const summary = html.split('aria-labelledby="planning-information-title"')[1];
  check(summary.includes('غير متاح') && !summary.includes('<dd>'), `${status}: no missing counts from failed/partial project read`);
}
html = render(analysis, '/roadmap/analysis', { projects: [project], reads: { projects: 'COMPLETE', links: 'UNAVAILABLE', treatments: 'COMPLETE' } });
const summary = html.split('aria-labelledby="planning-information-title"')[1];
check(summary.includes('<dd>0</dd>'), 'independent successful project-field summary survives failed links');
html = render(analysis, '/roadmap/analysis', { projects: [historical], reads: { projects: 'COMPLETE', links: 'COMPLETE', treatments: 'COMPLETE' } });
check(html.includes('0 مشروع نشط'), 'archived projects excluded from analysis');
equal(read('lib/strategy-read.ts'), baseline('lib/strategy-read.ts'), 'S1-C paging/read-state contracts byte-identical');
for (const path of ['components/AppShell.tsx', 'components/FeedbackWidget.tsx', 'app/globals.css']) equal(read(path), baseline(path), `${path} unchanged (mobile deferred)`);
check(read(register).includes('projectWriteFields(form, selected ?? undefined)'), 'real authorized mutation uses tested delta payload');
check(read(register).includes('.update(payload).eq("id", selected.id).select("*").single()'), 'existing exact-record mutation path');
check(read(register).includes('requireProfile(["admin", "cybersecurity_team"])'), 'existing authorization preserved');
check(read('lib/strategy-project-fields.ts').includes('portfolioPayload(form, !original)'), 'validation delegated to canonical QA portfolioPayload');
console.log(`S1-D existing fields / edit safety / data quality: ${checks} assertions PASS (offline)`);

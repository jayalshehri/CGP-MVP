// Deterministic existing-field contracts and real component renders; no network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { render } from './test-strategy-s1-b-navigation.mjs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const baseline = path => execFileSync('git', ['show', `bbc737d6b3eadaa46ab98047913503266fc590d0:${path}`], { cwd: root, encoding: 'utf8' });
const load = async path => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText).toString('base64')}`);
const { projectToForm, projectWriteFields, projectDateLabels, missingPlanningInformation } = await load('lib/strategy-project-fields.ts');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
const project = { id: 37, project_code: 'LOCAL-37', name_ar: 'مشروع محلي', initiative_type: 'policy_governance', status: 'on_hold', priority: 'medium', planned_year: 2027, planned_quarter: 'Q1', executive_owner: 'إدارة الحوكمة', planned_start_date: '2027-01-01', actual_start_date: '2027-01-03', target_end_date: '2027-05-01', forecast_end_date: '2027-06-01', actual_end_date: '2027-06-02', progress_percent: 42, description_ar: 'وصف مستقل', target_outcome: 'نتيجة مستقلة', recommended_technologies: 'قيمة تقنية قديمة', updated_at: '2026-10-03T11:45:00Z' };
const original = structuredClone(project), form = projectToForm(project);
equal(form.target_outcome, project.target_outcome, 'existing outcome loads');
equal(form.forecast_end_date, project.forecast_end_date, 'existing forecast loads independently');
equal(projectWriteFields(form, project), {}, 'untouched fields omitted (including hidden actual dates)');
for (const [key, value] of [['target_outcome', 'نتيجة معدلة'], ['forecast_end_date', '2027-07-01']]) {
  const payload = projectWriteFields({ ...form, [key]: value }, project);
  equal(payload, { [key]: value }, `${key}: only explicitly changed field in update`);
  const saved = { ...project, ...payload };
  equal(projectToForm(saved)[key], value, `${key}: edit roundtrip`);
  for (const keep of ['description_ar', 'target_end_date', 'actual_start_date', 'actual_end_date', 'status', 'progress_percent', 'recommended_technologies']) equal(saved[keep], project[keep], `${key} preserves ${keep}`);
}
for (const key of ['target_outcome', 'forecast_end_date', 'executive_owner', 'description_ar', 'planned_start_date', 'target_end_date', 'actual_start_date', 'actual_end_date']) {
  const empty = { ...project, [key]: null }, draft = projectToForm(empty);
  equal(draft[key], '', `${key} null renders empty input`);
  equal(projectWriteFields(draft, empty), {}, `${key} null remains untouched/omitted`);
  equal(({ ...empty, ...projectWriteFields(draft, empty) })[key], null, `${key} stays null`);
  equal(projectWriteFields({ ...form, [key]: '' }, project), { [key]: null }, `${key} explicit clear is null, not unchanged`);
  const legacyEmpty = { ...project, [key]: '' };
  equal(projectWriteFields(projectToForm(legacyEmpty), legacyEmpty), {}, `${key} legacy empty not silently normalized`);
}
const nullableForecast = { ...project, forecast_end_date: null };
equal(projectWriteFields({ ...projectToForm(nullableForecast), target_outcome: 'جديد' }, nullableForecast), { target_outcome: 'جديد' }, 'no forecast copied from target or progress');
for (const status of ['planned', 'in_progress', 'on_hold', 'completed']) {
  const p = { ...project, status };
  const patch = projectWriteFields({ ...projectToForm(p), target_outcome: 'جديد' }, p);
  equal(patch, { target_outcome: 'جديد' }, `hidden actual dates retained for ${status}`);
  equal(projectWriteFields({ ...form, status }, project), status === project.status ? {} : { status }, `status edit never synthesizes dates/forecast/progress for ${status}`);
}
equal(project, original, 'normalizers do not mutate loaded records');
const create = projectWriteFields({ ...form, forecast_end_date: '', target_outcome: '' });
equal(create.forecast_end_date, null, 'new forecast can be null');
equal(create.target_outcome, null, 'new outcome can be null');
check(!Object.hasOwn(create, 'recommended_technologies'), 'register never clears technology edited through existing detail workflow');
equal(projectDateLabels, { planned_start_date: 'تاريخ البدء المخطط', actual_start_date: 'تاريخ البدء الفعلي', target_end_date: 'تاريخ الانتهاء المستهدف', forecast_end_date: 'تاريخ الانتهاء المتوقع', actual_end_date: 'تاريخ الانتهاء الفعلي' }, 'date field/label mapping exact');
equal(missingPlanningInformation(project), { owner: false, outcome: false, target: false, forecast: false }, 'legacy free-text owner counts as present');
equal(missingPlanningInformation({ executive_owner: ' ', target_outcome: null, target_end_date: null, forecast_end_date: null }), { owner: true, outcome: true, target: true, forecast: true }, 'successfully read factual null/blank fields');

const register = 'app/roadmap/page.tsx', detail = 'app/roadmap/[id]/page.tsx', analysis = 'app/roadmap/analysis/page.tsx';
let html = render(register, '/roadmap?q=محلي&year=2027&status=on_hold&priority=medium', { projects: [project], open: true, selected: project, form });
for (const value of ['نتيجة مستقلة', '2027-06-01', 'وصف مستقل']) check(html.includes(value), `${value} appears in real edit form`);
check(!html.includes('value="2027-01-03"') && !html.includes('value="2027-06-02"'), 'actual date inputs remain conditional/hidden for on_hold');
for (const label of ['النتيجة المستهدفة', 'تاريخ الانتهاء المتوقع']) {
  const field = html.match(new RegExp(`<label[^>]*>${label}[\\s\\S]*?</label>`))?.[0];
  check(field && !field.includes('required='), `${label} optional in actual form`);
}
html = render(detail, '/roadmap/37?tab=overview&from=roadmap&focus_year=2027&focus_quarter=Q1', { project });
for (const label of Object.values(projectDateLabels)) check(html.includes(label), `${label} detail present`);
for (const key of Object.keys(projectDateLabels)) check(html.includes(`dateTime="${project[key]}"`), `${key} exact stored date rendered`);
check(html.includes('مالك مسجل نصيًا') && !html.includes('غير مسند'), 'legacy owner is not unassigned identity');
check(html.includes('آخر تعديل:') && !/آخر مراجعة|آخر اعتماد|آخر تحقق/.test(html), 'updated_at only modification');
check(html.includes(`dateTime="${project.updated_at}"`), 'stored updated_at preserved');
check(html.includes('نتيجة مستقلة') && html.includes('وصف مستقل'), 'description and outcome separate');
html = render(detail, '/roadmap/37', { project: { ...project, executive_owner: null, target_outcome: null, target_end_date: null, forecast_end_date: null } });
for (const label of ['لا يوجد مالك مسجل', 'لا توجد نتيجة مستهدفة مسجلة', 'لا يوجد تاريخ انتهاء مستهدف', 'غير مقدم — اختياري']) check(html.includes(label), `loaded absence: ${label}`);
html = render(detail, '/roadmap/37', { project: null, error: 'المشروع غير موجود أو ليس ضمن صلاحيتك.' });
check(!html.includes('لا توجد نتيجة مستهدفة') && !html.includes('لا يوجد مالك مسجل'), 'failed record never becomes missing-field conclusion');
for (const status of ['UNAVAILABLE', 'PARTIAL']) {
  html = render(analysis, '/roadmap/analysis', { projects: [project], reads: { projects: status, links: 'COMPLETE', treatments: 'COMPLETE' } });
  const summary = html.split('aria-labelledby="planning-information-title"')[1];
  check(summary.includes('غير متاح') && !summary.includes('<dd>'), `${status}: no missing counts from failed/partial project read`);
}
html = render(analysis, '/roadmap/analysis', { projects: [project], reads: { projects: 'COMPLETE', links: 'UNAVAILABLE', treatments: 'COMPLETE' } });
const summary = html.split('aria-labelledby="planning-information-title"')[1];
check(summary.includes('<dd>0</dd>'), 'independent successful project-field summary survives failed links');
check(html.includes('التقنية اختيارية'), 'technology not universally required');
const s1Metrics = text => text.split('// --- Requirement layer rollups')[0];
equal(s1Metrics(read('app/roadmap/portfolio-metrics.ts')), s1Metrics(baseline('app/roadmap/portfolio-metrics.ts')), 'S1 project/date/five-element formula byte-identical; S2-B relationship rollup tested separately');
equal(read('lib/strategy-navigation.ts'), baseline('lib/strategy-navigation.ts'), 'S1-B URL contracts byte-identical');
equal(read('lib/strategy-read.ts'), baseline('lib/strategy-read.ts'), 'S1-C paging/read-state contracts byte-identical');
for (const path of ['components/AppShell.tsx', 'components/FeedbackWidget.tsx', 'app/globals.css']) equal(read(path), baseline(path), `${path} unchanged (mobile deferred)`);
check(read(register).includes('projectWriteFields(form, selected ?? undefined)'), 'real authorized mutation uses tested delta payload');
check(read(register).includes('.update(payload).eq("id", selected.id).select("*").single()'), 'existing exact-record mutation path');
check(read(register).includes('requireProfile(["admin", "cybersecurity_team"])'), 'existing authorization preserved');
const dateHelpers = { planned_start_date: 'planned-start-empty', actual_start_date: 'actual-start-empty', target_end_date: 'target-end-empty', forecast_end_date: 'forecast-end-empty', actual_end_date: 'actual-end-empty' };
for (const empty of [true, false]) {
  const p = { ...project, status: 'completed', ...Object.fromEntries(Object.keys(dateHelpers).map(key => [key, empty ? null : project[key]])) };
  const dateForm = projectToForm(p);
  const markup = render(register, '/roadmap', { projects: [p], open: true, selected: p, form: dateForm });
  for (const [field, helperId] of Object.entries(dateHelpers)) {
    const label = markup.match(new RegExp(`<label[^>]*>${projectDateLabels[field]}[\\s\\S]*?</label>`))?.[0];
    check(label?.includes('type="date"'), `${field}: native date input retained`);
    check(label.includes(`value="${dateForm[field]}"`), `${field}: actual input value retained`);
    equal(label.includes(`id="${helperId}"`), empty, `${field}: empty helper conditional`);
    equal(label.includes('لا يوجد تاريخ مسجل'), empty, `${field}: empty wording conditional`);
    equal(Boolean(label.match(new RegExp(`aria-describedby="[^"]*${helperId}`))), empty, `${field}: helper linked accessibly only while empty`);
    check(!/placeholder=|defaultValue=|Safari|WebKit/.test(label), `${field}: no invented date or browser-specific business text`);
  }
  equal(projectWriteFields(dateForm, p), {}, 'date presentation does not change unchanged payload');
}
equal(read('lib/strategy-project-fields.ts'), execFileSync('git', ['show', '9c1acbe1b5d5926b4223dc29c8b6a2218b0a29fe:lib/strategy-project-fields.ts'], { cwd: root, encoding: 'utf8' }), 'corrective polish leaves initialization/serialization byte-identical');
console.log(`S1-D existing fields / edit safety / data quality: ${checks} assertions PASS (offline)`);

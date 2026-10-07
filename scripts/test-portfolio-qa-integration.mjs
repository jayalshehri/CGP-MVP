// QA portfolio model integrated into the S1/S2 roadmap views. Offline renders with
// synthetic QA-shaped fixtures; no network, credentials, database or QA data.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { render } from './test-strategy-s1-b-navigation.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };

const base = { status: 'planned', progress_percent: 0, description_ar: null, target_outcome: null, recommended_technologies: null, updated_at: null,
  archived_at: null, archived_by: null, archive_reason: null, import_staging_id: null, executive_owner_other: null,
  mapping_reference_count: 0, mapping_exact_count: 0, mapping_source_error_count: 0, mapping_completeness: 'mapping_pending' };
const projects = [
  { ...base, id: 101, project_code: 'PF43-001', name_ar: 'مشروع أول', portfolio_priority: 'P1', execution_year: 1, work_type: 'technical_project', executive_owner_code: 'cybersecurity', duration_value: 6, duration_unit: 'month',
    import_staging_id: '00000000-0000-4000-8000-000000000001', mapping_reference_count: 4, mapping_exact_count: 1, mapping_completeness: 'partially_mapped' },
  { ...base, id: 102, project_code: 'PF43-002', name_ar: 'مشروع ثان', portfolio_priority: 'P2', execution_year: 2, work_type: 'technical_change', executive_owner_code: 'other', executive_owner_other: 'إدارة المشتريات', duration_value: 2, duration_unit: 'week', status: 'in_progress' },
  { ...base, id: 103, project_code: 'PF43-003', name_ar: 'مشروع ثالث', portfolio_priority: 'P3', execution_year: 3, work_type: 'assessment', executive_owner_code: 'dmo', duration_value: 1, duration_unit: 'year' },
  { ...base, id: 104, project_code: 'R-01', name_ar: 'مشروع تاريخي مؤرشف', portfolio_priority: null, execution_year: null, work_type: null, executive_owner_code: null, duration_value: null, duration_unit: null,
    archived_at: '2026-10-06T10:26:14Z', archived_by: '00000000-0000-4000-8000-0000000000aa', archive_reason: 'Approved QA cutover',
    // Deprecated columns retained on historical rows must never surface.
    planned_year: 2027, planned_quarter: 'Q3', priority: 'high', target_end_date: '2027-09-30' },
];
const reads = { projects: 'COMPLETE', links: 'COMPLETE', requirements: 'COMPLETE', mapping: 'COMPLETE', controls: 'COMPLETE', treatments: 'COMPLETE' };
const page = (path, href, state = {}) => render(path, href, { projects, reads, ...state });
const noLegacyPlanning = (html, label) => check(!/Q[1-4]\b|الربع|2027|planned_quarter|تاريخ الانتهاء|التاريخ المستهدف/.test(html), `${label}: no quarter/date fallback`);

// Project Register
let html = page('app/roadmap/page.tsx', '/roadmap');
for (const name of ['مشروع أول', 'مشروع ثان', 'مشروع ثالث']) check(html.includes(name), `register shows active ${name}`);
check(!html.includes('مشروع تاريخي مؤرشف'), 'archived hidden by default');
for (const text of ['6 أشهر', '2 أسبوع', '1 سنة', 'إدارة المشتريات', 'Cybersecurity', 'DMO', 'تغيير تقني / تهيئة', 'السنة الأولى', 'ربط جزئي — مراجع بانتظار المراجعة', '1 من 4 مراجع مصدر']) check(html.includes(text), `register shows ${text}`);
for (const [label, value] of [['P1', '1'], ['P2', '1'], ['P3', '1'], ['مشاريع النطاق المعروض', '3']]) check(html.includes(`<span>${label}</span><strong>${value}</strong>`), `register KPI ${label}=${value}`);
for (const label of ['المحفظة', 'الأولوية', 'سنة التنفيذ', 'نوع العمل', 'الجهة المالكة', 'الحالة', 'وحدة المدة', 'اكتمال الربط']) check(html.includes(`<span>${label}</span><select`), `register filter ${label}`);
noLegacyPlanning(html, 'register');
html = page('app/roadmap/page.tsx', '/roadmap?archive=archived');
check(html.includes('مشروع تاريخي مؤرشف') && !html.includes('مشروع أول') && html.includes('المحفظة المؤرشفة') && html.includes('غير مصنّفة'), 'archived filter');
noLegacyPlanning(html, 'archived register');
check(page('app/roadmap/page.tsx', '/roadmap?archive=include').includes('مشروع تاريخي مؤرشف'), 'all-portfolio filter');
html = page('app/roadmap/page.tsx', '/roadmap?execution_year=2');
check(html.includes('مشروع ثان') && !html.includes('مشروع أول'), 'execution year filter');
html = page('app/roadmap/page.tsx', '/roadmap?owner=other&duration_unit=week&duration_min=1&duration_max=3');
check(html.includes('مشروع ثان') && !html.includes('مشروع ثالث'), 'owner + duration filters');
html = page('app/roadmap/page.tsx', '/roadmap?mapping=partially_mapped');
check(html.includes('مشروع أول') && !html.includes('مشروع ثان'), 'mapping completeness filter');
html = page('app/roadmap/page.tsx', '/roadmap', { open: true, selected: null, form: { project_code: 'X', name_ar: 'x', description_ar: '', portfolio_priority: 'P3', work_type: '', executive_owner_code: 'other', executive_owner_other: '', duration_value: '', duration_unit: '', status: 'planned', progress_percent: '0', target_outcome: '' } });
check(html.includes('<output>السنة الثالثة</output>'), 'execution year derived (read-only) in form');
check(/اسم الجهة\/المالك التنفيذي<input required=""/.test(html), 'Other owner text required when Other selected');
check(/الحالة<select disabled=""/.test(html), 'create status fixed to planned');
const codeInput = markup => markup.match(/<label>رمز المشروع<input[^>]*>/)?.[0] ?? '';
check(!/readonly=""/i.test(codeInput(html)), 'project code editable on create');
check(html.includes('<option value="other">أخرى</option>') && !html.includes('>Other<'), 'Other displayed as «أخرى»; stored value stays other');
const editForm = { project_code: 'PF43-002', name_ar: 'مشروع ثان', description_ar: '', portfolio_priority: 'P2', work_type: 'technical_change', executive_owner_code: 'other', executive_owner_other: 'إدارة المشتريات', duration_value: '2', duration_unit: 'week', status: 'in_progress', progress_percent: '0', target_outcome: '' };
html = page('app/roadmap/page.tsx', '/roadmap', { open: true, selected: projects[1], form: editForm });
check(/readonly=""/i.test(codeInput(html)) && /aria-readonly="true"/.test(codeInput(html)), 'project code read-only on edit');
check(html.includes('يُحدَّد الرمز عند الإنشاء ولا يُعدَّل لاحقًا.'), 'read-only code explained');
check(read('lib/strategy-project-fields.ts').includes('key !== "project_code"'), 'edit payload never sends project_code');

// Project Details
html = render('app/roadmap/[id]/page.tsx', '/roadmap/101?tab=overview&from=register', { project: projects[0], reads });
for (const text of ['P1 — السنة الأولى', 'السنة الأولى', '6 أشهر', 'Cybersecurity', 'مشروع تقني', 'ربط جزئي — مراجع بانتظار المراجعة', '1 من 4 مراجع مصدر مرتبطة']) check(html.includes(text), `detail shows ${text}`);
noLegacyPlanning(html, 'detail');
html = render('app/roadmap/[id]/page.tsx', '/roadmap/104', { project: projects[3], reads });
check(html.includes('مؤرشفة — Approved QA cutover') && html.includes('غير مصنّفة'), 'archived detail shows archive state, no inferred priority');
noLegacyPlanning(html, 'archived detail');

// Roadmap (dashboard) by execution year
html = page('app/roadmap/dashboard/page.tsx', '/roadmap/dashboard?focus_year=2');
for (const [year, name] of [[1, 'مشروع أول'], [2, 'مشروع ثان'], [3, 'مشروع ثالث']]) {
  const cell = html.split(`id="roadmap-year-${year}"`)[1]?.split('</section>')[0] ?? '';
  check(cell.includes(name), `roadmap year ${year} holds ${name}`);
}
check(!html.includes('مشروع تاريخي مؤرشف'), 'roadmap excludes archived');
equal((html.match(/data-reading-focus="true"/g) || []).length, 1, 'roadmap focus restored on execution year');
check(html.includes('<span>مشاريع مؤرشفة</span><strong>1</strong>'), 'roadmap reports archived count separately');
noLegacyPlanning(html, 'roadmap');

// Portfolio Analysis
html = page('app/roadmap/analysis/page.tsx', '/roadmap/analysis');
for (const label of ['الأولوية', 'سنة التنفيذ', 'نوع العمل', 'الجهة المالكة', 'الحالة']) check(html.includes(`aria-label="${label}"`), `analysis breakdown by ${label}`);
check(html.includes('<td>أخرى</td><td>1</td>') && html.includes('<td>قيد التنفيذ</td><td>1</td>') && html.includes('3 مشاريع — المحفظة النشطة'), 'analysis counts active portfolio only');
check(html.includes('<span>مشاريع الأولوية P1</span><strong>1</strong>'), 'analysis P1 KPI');
noLegacyPlanning(html, 'analysis');

// Executive view
html = page('app/roadmap/executive/page.tsx', '/roadmap/executive');
for (const text of ['السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'مشاريع الأولوية P1']) check(html.includes(text), `executive shows ${text}`);
check(html.includes('<span>المشاريع السيبرانية</span><strong>3</strong>') && !html.includes('مشروع تاريخي مؤرشف'), 'executive covers active portfolio');
noLegacyPlanning(html, 'executive');

// Static guarantees
const roadmapFiles = ['app/roadmap/page.tsx', 'app/roadmap/[id]/page.tsx', 'app/roadmap/dashboard/page.tsx', 'app/roadmap/analysis/page.tsx', 'app/roadmap/executive/page.tsx', 'app/roadmap/portfolio-metrics.ts', 'app/roadmap/planning-information.tsx', 'lib/strategy-project-fields.ts', 'lib/strategy-navigation.ts', 'lib/portfolio-analytics.ts'];
for (const path of roadmapFiles) {
  const text = read(path);
  for (const removed of ['planned_quarter', 'planned_year', 'planned_start_date', 'target_end_date', 'forecast_end_date', 'actual_start_date', 'actual_end_date', 'focus_quarter', 'الربع', 'portfolio-model', 'portfolio_import_rows', 'portfolio_control_mapping_reviews']) check(!text.includes(removed), `${path}: no ${removed}`);
}
const applied = {
  '20261006095402_portfolio_phase1_foundation.sql': '7c633c8d73abf01499b9d2c1d9520f3a1b0c0d35b11176d2ffe54342bd92f933',
  '20261006095409_portfolio_import_staging_review.sql': '93a0f43b2730678f2f8e01542223fba15b9d4ffee2369ba81d7d6936d7c5e298',
  '20261006102306_portfolio_phase2b_qa_cutover_guards.sql': 'a1e8ea0beff3d8aeceacdeb1c454c8d9015ca27a62429396a01268377bfa2542',
};
for (const [file, sha] of Object.entries(applied)) equal(createHash('sha256').update(readFileSync(new URL(`supabase/migrations/${file}`, root))).digest('hex'), sha, `${file} byte-identical to QA-applied version`);
const migrations = readdirSync(new URL('supabase/migrations/', root));
check(!migrations.some(name => name.startsWith('20261007090000')), 'superseded 20261007090000 migration excluded');
// Only the approved, not-yet-applied identity/audit hardening follows the QA-applied head.
equal(migrations.filter(name => name.slice(0, 14) > '20261006102306'), ['20261007185235_portfolio_identity_audit_hardening.sql'], 'only the approved corrective migration after the QA-applied head');
const hardening = read('supabase/migrations/20261007185235_portfolio_identity_audit_hardening.sql').replace(/--.*$/gm, '');
for (const forbidden of [/\binsert\s+into\s+public\./i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\bdrop\s+/i, /\bgrant\s+/i, /alter\s+table/i, /disable\s+row\s+level/i]) check(!forbidden.test(hardening), `hardening migration has no ${forbidden}`);
for (const required of ['new.created_by := auth.uid()', 'new.archived_by := auth.uid()', 'as restrictive for select', "'portfolio_mapping_reviews'"]) check(hardening.includes(required), `hardening migration includes ${required}`);
console.log(`Portfolio QA integration: ${checks} assertions PASS (offline, synthetic fixtures)`);

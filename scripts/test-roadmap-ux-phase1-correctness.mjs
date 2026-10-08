// Roadmap UX Phase 1 correctness (D1 executive scope, D2 control relationships).
// Offline, synthetic fixtures shaped like the Production case; no network or data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const load = async path => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };

// ---------------------------------------------------------------- D1
const { scopedHighTreatments, highTreatmentProjectsWithoutDirectLinks } = await load('lib/portfolio-treatments.ts');
const projects = [
  { id: 1, archived_at: null }, { id: 2, archived_at: null }, { id: 3, archived_at: null },
  { id: 90, archived_at: '2026-10-08T06:00:00Z' }, { id: 91, archived_at: '2026-10-08T06:00:00Z' },
];
const active = projects.filter(p => !p.archived_at);
// Production shape: every high treatment sits on an archived project.
const archivedOnly = [{ project_id: 90, priority: 'high' }, { project_id: 90, priority: 'medium' }, { project_id: 91, priority: 'low' }];
equal(scopedHighTreatments(archivedOnly, active).length, 0, 'analysis: archived high treatments excluded from active scope');
equal(highTreatmentProjectsWithoutDirectLinks(archivedOnly, [], active).size, 0, 'executive: archived project raises no active-portfolio alert');
equal(highTreatmentProjectsWithoutDirectLinks(archivedOnly, [], projects).size, 1, 'the same rule over the full portfolio still sees the archived project');
// Mixed case: active and archived high treatments, some projects directly linked.
const mixed = [...archivedOnly, { project_id: 1, priority: 'high' }, { project_id: 1, priority: 'high' }, { project_id: 2, priority: 'high' }, { project_id: 3, priority: 'low' }];
const links = [{ project_id: 2, control_id: 7 }, { project_id: 90, control_id: 8 }];
const analysisCount = scopedHighTreatments(mixed, active).length;
const executiveProjects = highTreatmentProjectsWithoutDirectLinks(mixed, links, active);
equal(analysisCount, 3, 'analysis counts high treatments of active projects only');
equal([...executiveProjects], [1], 'executive alert: active project with high treatment and no direct link');
// Same scope -> same underlying high-treatment set on both pages.
equal(new Set(scopedHighTreatments(mixed, active).map(t => t.project_id)), new Set([1, 2]), 'both pages derive from the same scoped high-treatment list');
check([...executiveProjects].every(id => active.some(p => p.id === id)), 'executive alerts reference active projects only');
const executive = read('app/roadmap/executive/page.tsx');
const analysis = read('app/roadmap/analysis/page.tsx');
check(executive.includes('highTreatmentProjectsWithoutDirectLinks(treatments, links, active)'), 'executive alert uses the active scope');
check(!/treatments\s*\n?\s*\.filter\(\(item\) => item\.priority === "high"/.test(executive), 'executive no longer filters unscoped treatments');
check(analysis.includes('scopedHighTreatments(treatments, scoped).length'), 'analysis uses the shared scoped helper');

// ---------------------------------------------------------------- D2
const { controlProjectRelationships } = await load('lib/control-project-relationships.ts');
const req = (id, code, title, coverage = 'full', confidence = 'confirmed') => ({ requirement_id: id, coverage_type: coverage, mapping_confidence: confidence, cybersecurity_requirements: { requirement_code: code, title_ar: title } });
const project = (code, name, archived) => ({ project_code: code, name_ar: name, archived_at: archived ? '2026-10-08T06:00:00Z' : null });
// Control 238 on Production: two archived projects via requirements, PF43-009 active via a direct link.
const c238 = controlProjectRelationships(
  [req(11, 'REQ-MDM-UEM', 'MDM/UEM — إدارة الأجهزة المحمولة'), req(12, 'REQ-DLP', 'DLP — منع تسرب البيانات')],
  [{ requirement_id: 11, project_id: 5, cybersecurity_projects: [project('MDM-01', 'Mobile Device & Endpoint Management (MDM/UEM)', true)] },
   { requirement_id: 12, project_id: 6, cybersecurity_projects: project('DPS-01', 'Data Protection Suite (DLP / Masking / DRM)', true) }],
  [{ project_id: 94, cybersecurity_projects: project('PF43-009', 'DLP — منع تسرب البيانات', false) }],
);
equal(c238.projects.map(r => r.project_code), ['PF43-009', 'DPS-01', 'MDM-01'], 'control 238: PF43-009 shown, active first, then archived history');
equal(c238.projects[0], { project_id: 94, project_code: 'PF43-009', name_ar: 'DLP — منع تسرب البيانات', archived: false, sources: ['direct'], requirements: [] }, 'PF43-009 is a direct, active relationship');
equal(c238.projects.slice(1).map(r => [r.archived, r.sources]), [[true, ['requirement']], [true, ['requirement']]], 'archived projects flagged and labelled as requirement-derived');
equal(c238.projects[1].requirements.map(r => [r.requirement_code, r.coverage_type, r.mapping_confidence]), [['REQ-DLP', 'full', 'confirmed']], 'requirement coverage and confidence kept per requirement');
equal(c238.requirementsWithoutProject, [], 'every requirement has a visible project');

// Deduplication: a project reached through two requirements and a direct link is one row with both sources.
const dup = controlProjectRelationships(
  [req(1, 'R1', 'أول'), req(2, 'R2', 'ثان', 'partial', 'probable'), req(3, 'R3', 'بلا مشروع')],
  [{ requirement_id: 1, project_id: 7, cybersecurity_projects: project('B-1', 'مشترك', false) },
   { requirement_id: 2, project_id: 7, cybersecurity_projects: project('B-1', 'مشترك', false) },
   { requirement_id: 1, project_id: 7, cybersecurity_projects: project('B-1', 'مشترك', false) },
   { requirement_id: 2, project_id: 8, cybersecurity_projects: null }],
  [{ project_id: 7, cybersecurity_projects: project('B-1', 'مشترك', false) }, { project_id: 7, cybersecurity_projects: project('B-1', 'مشترك', false) },
   { project_id: 9, cybersecurity_projects: project('A-9', 'مؤرشف مباشر', true) }, { project_id: 10, cybersecurity_projects: project('Z-1', 'نشط مباشر', false) }],
);
equal(dup.projects.map(r => r.project_code), ['B-1', 'Z-1', 'A-9'], 'one row per project; active (by code) before archived');
equal(dup.projects[0].sources, ['direct', 'requirement'], 'both sources kept, without duplicates');
equal(dup.projects[0].requirements.map(r => r.requirement_code), ['R1', 'R2'], 'each requirement listed once per project');
equal(dup.projects.find(r => r.project_code === 'A-9').archived, true, 'archived direct link keeps its archived flag');
check(!dup.projects.some(r => r.project_id === 8), 'project hidden by RLS (no joined row) is not shown');
equal(dup.requirementsWithoutProject.map(r => r.requirement_id), [3], 'requirement without a visible project is still reported');

// Page wiring: both sources read, archived badge and source labels rendered.
const control = read('app/controls/[id]/page.tsx');
check(control.includes(".from('cybersecurity_project_controls').select('project_id,cybersecurity_projects(project_code,name_ar,archived_at)').eq('control_id',controlId)"), 'direct links read for this control');
check(control.includes("cybersecurity_projects(project_code,name_ar,archived_at)').in('requirement_id',requirementIds)"), 'requirement-derived projects carry archived_at');
check(control.includes('controlProjectRelationships(requirementLinks,projectLinks,directLinks)'), 'page renders the merged relationships');
check(control.includes('<span className="req-proj-badge archived">مؤرشف</span>'), 'archived badge rendered');
check(control.includes("const sourceText:Record<string,string>={requirement:'متطلب',direct:'مباشر'}"), 'source labels متطلب / مباشر');
check(!control.includes('projectLinks.find('), 'never collapses to the first project');

console.log(`Roadmap UX Phase 1 correctness (D1/D2): ${checks} assertions PASS (offline, synthetic fixtures)`);

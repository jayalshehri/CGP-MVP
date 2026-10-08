// S1-A presentation-only contract; no network, credentials, or database access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Production portfolio release: business contracts are compared with origin/main,
// the release base (the QA integration branch compares with the IA-3 checkpoint 55a261c).
const base = '8aa8b93c59ceb61af3d216fce41d933c9e4202c5';
const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const before = path => execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' });
const parse = (path, text) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const includes = (path, text) => equal(read(path).includes(text), true, `${path}: ${text}`);
const paths = [
  'components/AppShell.tsx', 'components/GrcAuditTrail.tsx',
  'app/roadmap/page.tsx', 'app/roadmap/analysis/page.tsx',
  'app/roadmap/dashboard/page.tsx', 'app/roadmap/executive/page.tsx',
  'app/roadmap/[id]/page.tsx', 'app/roadmap/portfolio-metrics.ts',
];

// Normalize presentation leaves when comparing the certified business contracts.
// S1-B owns URL state; S1-C owns read availability/paging. Keep mutation/auth,
// input and pure formula invariants here; executable reads are tested by S1-C.
function logic(path, text) {
  const result = ts.transform(parse(path, text), [context => {
    const visit = node => {
      // S1-D adds exactly two optional form defaults. Their write isolation is
      // tested by test-strategy-s1-d-data-quality; retain all older defaults.
      if (path === 'app/roadmap/page.tsx' && text.startsWith('emptyForm:') && ts.isObjectLiteralExpression(node)) return ts.factory.updateObjectLiteralExpression(node,
        node.properties.filter(property => !['forecast_end_date', 'target_outcome'].includes(property.name?.getText()))
          .map(property => ts.visitNode(property, visit)));
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return ts.factory.createNull();
      if (ts.isStringLiteral(node) && /[\u0600-\u06ff]/u.test(node.text)) return ts.factory.createStringLiteral('PRESENTATION');
      if (ts.isTemplateHead(node)) return ts.factory.createTemplateHead(node.text.replace(/[\u0600-\u06ff].*/us, 'PRESENTATION'));
      if (ts.isTemplateTail(node)) return ts.factory.createTemplateTail(node.text.replace(/[\u0600-\u06ff].*/us, 'PRESENTATION'));
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  }]);
  const output = ts.createPrinter({ removeComments: true }).printFile(result.transformed[0]);
  result.dispose();
  return output;
}
function businessContracts(path, text) {
  const found = [];
  const visit = node => {
    if (ts.isCallExpression(node) && (
      node.expression.getText() === 'requireProfile' ||
      (node.expression.getText().startsWith('supabase.') && /\.(insert|update|delete)\(/.test(node.getText()))
    )) found.push(logic(path, node.getText()));
    // Portfolio Phase 1 replaced the register form model (emptyForm); its
    // contract is certified by test-portfolio-phase1-model instead.
    // The executive per-year `items` grouping moved from planned_year to execution year in Phase 1.
    if (ts.isVariableDeclaration(node) && ['canManage', 'permittedItems', 'items', 'form', 'roleLabels'].includes(node.name.getText())
      && !(path === 'app/roadmap/executive/page.tsx' && node.name.getText() === 'items')) {
      found.push(logic(path, node.getText()));
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found;
}
for (const path of paths) {
  equal(businessContracts(path, read(path)), businessContracts(path, before(path)), `${path}: auth/commands unchanged (read states covered by S1-C)`);
}
// Portfolio Phase 1 deliberately replaced the date/quarter planning formulas;
// the new elements are executed below. S2-B relationship rollups are tested separately.

function attributes(path, text, name) {
  const found = [];
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText() === name && ['input', 'select', 'textarea', 'form'].includes(node.parent.parent.tagName?.getText())) {
      // Only the two explicitly approved S1-D input bindings are additive.
      // Portfolio Phase 1 replaces the register/roadmap/analysis form and filter
      // controls; those are certified by test-portfolio-phase1-model.
      const binding = node.parent.getText();
      const phase1 = /form\.(forecast_end_date|target_outcome|planned_|target_end_date|actual_|priority|initiative_type|executive_owner|portfolio_priority|work_type|duration_)|Filter\b|filters|setFilters|archiveQueryValue|updateStrategyQuery\("(priority|status)"|^value=\{value\}$|=> onChange\(event|updateStrategyQuery\((key|"q"|"duration_(min|max)"),|setScope\(/.test(binding)
        || (/value=\{(yearFilter|statusFilter|priorityFilter)\}/.test(binding));
      if (!phase1) found.push(node.initializer?.getText());
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found.sort();
}
for (const path of paths) {
  // The register form/filter controls are now the canonical QA portfolio form
  // (components/PortfolioProjectFields.tsx), certified by
  // test-portfolio-qa-integration and the QA portfolio tests.
  if (path === 'app/roadmap/page.tsx') continue;
  // Exact project hrefs/context are certified by test-strategy-s1-b-navigation.
  for (const name of ['value', 'disabled', 'onClick', 'onChange', 'onSubmit', 'dir']) {
    equal(attributes(path, read(path), name), attributes(path, before(path), name), `${path}: form ${name} contracts unchanged`);
  }
}

const registry = 'app/roadmap/page.tsx';
const analysis = 'app/roadmap/analysis/page.tsx';
const dashboard = 'app/roadmap/dashboard/page.tsx';
const executive = 'app/roadmap/executive/page.tsx';
const detail = 'app/roadmap/[id]/page.tsx';
for (const [route, label] of [
  ['/roadmap/analysis', 'تحليل المحفظة السيبرانية'],
  ['/roadmap/dashboard', 'خارطة طريق المشاريع'],
  ['/roadmap', 'سجل المشاريع السيبرانية'],
]) {
  // Labels only: the release keeps main's navigation groups (the IA-1 regrouping is not shipped).
  includes('components/AppShell.tsx', `{ href: "${route}", label: "${label}", group: "العمليات", subgroup: "إدارة خارطة الطريق", team: true }`);
  // UX-2: the view tabs are one shared component (app/roadmap/portfolio-ui.tsx).
  includes('app/roadmap/portfolio-ui.tsx', `{ href: "${route}", label: "${label}" }`);
  for (const path of [registry, analysis, dashboard]) equal(read(path).includes(`href="${route}">${label}</Link>`) || read(path).includes('<RoadmapTabs active="'), true, `${path}: view tab ${label}`);
}
const pageTitle = (path, title) => equal(read(path).includes(`<h1>${title}</h1>`) || read(path).includes(`<PageHeader title="${title}"`), true, `${path}: title ${title}`);
pageTitle(registry, 'سجل المشاريع السيبرانية');
pageTitle(analysis, 'تحليل المحفظة السيبرانية');
pageTitle(dashboard, 'خارطة طريق المشاريع');
includes(executive, '<h1>ملخص محفظة المشاريع السيبرانية</h1>');
includes(registry, '"مشروع سيبراني جديد"');
includes('components/PortfolioProjectFields.tsx', '<label>نوع العمل<select value={form.work_type}');
includes(registry, '<PortfolioProjectFields form={form}');
includes('components/GrcAuditTrail.tsx', "initiative_type:'نوع العمل'");
includes(dashboard, 'توزيع المشاريع حسب سنة التنفيذ');
includes(executive, 'label="متوسط تقدم المشاريع المسجّل"');
includes(executive, 'label="المشاريع السيبرانية"');
includes(executive, 'label="فئات التنبيه الإداري"');
// UX-2: roadmap keeps planning facts only; average progress and zero requirement counts are not shown.
equal(read(dashboard).includes('متوسط تقدم المشاريع المسجّل'), false, 'roadmap: no average-progress KPI');
includes(dashboard, '...(!linksReady || data.controls > 0 ? [{ label: "ضوابط بربط مباشر", value: linksReady ? data.controls : unavailable }] : [])');
includes(dashboard, '...(modern && modern.controls > 0 ? [{ label: "ضوابط عبر المتطلبات", value: modern.controls }] : [])');
// UX-2: analysis has four management KPIs; the five-element completeness KPI moved to the register filter.
for (const label of ['المشاريع', 'مشاريع P1', 'الحمل التخطيطي — السنة الأولى', 'بنود تحتاج انتباه الإدارة']) includes(analysis, `<KpiCard label="${label}"`);
equal((read(analysis).match(/<KpiCard /g) ?? []).length, 4, 'analysis: at most four KPIs');
equal(read(analysis).includes('اكتمال عناصر التخطيط الخمسة'), false, 'analysis: data-completeness KPI removed');
// UX-2 register: one summary strip; requirement-derived counts only when non-zero.
includes(registry, '{ label: "ضوابط بربط مباشر", value: summary.direct ?? unavailable }');
includes(registry, '...(mappingReady && summary.requirements > 0 ? [{ label: "متطلبات مرتبطة", value: summary.requirements }] : [])');
includes(detail, '<span>نسبة الضوابط المرتبطة التي حالتها متحققة</span>');
includes(detail, '<span>ضوابط بأدلة مقبولة ولم تُتحقق</span>');
includes(detail, 'الأدلة المقبولة وحدها لا تثبت أهلية أمر التحقق.');
includes(registry, '<small className="rm-sub rm-nowrap" title="علاقات عبر المتطلبات">متطلبات <bdi>{viaRequirements.requirements}</bdi> · ضوابط <bdi>{viaRequirements.controls}</bdi></small>');
includes(analysis, '{modern && modern.controls > 0 && <p className="rm-note">عبر المتطلبات:');
includes(executive, 'دون دمج علاقات المتطلبات');
includes(dashboard, '"الضوابط ذات الربط المباشر المسجّل"');
equal(read(analysis).includes('className="portfolio-score"'), false, 'duplicate circular score removed');
// UX-2: the per-project missing-outcome list and the "not available" prioritisation note carry no decision value.
equal(read(analysis).includes('analysis.incomplete'), false, 'analysis: 43-row missing-data list removed (moved to register filter)');
equal(read(analysis).includes('دعم تحديد الأولويات'), false, 'analysis: unavailable prioritisation placeholder removed');
for (const removed of ['Portfolio Prioritization', 'Must Do', 'Quick Wins', 'Defer', 'Strategic Alignment', 'Risk Reduction', 'Compliance Criticality', 'Effort / Complexity', 'decision-data-grid', 'portfolio-decision-readiness']) {
  equal(read(analysis).includes(removed), false, `unapproved future framework removed: ${removed}`);
}
for (const path of [registry, analysis, dashboard, executive, detail]) {
  for (const obsolete of ['مساهمة الامتثال', 'نسبة المساهمة', 'المبادرات الاستراتيجية', 'التسلسل الربعي للمبادرات', 'الأولوية والقيمة والمخاطر', 'ضوابط مرتبطة بمشروع معالجة', 'جاهزة للتحقق']) {
    equal(read(path).includes(obsolete), false, `${path}: no misleading ${obsolete}`);
  }
}

// Execute the existing formulas with discriminating local fixtures, never QA data.
const js = ts.transpileModule(read('app/roadmap/portfolio-metrics.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const metrics = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const blank = { id: 1, status: 'planned', progress_percent: 0, portfolio_priority: null, executive_owner_code: null, duration_value: null, duration_unit: null, target_outcome: null, recommended_technologies: null };
equal(metrics.planningReadiness(blank, 0), 0, 'empty planning baseline');
equal(metrics.planningReadiness({ ...blank, executive_owner_code: 'it' }, 0), 20, 'five equal-weight elements');
equal(metrics.planningReadiness({ ...blank, duration_value: 6, duration_unit: 'quarter' }, 0), 0, 'unknown duration unit not counted');
equal(metrics.planningReadiness({ ...blank, portfolio_priority: 'P1', executive_owner_code: 'dmo', duration_value: 6, duration_unit: 'month', target_outcome: 'Outcome' }, 1), 100, 'all five planning elements');
equal(metrics.planningReadinessItems(blank, 0).length, 5, 'unchanged planning denominator');
equal(metrics.averageProgress([{ progress_percent: 10 }, { progress_percent: 90 }, { progress_percent: 20 }]), 40, 'unweighted manual progress');
equal(['isDelayed', 'scheduleMetric', 'formatDateAr'].filter(name => name in metrics), [], 'date/quarter schedule logic removed from portfolio metrics');
const link = { requirement_id: 1, control_id: 10, coverage_type: 'full', mapping_confidence: 'confirmed', evidence_status: 'accepted', verification_status: 'verified' };
const result = metrics.requirementRollup([{ requirement_id: 1, coverage_type: 'full' }], [link, { ...link, requirement_id: 2 }, { ...link, control_id: 20, verification_status: 'not_verified' }]);
equal(result.linkedControlsCount, 2, 'distinct linked controls');
equal(result.verified, 1, 'existing verification state only');
equal(result.complianceContributionPercent, 50, 'verified / distinct linked controls, not causality');
equal(result.readyForVerification, 1, 'accepted evidence + not verified only, not RPC eligibility');
equal(metrics.requirementRollup([], []).complianceContributionPercent, null, 'unchanged empty denominator');
console.log(`S1-A terminology and RC2 invariants: ${checks} assertions PASS`);

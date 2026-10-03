// S1-A presentation-only contract; no network, credentials, or database access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const base = '55a261c7b13854e32a53eacdb4e98b2e75d5c41a';
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
// S1-B intentionally changes URL state/hrefs, not queries, commands or formulas.
function logic(path, text) {
  const result = ts.transform(parse(path, text), [context => {
    const visit = node => {
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
      node.expression.getText() === 'useMemo' ||
      node.expression.getText() === 'requireProfile' ||
      node.expression.getText().startsWith('supabase.')
    )) found.push(logic(path, node.getText()));
    if (ts.isVariableDeclaration(node) && ['canManage', 'permittedItems', 'items', 'form', 'emptyForm', 'roleLabels'].includes(node.name.getText())) {
      found.push(logic(path, node.getText()));
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found;
}
for (const path of paths) {
  equal(businessContracts(path, read(path)), businessContracts(path, before(path)), `${path}: queries/auth/commands/calculations unchanged`);
}
equal(logic('app/roadmap/portfolio-metrics.ts', read('app/roadmap/portfolio-metrics.ts')), logic('app/roadmap/portfolio-metrics.ts', before('app/roadmap/portfolio-metrics.ts')), 'all metric formulas unchanged');

function attributes(path, text, name) {
  const found = [];
  const visit = node => {
    if (ts.isJsxAttribute(node) && node.name.getText() === name) found.push(node.initializer?.getText());
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found;
}
for (const path of paths) {
  // Exact project hrefs/context are certified by test-strategy-s1-b-navigation.
  for (const name of ['value', 'disabled', 'onClick', 'onChange', 'onSubmit', 'dir']) {
    equal(attributes(path, read(path), name), attributes(path, before(path), name), `${path}: ${name} contracts unchanged`);
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
  includes('components/AppShell.tsx', `{ href: "${route}", label: "${label}", group: "الاستراتيجية والتنفيذ", team: true }`);
  for (const path of [registry, analysis, dashboard]) includes(path, `href="${route}">${label}</Link>`);
}
includes(registry, '<h1>سجل المشاريع السيبرانية</h1>');
includes(analysis, '<h1>تحليل المحفظة السيبرانية</h1>');
includes(dashboard, '<h1>خارطة طريق المشاريع</h1>');
includes(executive, '<h1>ملخص محفظة المشاريع السيبرانية</h1>');
includes(registry, '"مشروع سيبراني جديد"');
includes(registry, '<label>نوع العمل<select value={form.initiative_type}');
includes('components/GrcAuditTrail.tsx', "initiative_type:'نوع العمل'");
includes(dashboard, 'توزيع المشاريع حسب السنة والربع');
for (const path of [dashboard, executive]) includes(path, 'label="متوسط تقدم المشاريع المسجّل" value={`${data.average}%`}');
includes(executive, 'label="المشاريع السيبرانية" value={projects.length}');
includes(executive, 'label="فئات التنبيه الإداري" value={data.attention.length}');
includes(analysis, 'label="اكتمال عناصر التخطيط الخمسة الحالية" value={`${analysis.readiness}%`}');
includes(analysis, 'label="ضوابط ذات ربط مباشر مسجّل" value={analysis.linkedControls}');
includes(dashboard, 'label="ضوابط ذات ربط مباشر مسجّل" value={data.controls}');
includes(registry, 'label="ضوابط ذات ربط مباشر مسجّل" value={stats.linked}');
includes(registry, 'label="ضوابط مرتبطة عبر المتطلبات وحالتها متحققة" value={requirementStats.verified}');
includes(detail, '<span>نسبة الضوابط المرتبطة التي حالتها متحققة</span>');
includes(detail, '<span>ضوابط بأدلة مقبولة ولم تُتحقق</span>');
includes(detail, 'الأدلة المقبولة وحدها لا تثبت أهلية أمر التحقق.');
includes(registry, 'المصدران منفصلان');
includes(analysis, 'لا يدخل الربط عبر المتطلبات في هذا المؤشر.');
includes(executive, 'دون دمج علاقات المتطلبات');
includes(dashboard, '"الضوابط ذات الربط المباشر المسجّل"');
equal(read(analysis).includes('className="portfolio-score"'), false, 'duplicate circular score removed');
equal((read(analysis).match(/analysis\.readiness/g) ?? []).length, 1, 'aggregate completeness displayed once');
includes(analysis, 'missing.map((item) => item.label).join(" · ")');
includes(analysis, '<em>{readiness}%</em>');
includes(analysis, 'analysis.incomplete.map');
includes(analysis, '<aside className="portfolio-prioritization-note" aria-labelledby="prioritization-note-title">');
includes(analysis, '<h2 id="prioritization-note-title">دعم تحديد الأولويات</h2><span>غير متاح حاليًا</span>');
includes(analysis, 'تتوفر حاليًا بيانات الحالة والأولوية الإدارية والتقدم وبعض روابط الامتثال. يتطلب دعم تحديد الأولويات مستقبلًا بيانات معتمدة إضافية قبل تقديم توصيات أو تصنيف تحليلي للمشاريع.');
for (const removed of ['Portfolio Prioritization', 'Must Do', 'Quick Wins', 'Defer', 'Strategic Alignment', 'Risk Reduction', 'Compliance Criticality', 'Effort / Complexity', 'decision-data-grid', 'portfolio-decision-readiness']) {
  equal(read(analysis).includes(removed), false, `unapproved future framework removed: ${removed}`);
}
const note = read(analysis).match(/<aside className="portfolio-prioritization-note"[\s\S]*?<\/aside>/)?.[0];
assert.ok(note);
equal(/<button|<Link|<input|\{/.test(note), false, 'informational callout only: no action, calculation or recommendation');
includes('app/roadmap/roadmap.css', '.portfolio-prioritization-note>header{display:flex;flex-wrap:wrap;');
for (const path of [registry, analysis, dashboard, executive, detail]) {
  for (const obsolete of ['مساهمة الامتثال', 'نسبة المساهمة', 'المبادرات الاستراتيجية', 'التسلسل الربعي للمبادرات', 'الأولوية والقيمة والمخاطر', 'ضوابط مرتبطة بمشروع معالجة', 'جاهزة للتحقق']) {
    equal(read(path).includes(obsolete), false, `${path}: no misleading ${obsolete}`);
  }
}

// Execute the existing formulas with discriminating local fixtures, never QA data.
const js = ts.transpileModule(read('app/roadmap/portfolio-metrics.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const metrics = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const blank = { id: 1, status: 'planned', progress_percent: 0, executive_owner: null, target_outcome: null, target_end_date: null, recommended_technologies: null };
equal(metrics.planningReadiness(blank, 0), 0, 'empty planning baseline');
equal(metrics.planningReadiness({ ...blank, executive_owner: 'Owner' }, 0), 20, 'five equal-weight elements');
equal(metrics.planningReadiness({ ...blank, executive_owner: 'Owner', target_outcome: 'Outcome', target_end_date: '2027-01-01', recommended_technologies: 'Technology' }, 1), 100, 'all five planning elements');
equal(metrics.planningReadinessItems(blank, 0).length, 5, 'unchanged planning denominator');
equal(metrics.averageProgress([{ progress_percent: 10 }, { progress_percent: 90 }, { progress_percent: 20 }]), 40, 'unweighted manual progress');
equal(metrics.isDelayed({ status: 'planned', target_end_date: '2027-01-01' }, '2027-01-02'), true, 'overdue semantics');
equal(metrics.isDelayed({ status: 'completed', target_end_date: '2027-01-01' }, '2027-01-02'), false, 'completed not overdue');
const link = { requirement_id: 1, control_id: 10, coverage_type: 'full', mapping_confidence: 'confirmed', evidence_status: 'accepted', verification_status: 'verified' };
const result = metrics.requirementRollup([{ requirement_id: 1, coverage_type: 'full' }], [link, { ...link, requirement_id: 2 }, { ...link, control_id: 20, verification_status: 'not_verified' }]);
equal(result.linkedControlsCount, 2, 'distinct linked controls');
equal(result.verified, 1, 'existing verification state only');
equal(result.complianceContributionPercent, 50, 'verified / distinct linked controls, not causality');
equal(result.readyForVerification, 1, 'accepted evidence + not verified only, not RPC eligibility');
equal(metrics.requirementRollup([], []).complianceContributionPercent, null, 'unchanged empty denominator');
console.log(`S1-A terminology and RC2 invariants: ${checks} assertions PASS`);

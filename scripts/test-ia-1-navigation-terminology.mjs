// IA-1 presentation contract against the certified RC1 source. No live services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const base = '28f7f6055bf1fc80d3ea3510fc023dc09914cdb9';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const baseline = path => execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', cwd: new URL('..', import.meta.url) });
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function parsed(path, content) { return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS); }
function namedVariable(path, content, name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) result = node.initializer?.getText();
    ts.forEachChild(node, visit);
  }
  visit(parsed(path, content));
  assert.ok(result, `missing ${name} in ${path}`);
  return result;
}
function namedFunction(path, content, name) {
  const file = parsed(path, content);
  const result = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(result, `missing ${name} in ${path}`);
  return result.getText();
}
function navigation(content) {
  const raw = namedVariable('components/AppShell.tsx', content, 'navigation');
  const file = parsed('navigation.ts', `const navigation = ${raw};`);
  const initializer = file.statements[0].declarationList.declarations[0].initializer;
  return initializer.elements.map(element => Object.fromEntries(element.properties.map(property => [property.name.text, ts.isStringLiteral(property.initializer) ? property.initializer.text : property.initializer.kind === ts.SyntaxKind.TrueKeyword])));
}

const shell = source('components/AppShell.tsx');
const oldShell = baseline('components/AppShell.tsx');
const currentNav = navigation(shell), oldNav = navigation(oldShell);
const expectedLabels = new Map([
  ['/compliance', 'مركز الامتثال'], ['/my-controls', 'ضوابطي'],
  ['/evidence', 'مستودع الأدلة'], ['/findings', 'الملاحظات والإجراءات التصحيحية'],
  ['/review', 'مركز المراجعة والقرار'], ['/mappings', 'مواءمة الضوابط'],
  ['/audit-schedule', 'المراجعات الدورية للضوابط'], ['/tasks', 'متابعة الضوابط'],
  ['/audit', 'سجل النشاط والتغييرات'],
]);
check(currentNav.map(item => item.href), oldNav.map(item => item.href).filter(href => href !== '/audit-schedule').flatMap(href => href === '/mappings' ? [href, '/audit-schedule'] : [href]), 'all route contracts preserved; only audit-schedule visual order changes');
for (const [href, label] of expectedLabels) check(currentNav.find(item => item.href === href)?.label, label, `${href} label`);
check(currentNav.find(item => item.href === '/audit-schedule')?.group, 'الامتثال', 'periodic reviews grouped with compliance');
check(currentNav.some(item => item.group === 'المراجعة والتدقيق'), false, 'empty audit group removed');
for (const role of ['admin', 'cybersecurity_team', 'control_owner', 'nca_external_auditor']) {
  const visible = item => role === 'nca_external_auditor' ? !!item.auditor : (!item.admin || role === 'admin') && (!item.team || role === 'admin' || role === 'cybersecurity_team') && (!item.data || role === 'admin') && (!item.personal || role === 'control_owner') && (!item.ownerHidden || role !== 'control_owner') && !item.sidebarHidden;
  check(currentNav.filter(visible).map(item => item.href).sort(), oldNav.filter(visible).map(item => item.href).sort(), `${role} sidebar access unchanged`);
}
check(currentNav.find(item => item.href === '/review')?.team, true, 'owner cannot receive Review Center through rename');
check(namedFunction('components/AppShell.tsx', shell, 'ContextBreadcrumb'), namedFunction('components/AppShell.tsx', oldShell, 'ContextBreadcrumb'), 'breadcrumb/deep-link mechanics unchanged');
check(shell.includes('cybersecurity_team: "فريق الأمن السيبراني"'), true, 'role display label');
check(shell.includes('مدير الامتثال والمراجعة'), false, 'old role display absent');

const tasks = source('app/tasks/page.tsx');
check(tasks.includes('title="متابعة الضوابط"'), true, 'tasks title');
check(tasks.includes('role==="control_owner"?"الضوابط المسندة إليك":"الضوابط ضمن نطاقك"'), true, 'tasks role-aware descriptions');
check(tasks.includes('title="مهامي"'), false, 'old tasks title absent');
for (const text of ['title="مستودع الأدلة"', 'title={frameworkCode?`الملاحظات والإجراءات التصحيحية —', 'title="مواءمة الضوابط"']) {
  const path = text.includes('مستودع') ? 'app/evidence/page.tsx' : text.includes('التصحيحية') ? 'app/findings/page.tsx' : 'app/mappings/page.tsx';
  check(source(path).includes(text), true, `${path} heading`);
}
check(source('components/ReviewWorkQueue.tsx').includes("'مركز المراجعة والقرار'"), true, 'Review Center heading');
check(source('app/page.tsx').includes('<span>نسبة التطبيق</span>'), true, 'dashboard implementation KPI label');
check(source('app/reports/page.tsx').includes('label="مؤشر التطبيق والتحقق"'), true, 'report combined KPI label');
check(source('components/AssessmentPortfolio.tsx').includes('<th>اكتمال التقييم</th>'), true, 'assessment completion label');
check(source('app/compliance/[code]/page.tsx').includes('نتيجة التقييم المعتمدة'), true, 'approved assessment result remains separately named');

for (const [path, expression] of [
  ['app/page.tsx', 'dashboard'],
  ['app/reports/page.tsx', 'stats'],
  ['app/reports/page.tsx', 'frameworkOverview'],
]) check(namedVariable(path, source(path), expression), namedVariable(path, baseline(path), expression), `${path} ${expression} KPI data/formula unchanged`);

console.log(`IA-1 navigation/terminology: ${checks} assertions PASS`);

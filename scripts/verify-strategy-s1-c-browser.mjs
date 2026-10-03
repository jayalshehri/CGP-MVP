// Run against a LOCAL production build only. All service requests are intercepted.
// Usage: CGP_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/verify-strategy-s1-b-browser.mjs
// Start with placeholder public config; no .env or real session is required.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.CGP_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.CGP_LOCAL_URL || 'http://127.0.0.1:3198';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'local-only browser test');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'local-fixture@example.test', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const project = { id: 37, project_code: 'CODE-NOT-ID', name_ar: 'مشروع التنقل المحلي', status: 'planned', priority: 'high', initiative_type: 'technology_project', progress_percent: 15, planned_year: 2027, planned_quarter: 'Q1', target_end_date: null, executive_owner: null };
// Reproduce the live failure: one short quarter stretched by a very tall neighbour.
const crowdedQuarter = Array.from({ length: 27 }, (_, index) => ({ ...project, id: 100 + index, project_code: `Q2-${index}`, name_ar: 'مشروع في الربع المجاور', planned_quarter: 'Q2' }));
const requirement = { project_id: 37, requirement_id: 12, coverage_type: 'full', cybersecurity_requirements: { id: 12, requirement_code: 'R12', title_ar: 'متطلب محلي', status: 'active' } };
const control = { id: 41, control_code: 'C41', title_ar: 'ضابط محلي', implementation_status: 'not_implemented', evidence_status: 'accepted', verification_status: 'verified', frameworks: { code: 'DCC', is_active: true } };
const calls = [], errors = [], writes = [];
let role = 'admin', scenario = 'complete';
let markOldAudit, releaseOldAudit;
const pageCalls = [];
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin === origin) return route.continue();
  // Never forward synthetic sessions, placeholders or requests to real services.
  if (!url.hostname.endsWith('.supabase.co')) return route.abort();
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
  calls.push(url);
  let json;
  if (url.pathname === '/auth/v1/user') json = user;
  else {
    const table = url.pathname.split('/').at(-1);
    const from = Number(url.searchParams.get('offset') || 0);
    pageCalls.push({ scenario, table, from, order: url.searchParams.get('order') });
    const failed = { projects: 'cybersecurity_projects', links: 'cybersecurity_project_controls', requirements: 'cybersecurity_project_requirements', mappings: 'cybersecurity_requirement_controls', controls: 'controls', treatments: 'cybersecurity_project_gap_treatments', audit: 'grc_audit_events' };
    if (table === failed[scenario] || (scenario === 'later-page' && table === 'cybersecurity_projects' && from > 0)) return route.fulfill({ status: 503, json: { message: 'PRIVATE_SQL_SECRET_TEST', code: 'XX000' } });
    if (table === 'profiles') json = { role, is_active: true, display_name: 'حساب محلي اصطناعي' };
    else if (table === 'cybersecurity_projects') {
      const id = url.searchParams.get('id');
      if (id && id !== 'eq.37') return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'No visible record' } });
      json = id ? project : scenario === 'zero' ? [] : ['paging', 'later-page'].includes(scenario) ? Array.from({ length: 1003 }, (_, index) => ({ ...project, id: index + 1, project_code: `P-${index + 1}` })) : [project, ...crowdedQuarter];
    } else if (table === 'cybersecurity_project_requirements') json = scenario === 'no-relationship' ? [] : [{ ...requirement, cybersecurity_requirements: scenario === 'null-requirement' ? null : requirement.cybersecurity_requirements }];
    else if (table === 'cybersecurity_requirement_controls') json = [{ requirement_id: 12, control_id: 41, coverage_type: 'partial', mapping_confidence: 'confirmed', controls: scenario === 'null-control' ? null : control }];
    else if (table === 'controls') json = [control];
    else if (table === 'grc_audit_events' && scenario === 'audit-stale') {
      const old = !url.searchParams.has('entity_type');
      if (old) await new Promise(resolve => { releaseOldAudit = resolve; markOldAudit(); });
      json = [{ id: old ? 901 : 902, control_id: 41, entity_type: 'grc_findings', entity_id: 'local-only', action: 'insert', actor_name: old ? 'OLD_AUDIT_CONTEXT' : 'NEW_AUDIT_CONTEXT', occurred_at: '2026-10-03T10:00:00Z', previous_data: null, new_data: { status: 'open' } }];
    }
    else if (table === 'cybersecurity_project_gap_treatments') json = scenario === 'links' ? [{ id: 77, project_id: 37, priority: 'high' }] : [];
    else json = [];
  }
  // Match PostgREST exact-count/range contract as well as its JSON body.
  const total = Array.isArray(json) ? json.length : null;
  const from = Number(url.searchParams.get('offset') || 0);
  if (total !== null) json = json.slice(from, from + Math.min(137, Number(url.searchParams.get('limit') || 500)));
  return route.fulfill({ status: 200, json, headers: total === null ? {} : { 'content-range': `${from}-${from + json.length - 1}/${total}`, 'access-control-expose-headers': 'Content-Range' } });
});
await context.addInitScript(({ user }) => {
  const encode = value => btoa(JSON.stringify(value));
  const session = { user, access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: 4102444800 })}.local-synthetic-only`, refresh_token: 'local-synthetic-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 999999 };
  localStorage.setItem('sb-lkozjnpfufdpzqtzdxhe-auth-token', JSON.stringify(session));
}, { user });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const load = async path => { await page.goto(origin + path); await page.locator('main.roadmap-page h1, main.roadmap-page [role="alert"]').first().waitFor(); await page.locator('.roadmap-loading').waitFor({ state: 'hidden' }); };

const text = () => page.locator('main.roadmap-page').innerText();
const metric = async label => page.locator('article').filter({ has: page.locator('span', { hasText: label }).filter({ hasText: new RegExp('^' + label + '$') }) }).first().locator('strong').first().innerText();
try {
  scenario = 'zero';
  await load('/roadmap');
  check(await metric('إجمالي المشاريع') === '0', 'successful empty authorized scope = zero');
  for (const scenarioName of ['projects', 'later-page']) {
    scenario = scenarioName; await load('/roadmap');
    check(await metric('إجمالي المشاريع') === 'غير متاح', scenario + ' count unavailable');
    check(!(await text()).includes('لا توجد مشاريع مطابقة'), 'not false empty');
    check(!(await text()).includes('PRIVATE_SQL_SECRET_TEST'), 'error detail suppressed');
  }
  scenario = 'paging'; await load('/roadmap');
  check(await metric('إجمالي المشاريع') === '1003', 'complete result beyond API cap');
  check(pageCalls.some(c => c.scenario === 'paging' && c.from >= 959), 'later ranges actually read');
  check(pageCalls.filter(c => c.table === 'cybersecurity_projects' && c.order).every(c => c.order.endsWith('id.asc')), 'stable primary ID tie breaker');
  scenario = 'links'; await load('/roadmap/dashboard?focus_year=2027&focus_quarter=Q1');
  check(await page.locator('.quarterly-project').count() === 28, 'placement independent of enrichment');
  check(await metric('ضوابط ذات ربط مباشر مسجّل') === 'غير متاح', 'failed enrichment unavailable');
  check(await page.getByRole('button', { name: 'تصدير PDF' }).isDisabled() && await page.getByRole('button', { name: 'تصدير Excel' }).isDisabled(), 'exports blocked');
  check(await page.locator('[data-reading-focus]').getAttribute('id') === 'roadmap-2027-Q1', 'focus contract retained on partial data');
  await page.screenshot({ path: '/private/tmp/cgp-s1c-roadmap-partial.png' });
  await load('/roadmap/analysis');
  check(await metric('اكتمال عناصر التخطيط الخمسة الحالية') === 'غير متاح', 'planning needs completed direct links');
  check(await metric('أولوية إدارية عالية') === '28', 'independent high priority remains factual');
  await load('/roadmap/executive');
  check(await metric('فئات التنبيه الإداري') === 'غير متاح', 'alert composite unavailable');
  check(!(await text()).includes('لديه معالجة عالية بلا رابط'), 'no synthetic missing-link attention');
  scenario = 'treatments'; await load('/roadmap/executive');
  check((await text()).includes('بعض قواعد التنبيه غير متاحة'), 'failed alert dependency clearly partial');
  check(await page.getByRole('button', { name: 'تصدير PDF' }).isDisabled(), 'executive partial export blocked');
  for (const failure of ['requirements', 'null-requirement', 'mappings', 'null-control', 'controls']) {
    scenario = failure; await load('/roadmap/37?tab=overview');
    check((await text()).includes(project.name_ar), failure + ' never erases primary');
    check(await metric('الضوابط المرتبطة') === 'غير متاح', failure + ' dependent summary unavailable');
    await page.getByRole('tab', { name: 'الأدلة', exact: true }).click();
    check((await text()).includes('تعذر تحميل هذا الجزء'), failure + ' evidence context unavailable');
    check(!(await text()).includes('لا توجد علاقة مسجلة'), failure + ' no false no relationship');
  }
  scenario = 'no-relationship'; await load('/roadmap/37?tab=requirements');
  check((await text()).includes('لا توجد علاقة مسجلة ضمن هذا المصدر'), 'proven empty relation');
  scenario = 'treatments'; await load('/roadmap/37?tab=treatments');
  check((await text()).includes('تعذر تحميل المعالجات'), 'treatments read failure visible');
  check(!(await text()).includes('لم تسجل معالجات'), 'no false treatment empty');
  check((await text()).includes('تقنيات مرشحة'), 'independent technology field retained');
  scenario = 'audit'; await load('/roadmap/37?tab=audit');
  await page.getByText('غير متاح — تعذر تحميل سجل التدقيق.', { exact: true }).waitFor();
  check(!(await text()).includes('لا توجد أحداث ضمن التصفية'), 'audit read failure not false zero');
  check(!(await text()).includes('PRIVATE_SQL_SECRET_TEST'), 'audit raw error suppressed');
  check(await page.getByRole('button', { name: 'تصدير الصفحة CSV' }).isDisabled(), 'failed audit export blocked');
  scenario = 'audit-stale';
  const oldAuditStarted = new Promise(resolve => { markOldAudit = resolve; });
  await load('/roadmap/37?tab=audit'); await oldAuditStarted;
  await page.locator('.workflow-filter select').selectOption('grc_findings');
  await page.getByText(/NEW_AUDIT_CONTEXT/).first().waitFor();
  releaseOldAudit();
  await page.waitForTimeout(250);
  check((await text()).includes('NEW_AUDIT_CONTEXT') && !(await text()).includes('OLD_AUDIT_CONTEXT'), 'late audit response cannot overwrite newer filter context');
  scenario = 'null-control'; await load('/roadmap');
  check(await metric('ضوابط مرتبطة عبر المتطلبات وحالتها متحققة') === 'غير متاح', 'register null embedding not fabricated status');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    scenario = 'links'; await load('/roadmap/analysis');
    check(await page.locator('main').getAttribute('dir') === 'rtl', 'RTL');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at ' + width);
    await page.screenshot({ path: `/private/tmp/cgp-s1c-analysis-partial-${width}.png`, fullPage: true });
  }
  check(writes.length === 0, 'zero service writes');
  check(errors.length === 0, 'no browser runtime errors: ' + errors.join(';'));
  console.log(`S1-C local browser read reliability: ${checks} assertions PASS; all external reads mocked, writes 0`);
} finally { await browser.close(); }

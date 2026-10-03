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
const requirement = { project_id: 37, requirement_id: 12, coverage_type: 'full', cybersecurity_requirements: { id: 12, requirement_code: 'R12', title_ar: 'متطلب محلي', status: 'active' } };
const control = { id: 41, control_code: 'C41', title_ar: 'ضابط محلي', implementation_status: 'not_implemented', evidence_status: 'accepted', verification_status: 'verified', frameworks: { code: 'DCC', is_active: true } };
const calls = [], errors = [], writes = [];
let role = 'admin';
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
    if (table === 'profiles') json = { role, is_active: true, display_name: 'حساب محلي اصطناعي' };
    else if (table === 'cybersecurity_projects') {
      const id = url.searchParams.get('id');
      if (id && id !== 'eq.37') return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'No visible record' } });
      json = id ? project : [project];
    } else if (table === 'cybersecurity_project_requirements') json = [requirement];
    else if (table === 'cybersecurity_requirement_controls') json = [{ requirement_id: 12, control_id: 41, coverage_type: 'partial', mapping_confidence: 'confirmed', controls: control }];
    else if (table === 'controls') json = [control];
    else json = [];
  }
  return route.fulfill({ status: 200, json });
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
const selectedTab = async label => { await page.getByRole('tab', { name: label, exact: true, selected: true }).waitFor(); check(await page.getByRole('tab', { name: label, exact: true }).getAttribute('aria-selected') === 'true', `${label} selected`); };
const load = async path => { await page.goto(origin + path); await page.locator('.roadmap-loading').waitFor({ state: 'hidden' }); };
try {
  await load('/roadmap');
  const toolbar = page.locator('.register-toolbar');
  await toolbar.locator('input').fill('التنقل');
  const historyBefore = await page.evaluate(() => history.length);
  await toolbar.locator('input').fill('التنقل المحلي');
  check(await page.evaluate(() => history.length) === historyBefore, 'search replaces history');
  await toolbar.locator('select').nth(0).selectOption('2027');
  await toolbar.locator('select').nth(1).selectOption('planned');
  await toolbar.locator('select').nth(2).selectOption('high');
  await page.reload();
  await page.locator('.register-action-primary').waitFor();
  check(await toolbar.locator('input').inputValue() === 'التنقل المحلي', 'refresh restores search');
  check(await toolbar.locator('select').nth(2).inputValue() === 'high', 'refresh restores filters');
  const registerURL = page.url();
  await page.locator('.register-action-primary').click();
  await selectedTab('نظرة عامة');
  check(new URL(page.url()).pathname === '/roadmap/37', 'exact register identity');
  check(await page.locator('a.detail-back').first().getAttribute('href') === registerURL.slice(origin.length), 'return restores register filters');
  await page.goBack(); await page.locator('.register-action-primary').waitFor();
  check(page.url() === registerURL, 'register Back exact state');
  await page.goForward(); await selectedTab('نظرة عامة');
  await page.getByRole('tab', { name: 'المتطلبات', exact: true }).click(); await selectedTab('المتطلبات');
  await page.getByRole('tab', { name: 'الأدلة', exact: true }).click(); await selectedTab('الأدلة');
  await page.goBack(); await selectedTab('المتطلبات');
  await page.goForward(); await selectedTab('الأدلة');
  await page.reload(); await selectedTab('الأدلة');
  await page.getByRole('tab', { name: 'الضوابط', exact: true }).click();
  const filters = page.locator('.controls-table-filters');
  await filters.locator('select').nth(0).selectOption('DCC');
  await filters.locator('select').nth(1).selectOption('partial');
  await filters.locator('select').nth(2).selectOption('verified');
  await page.reload(); await selectedTab('الضوابط');
  for (const [index, value] of ['DCC', 'partial', 'verified'].entries()) check(await filters.locator('select').nth(index).inputValue() === value, `${value} refresh`);
  for (const [path, from, selector] of [
    ['/roadmap/dashboard', 'roadmap', '.quarterly-project'],
    ['/roadmap/analysis', 'analysis', '.strategy-project-link'],
    ['/roadmap/executive', 'executive', '.strategy-project-link'],
  ]) {
    await load(path); await page.locator(selector).first().click(); await selectedTab('نظرة عامة');
    check(new URL(page.url()).pathname === '/roadmap/37' && new URL(page.url()).searchParams.get('from') === from, `${from} exact link`);
    check((await page.locator('.cgp-breadcrumb').innerText()).includes('تفاصيل المشروع'), 'project breadcrumb');
    await page.goBack(); await page.locator(selector).first().waitFor(); check(new URL(page.url()).pathname === path, `${from} Back`);
    await page.goForward(); await selectedTab('نظرة عامة');
    await page.locator('a.detail-back').first().click();
    if (from === 'roadmap') {
      await page.locator('[data-reading-focus]').waitFor();
      check(await page.locator('[data-reading-focus]').getAttribute('id') === 'roadmap-2027-Q1', 'roadmap focus restored, not filtered');
      check(await page.locator('.quarterly-row').count() === 3, 'focus preserves all years');
    } else { await page.waitForURL(origin + path); check(new URL(page.url()).pathname === path, `${from} explicit return`); }
  }
  await load('/roadmap/37?tab=unknown&from=https://evil.test&returnUrl=https://evil.test&framework=hidden');
  await selectedTab('نظرة عامة');
  check(await page.locator('a.detail-back').first().getAttribute('href') === '/roadmap', 'invalid context safe register return');
  for (const [id, message] of [['not-an-id', 'رقم المشروع غير صحيح.'], ['999', 'المشروع غير موجود أو ليس ضمن صلاحيتك.'], ['998', 'المشروع غير موجود أو ليس ضمن صلاحيتك.']]) {
    await load(`/roadmap/${id}?project_id=37&from=register`);
    await page.locator('main.roadmap-page [role="alert"]').waitFor();
    check((await page.locator('main.roadmap-page [role="alert"]').innerText()).includes(message), 'invalid/missing/RLS-hidden safe unavailable');
    check(await page.getByRole('tab').count() === 0, 'no first-project fallback');
  }
  role = 'control_owner'; await load('/roadmap/37?tab=treatments'); await selectedTab('المعالجات');
  check(await page.locator('.roadmap-treatment-form').count() === 0 && await page.locator('.technologies-field textarea').isDisabled(), 'owner mutation controls unchanged');
  role = 'admin'; await load('/roadmap/37?tab=treatments'); await selectedTab('المعالجات');
  const textarea = page.locator('textarea').first(); await textarea.fill('مسودة محلية فقط');
  check(!page.url().includes('مسودة') && !decodeURIComponent(page.url()).includes('مسودة'), 'draft never serialized');
  await page.reload(); await selectedTab('المعالجات');
  check(await textarea.inputValue() === '', 'unsaved draft not reconstructed from URL');
  await page.setViewportSize({ width: 390, height: 844 });
  await load('/roadmap/37?tab=overview&from=analysis'); await selectedTab('نظرة عامة');
  await page.screenshot({ path: '/private/tmp/cgp-s1b-mobile.png', fullPage: true });
  check((await page.locator('main.roadmap-page').getAttribute('dir')) === 'rtl', 'RTL retained');
  check(writes.length === 0, 'no service mutation attempted');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  check(calls.filter(url => url.pathname.endsWith('/cybersecurity_projects') && url.searchParams.has('id')).every(url => ['eq.37', 'eq.998', 'eq.999'].includes(url.searchParams.get('id'))), 'all detail requests exact valid path IDs only');
  console.log(`S1-B real Next browser navigation: ${checks} assertions PASS; all Supabase calls intercepted locally; QA/Production writes 0.`);
} finally { await context.close(); await browser.close(); }

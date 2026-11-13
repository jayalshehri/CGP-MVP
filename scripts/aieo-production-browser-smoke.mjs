import { chromium } from 'playwright';

const { CGP_SMOKE_EMAIL, CGP_SMOKE_PASSWORD } = process.env;
if (!CGP_SMOKE_EMAIL || !CGP_SMOKE_PASSWORD) {
  console.error('NOT TESTED: dedicated production smoke account is not configured.');
  process.exit(1);
}

const origin = 'https://cgp-mvp-grc13.vercel.app';
const pages = [
  ['/', 'لوحة المتابعة التشغيلية'],
  ['/executive', 'اللوحة التنفيذية'],
  ['/reports', 'تقارير الالتزام'],
  ['/controls', 'مكتبة الضوابط'],
  ['/tasks', 'التكليفات'],
  ['/evidence', 'الأدلة'],
  ['/review', 'مراجعة الأدلة'],
];
const browser = await chromium.launch();
let phase = 'open-login';
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(12_000);
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== origin) throw new Error();
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname === 'ahfindosbawqfvhbcplq.supabase.co' && url.pathname === '/auth/v1/token') {
      console.log('AUTH HTTP', response.status());
    }
  });
  phase = 'fill-email';
  await page.locator('#email').fill(CGP_SMOKE_EMAIL);
  phase = 'fill-password';
  await page.locator('#password').fill(CGP_SMOKE_PASSWORD);
  phase = 'submit-login';
  await page.getByRole('button', { name: 'دخول إلى CGP' }).click();
  phase = 'wait-for-dashboard';
  await page.waitForURL(origin + '/');
  console.log('PASS login');
  for (const [path, heading] of pages) {
    phase = path;
    await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    console.log('PASS', path);
  }
} catch (error) {
  console.error('FAIL', phase, error.name);
  process.exitCode = 1;
} finally {
  await browser.close();
}

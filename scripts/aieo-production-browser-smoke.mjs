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
let phase = 'login';
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(12_000);
  await page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== origin) throw new Error();
  await page.getByRole('textbox', { name: 'البريد الإلكتروني' }).fill(CGP_SMOKE_EMAIL);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(CGP_SMOKE_PASSWORD);
  await page.getByRole('button', { name: 'دخول إلى CGP' }).click();
  await page.waitForURL(origin + '/');
  console.log('PASS login');
  for (const [path, heading] of pages) {
    phase = path;
    await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1, name: heading, exact: true }).waitFor();
    console.log('PASS', path);
  }
} catch {
  console.error('FAIL', phase);
  process.exitCode = 1;
} finally {
  await browser.close();
}

// Release-only QA gate. No writes to application data or deployment targets.
import { spawnSync } from 'node:child_process';

function refuse(reason) {
  console.error(`RELEASE QA BLOCKED: ${reason}`);
  process.exit(1);
}

const expectedQaRef = 'lkozjnpfufdpzqtzdxhe';
const vars = ['CGP_BASE_URL', 'QA_EXPECTED_ORIGIN', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'QA_EMAIL', 'QA_PASSWORD'];
for (const key of vars) {
  if (!process.env[key]?.trim()) refuse(`Missing required QA-only variable: ${key}`);
}

let target, expected, supabase;
try {
  target = new URL(process.env.CGP_BASE_URL);
  expected = new URL(process.env.QA_EXPECTED_ORIGIN);
  supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
} catch {
  refuse('Invalid QA URL');
}

const validOrigin = url => url.protocol === 'https:' &&
  url.username === '' && url.password === '' && url.search === '' &&
  url.hash === '' && (url.pathname === '/' || url.pathname === '');
if (!validOrigin(target) || !validOrigin(expected) || target.origin !== expected.origin) {
  refuse('QA target must exactly match the separately approved QA origin');
}
if (!target.hostname.endsWith('.vercel.app') ||
    /(^cgp-mvp\.vercel\.app$|^cgp-mvp-grc13\.vercel\.app$|^cgp-mvp-git-main-|^cgp-mvp-git-claude-prod-portfolio-release-)/.test(target.hostname)) {
  refuse('QA target is not an approved non-production Vercel preview origin');
}
if (!validOrigin(supabase) || supabase.hostname !== `${expectedQaRef}.supabase.co`) {
  refuse('Supabase target must be the dedicated CGP-QA project');
}
if (process.env.QA_EMAIL.trim().includes(' ') || !process.env.QA_EMAIL.includes('@')) {
  refuse('Invalid QA account identifier');
}
console.log('PASS: exact QA origin, dedicated QA database and authenticated-test prerequisites');
const result = spawnSync(process.execPath, ['scripts/qa-smoke.mjs'], {
  stdio: 'inherit',
  env: process.env,
  timeout: 180000,
});
if (result.error) refuse('QA smoke process could not complete');
if (result.status !== 0) refuse('QA smoke checks failed');
console.log('PASS: internal release QA gate');

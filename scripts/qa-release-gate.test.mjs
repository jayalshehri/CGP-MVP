import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Negative-only: do not give valid QA credentials, perform network calls, or touch any DB.
const script = 'scripts/qa-release-gate.mjs';
const qaUrl = 'https://cgp-test-pr-123-grc13.vercel.app';
const baseline = {
  CGP_BASE_URL: qaUrl,
  QA_EXPECTED_ORIGIN: qaUrl,
  NEXT_PUBLIC_SUPABASE_URL: 'https://lkozjnpfufdpzqtzdxhe.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_only',
  QA_EMAIL: 'synthetic@example.invalid',
  QA_PASSWORD: 'synthetic-only-not-a-real-password',
  QA_EXPECTED_ROLE: 'control_owner',
};
function blocked(name, overrides, expected) {
  test(name, () => {
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', ...baseline, ...overrides };
    const run = spawnSync(process.execPath, [script], { env, encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /RELEASE QA BLOCKED:/);
    assert.match(run.stderr, expected);
    assert.doesNotMatch(run.stdout, /PASS: internal release QA gate/);
  });
}
blocked('missing QA password is never a skip', { QA_PASSWORD: '' }, /QA_PASSWORD/);
blocked('missing expected role is never a skip', { QA_EXPECTED_ROLE: '' }, /QA_EXPECTED_ROLE/);
blocked('invalid expected role is blocked', { QA_EXPECTED_ROLE: 'superuser' }, /QA_EXPECTED_ROLE/);
blocked('missing QA account is never a skip', { QA_EMAIL: '' }, /QA_EMAIL/);
blocked('missing approved origin fails closed', { QA_EXPECTED_ORIGIN: '' }, /QA_EXPECTED_ORIGIN/);
blocked('production domain rejected even when expected matches', {
  CGP_BASE_URL: 'https://cgp-mvp.vercel.app',
  QA_EXPECTED_ORIGIN: 'https://cgp-mvp.vercel.app',
}, /non-production/);
blocked('main branch preview rejected', {
  CGP_BASE_URL: 'https://cgp-mvp-git-main-grc13.vercel.app',
  QA_EXPECTED_ORIGIN: 'https://cgp-mvp-git-main-grc13.vercel.app',
}, /non-production/);
blocked('unapproved host rejected', {
  CGP_BASE_URL: 'https://other-project.vercel.app',
}, /exactly match/);
blocked('production database ref rejected', {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ahfindosbawqfvhbcplq.supabase.co',
}, /dedicated CGP-QA/);
blocked('URL credential injection rejected', {
  CGP_BASE_URL: 'https://alice:pass@cgp-test-pr-123-grc13.vercel.app',
  QA_EXPECTED_ORIGIN: 'https://alice:pass@cgp-test-pr-123-grc13.vercel.app',
}, /exactly match/);
blocked('plaintext QA URL rejected', {
  CGP_BASE_URL: 'http://cgp-test-pr-123-grc13.vercel.app',
  QA_EXPECTED_ORIGIN: 'http://cgp-test-pr-123-grc13.vercel.app',
}, /exactly match/);

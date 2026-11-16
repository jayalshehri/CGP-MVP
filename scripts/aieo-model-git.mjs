// Shared credential-free Git boundary for model source provenance and local
// QA/Security/Reviewer gates. These processes may hold an OpenRouter key.
// Git's worktree diff can execute clean filters; attest every tracked path first.
import { execFileSync } from 'node:child_process';
import {
  hasUnsafeGitEnvironment, readOnlyGitEnvironment, readOnlyGitArguments,
  assertNoTrackedGitFilters
} from './aieo-git-process-guard.mjs';

function rejectOverrides(env) {
  if (hasUnsafeGitEnvironment(env)) {
    throw new Error('AIEO model Git blocked: untrusted Git or GitHub CLI environment');
  }
}

export function preflightModelGit(env = process.env) {
  rejectOverrides(env);
  // Uses its own allowlisted Git process environment and NUL-delimited paths.
  // Reject even a clean filter assigned to a different tracked file: an
  // unscoped worktree diff can execute that helper with provider credentials.
  assertNoTrackedGitFilters(env);
}

export function modelGit(args, { env = process.env, encoding = 'utf8' } = {}) {
  rejectOverrides(env);
  return execFileSync('git', readOnlyGitArguments(args), {
    env: readOnlyGitEnvironment(env),
    encoding, stdio: 'pipe', maxBuffer: 512000
  });
}

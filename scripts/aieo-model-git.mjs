// Shared credential-free Git boundary for model source provenance and local
// QA/Security/Reviewer gates. These processes may hold an OpenRouter key.
// Git's worktree diff can execute clean filters; attest every tracked path first.
import { execFileSync } from 'node:child_process';
import {
  hasUnsafeGitEnvironment, readOnlyGitEnvironment, readOnlyGitArguments,
  assertNoTrackedGitFilters, pinReadOnlyGitExecutable
} from './aieo-git-process-guard.mjs';

// The first provenance preflight occurs before model source is shared. Pin
// that exact Git binary for all subsequent source, QA and Reviewer reads in
// the same operation. Rediscovering 'git' through PATH after a subprocess
// (or the provider response) can execute a substituted program instead.
const pinnedExecutables = new WeakMap();
function trustedModelGit(env) {
  if (!env || typeof env !== 'object') {
    throw new Error('AIEO model Git blocked: invalid environment');
  }
  if (hasUnsafeGitEnvironment(env)) {
    throw new Error('AIEO model Git blocked: untrusted Git or GitHub CLI environment');
  }
  const previous = pinnedExecutables.get(env);
  if (previous) {
    if (env.PATH !== previous.path) {
      throw new Error('AIEO model Git blocked: PATH changed after preflight');
    }
    return previous.executable;
  }
  const executable = pinReadOnlyGitExecutable(env);
  pinnedExecutables.set(env, { executable, path: env.PATH });
  return executable;
}

export function preflightModelGit(env = process.env) {
  const executable = trustedModelGit(env);
  // Use the SAME trusted binary for both filter inspection and later
  // immutable-object checks; no source disclosure on an executable swap.
  assertNoTrackedGitFilters(env, executable);
}

export function modelGit(args, { env = process.env, encoding = 'utf8' } = {}) {
  const executable = trustedModelGit(env);
  // Attributes can change after the first source preflight (including while
  // the external model is responding). Git worktree diff may execute a newly
  // enabled filter.<driver>.clean even with --no-ext-diff/--no-textconv.
  // Re-attest tracked paths immediately before EVERY diff, using the already
  // pinned Git executable and a credential-free subprocess environment.
  if (Array.isArray(args) && args[0] === 'diff') {
    assertNoTrackedGitFilters(env, executable);
  }
  return execFileSync(executable, readOnlyGitArguments(args), {
    env: readOnlyGitEnvironment(env),
    encoding, stdio: 'pipe', maxBuffer: 512000
  });
}

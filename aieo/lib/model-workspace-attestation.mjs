// Review agents consume model output from a fixed local worktree. Never
// follow symbolic links or multiply-linked files outside this trust boundary:
// verdict writes and report reads must stay inside the intended checkout.
import { lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function attestEntry(path, kind, required = true) {
  const absolute = resolve(process.cwd(), path);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return;
    throw new Error('Missing model review workspace entry: ' + path, { cause: error });
  }
  if (stat.isSymbolicLink() ||
      (kind === 'file' ? (!stat.isFile() || stat.nlink !== 1) : !stat.isDirectory()) ||
      realpathSync(absolute) !== absolute) {
    throw new Error('Unsafe model review workspace entry: ' + path);
  }
}

// The source-sharing step runs before any QA/Security/Reviewer report exists.
// It must still reject redirected input/output paths before making a provider
// request or writing its proposal evidence. Missing output entries are fine:
// the proposal CLI creates them itself after the remote request completes.
export function attestModelProposalWorkspace(sourcePath) {
  attestModelSourceFile(sourcePath);
  attestEntry('aieo-output', 'directory', false);
  attestEntry('aieo-output/model-proposal.json', 'file', false);
}

// The privileged publisher also serves deterministic repairs, where no model
// verdict directory exists. Both modes must independently attest the source
// file rather than trusting the previous stage's filesystem check.
export function attestModelSourceFile(sourcePath) {
  attestEntry(sourcePath, 'file');
}

// Call before any Git read, model artifact read or verdict write. Existing
// optional verdict files may come from an earlier stage; if present, they too
// must be ordinary local files. This is a local containment check, not a
// defense against a hostile actor concurrently mutating the checkout.
export function attestModelReviewWorkspace(sourcePath) {
  attestModelSourceFile(sourcePath);
  attestEntry('aieo-output', 'directory');
  attestEntry('aieo-output/model-proposal.json', 'file');
  for (const stage of ['qa', 'security', 'reviewer']) {
    attestEntry('aieo-output/model-' + stage + '.json', 'file', false);
  }
}

// The QA, Security and Reviewer CLIs read Git index and repository state.
// Inherited GIT_* overrides (including alternate global/system config) can make that state differ from the checkout
// containing the attested source, so refuse them before any Git subprocess.
export function attestModelReviewGitEnvironment(env = process.env) {
  const overrides = [
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS',
    'GIT_EXEC_PATH', 'GIT_CEILING_DIRECTORIES', 'GIT_PREFIX',
    'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM'
  ];
  // Git tracing can write process paths, repository metadata or packet/body
  // diagnostics to attacker-chosen files before a reviewer emits its verdict.
  // Reject inherited diagnostic sinks before ANY Git subprocess is started.
  const diagnostics = Object.entries(env).some(([name, value]) =>
    (/^GIT_TRACE[A-Z0-9_]*$/.test(name) || name === 'GIT_CURL_VERBOSE') &&
    typeof value === 'string' && value.length > 0);
  if (diagnostics || overrides.some((name) => typeof env[name] === 'string' && env[name].length > 0)) {
    throw new Error('Unsafe Git environment for model review');
  }
}

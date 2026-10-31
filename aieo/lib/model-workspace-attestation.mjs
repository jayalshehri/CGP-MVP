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

// Call before any Git read, model artifact read or verdict write. Existing
// optional verdict files may come from an earlier stage; if present, they too
// must be ordinary local files. This is a local containment check, not a
// defense against a hostile actor concurrently mutating the checkout.
export function attestModelReviewWorkspace(sourcePath) {
  attestEntry(sourcePath, 'file');
  attestEntry('aieo-output', 'directory');
  attestEntry('aieo-output/model-proposal.json', 'file');
  for (const stage of ['qa', 'security', 'reviewer']) {
    attestEntry('aieo-output/model-' + stage + '.json', 'file', false);
  }
}

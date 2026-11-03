// Read-only regression tests for separation between CI checks and write-capable jobs.
// These guardrails are not a substitute for GitHub branch protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const model = read('.github/workflows/aieo-model-draft.yml');
const developer = read('.github/workflows/aieo-developer-draft.yml');
const foundation = read('.github/workflows/aieo-multi-agent.yml');
const publisher = read('scripts/aieo-publish-draft.mjs');
const provider = read('aieo/lib/model-provider.mjs');

test('provider-backed source sharing stays manual, explicit, and environment-scoped', () => {
  const guard = "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.approve_external_source_sharing == true";
  assert.ok(model.includes(guard), 'model write job must require trusted manual main dispatch and opt-in');
  assert.match(model, /approve_external_source_sharing:\s*\n(?:.*\n){0,6}\s*default: false/m);
  assert.ok(model.includes('approved_source_sha256:'), 'manual approval must bind the exact source snapshot');
  assert.ok(model.includes('AIEO_APPROVED_SOURCE_SHA256: ' + '$' + '{{ inputs.approved_source_sha256 }}'));
  assert.ok(model.includes('environment: aieo-ai'), 'provider credentials must remain environment-scoped');
  assert.ok(model.includes('OPENROUTER_API_KEY: ' + '$' + '{{ secrets.OPENROUTER_API_KEY }}'));
  assert.ok(model.includes("AIEO_SOURCE_SHARING_APPROVED: 'true'"));
  assert.ok(model.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(model, /pull_request_target\s*:/);
});

test('developer publisher remains manual and no privileged PR event is added', () => {
  assert.ok(developer.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"));
  assert.ok(developer.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(developer, /pull_request_target\s*:/);
  assert.ok(developer.includes('persist-credentials: false'));
});

test('multi-agent pull-request checks never request write access', () => {
  assert.ok(foundation.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(foundation, /(?:contents|actions|pull-requests|id-token): write/);
  assert.doesNotMatch(foundation, /pull_request_target\s*:/);
  assert.ok(foundation.includes('persist-credentials: false'));
});

test('publisher cannot bypass human review or invoke model from untrusted PR', () => {
  assert.ok(publisher.includes("env.GITHUB_EVENT_NAME !== 'workflow_dispatch'"));
  assert.ok(publisher.includes("env.GITHUB_REF !== 'refs/heads/main'"));
  assert.ok(publisher.includes("env.GITHUB_REPOSITORY !== 'jayalshehri/CGP-MVP'"));
  assert.ok(publisher.includes("checkedOutSha: command('git', ['rev-parse', 'HEAD']).trim()"));
  assert.ok(publisher.includes("originUrl: command('git', ['config', '--get', 'remote.origin.url']).trim()"));
  assert.ok(publisher.includes("effectivePushUrls: command('git', ['remote', 'get-url', '--push', '--all', 'origin'])"));
  assert.ok(publisher.includes('effectivePushUrls.length !== 1'));
  assert.ok(publisher.includes('checkedOutSha !== env.GITHUB_SHA'));
  assert.ok(publisher.includes('verifyNoGitTransportOverride({'));
  assert.ok(publisher.includes("effectiveSshCommand: command('git', ['config', '--get', '--default', '', 'core.sshCommand']).trim()"));
  for (const variable of ['GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS']) {
    assert.ok(publisher.includes(variable), 'missing executable transport guard: ' + variable);
  }
  assert.ok(publisher.includes('verifyGitHttpsTls({ env, effectiveSslVerify: '), 'publisher must reject disabled Git HTTPS TLS');
  assert.ok(publisher.includes("'--get-urlmatch', 'http.sslVerify'"), 'publisher must read URL-scoped TLS verification config');
  assert.ok(publisher.includes('GIT_SSL_NO_VERIFY'), 'publisher must reject insecure TLS environment overrides');
  assert.ok(publisher.includes('verifyCommittedCandidate({'));
  assert.ok(publisher.includes("verifyNoGitFilter(path, command('git', ['check-attr', 'filter', '--', path]).trim())"));
  for (const operation of ['--check', '--name-only', '--unified=0', '--cached']) {
    assert.ok(publisher.includes("'--no-ext-diff', '--no-textconv', '" + operation + "'"),
      'publisher must disable external diff and textconv for ' + operation);
  }
  assert.ok(publisher.includes("command('git', ['-c', 'core.hooksPath=/dev/null', ...args])"),
    'publisher Git hooks must be disabled regardless of runner Git config');
  for (const operation of ['switch', 'add', 'commit']) {
    assert.ok(publisher.includes("gitNoHooks(['" + operation + "'"),
      'hook-capable Git operation must use hookless publisher wrapper: ' + operation);
  }
  assert.ok(publisher.includes("'credential.helper='"), 'prior Git credential helpers must be reset');
  assert.ok(publisher.includes("'credential.helper=!gh auth git-credential'"), 'only GitHub CLI may provide network authentication');
  assert.ok(!publisher.includes("'git@github.com:jayalshehri/CGP-MVP'"),
    'SSH transport must not be allowlisted in the token-bearing Draft publisher');
  assert.ok(!publisher.includes("'ssh://git@github.com/jayalshehri/CGP-MVP.git'"),
    'SSH ProxyCommand/Match exec routes must not be allowlisted');
  assert.ok(publisher.includes('verifyNoGitHubCliRoutingOverride(env)'), 'inherited GH_REPO/GH_HOST must be rejected before Git commands');
  assert.ok(publisher.includes("'pr', 'create', '--draft', '--repo', env.GITHUB_REPOSITORY"), 'PR creation must explicitly target expected repository');
  assert.ok(publisher.includes("'--repo', env.GITHUB_REPOSITORY, '--ref', branch"), 'follow-up CI must target expected repository');
  assert.ok(publisher.includes("gitAuthenticated(['push', 'origin'"), 'push must use isolated Git authentication');
  assert.ok(publisher.includes("gitAuthenticated(['ls-remote', 'origin'"), 'post-push attestation must use isolated Git authentication');
  assert.ok(!publisher.includes("command('gh', ['auth', 'setup-git'])"), 'no persistent Git credential configuration');
  assert.ok(publisher.includes("command('git', ['show', 'HEAD:' + path])"));
  assert.ok(publisher.includes("command('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])"));
  assert.ok(publisher.includes('!trustedOrigins.has(originUrl)'));
  assert.ok(publisher.includes('!trustedOrigins.has(effectivePushUrls[0])'));
  assert.ok(publisher.includes("'--draft'"));
  assert.doesNotMatch(publisher, /(?:['"]pr merge['"]|--auto-merge|--force-with-lease)/);
  assert.ok(provider.includes("env.AIEO_SOURCE_SHARING_APPROVED !== 'true'"));
  assert.ok(provider.includes('env.AIEO_APPROVED_SOURCE_SHA256'));
  assert.ok(provider.includes("env.GITHUB_EVENT_NAME !== 'workflow_dispatch'"));
});

test('required app CI covers stacked AIEO PRs with read-only permissions', () => {
  const requiredCI = read('.github/workflows/cgp-required-ci.yml');
  assert.ok(requiredCI.includes("branches: [main, 'aieo/**']"), 'stacked development PRs must run app checks');
  assert.ok(requiredCI.includes('permissions:\n  contents: read'));
  assert.doesNotMatch(requiredCI, /pull_request_target\s*:/);
  assert.doesNotMatch(requiredCI, /(?:contents|actions|pull-requests|id-token): write/);
  assert.ok(requiredCI.includes('persist-credentials: false'));
  for (const check of ['npm ci', 'npm run lint', 'npx next typegen', 'npx tsc --noEmit', 'npm run build']) {
    assert.ok(requiredCI.includes(check), 'missing app CI step: ' + check);
  }
});

test('model review stages have separate Actions steps and never inherit the provider key', () => {
  const steps = model.split(/\n(?=      - name: )/);
  const getStep = (name) => {
    const step = steps.find((block) => block.startsWith('      - name: ' + name + '\n'));
    assert.ok(step, 'missing independent workflow step: ' + name);
    return step;
  };
  const proposalName = 'Request one bounded model suggestion with scoped provider credential';
  const qaName = 'Independently run model QA without provider credential';
  const securityName = 'Independently run model Security without provider credential';
  const reviewerName = 'Independently run model Reviewer without provider credential';
  const scopeName = 'Attest candidate diff scope after independent reviews';
  const buildName = 'Independently verify application build';
  const proposal = getStep(proposalName);
  assert.match(proposal, /OPENROUTER_API_KEY:/);
  assert.match(proposal, /node scripts\/aieo-model-proposal\.mjs/);
  assert.doesNotMatch(proposal, /node scripts\/aieo-model-(?:gates|security)\.mjs/);
  const stages = [
    [qaName, /run: node scripts\/aieo-model-gates\.mjs qa/],
    [securityName, /run: node scripts\/aieo-model-security\.mjs/],
    [reviewerName, /run: node scripts\/aieo-model-gates\.mjs reviewer/],
    [scopeName, /git diff --check/]
  ];
  for (const [name, command] of stages) {
    const step = getStep(name);
    assert.match(step, command);
    assert.doesNotMatch(step, /OPENROUTER_API_KEY|OPENROUTER_MODEL_ID|GH_TOKEN|AIEO_MODEL_TASK|secrets\./,
      name + ' must not inherit provider or publishing credentials');
  }
  assert.equal(steps.filter((step) => step.includes('OPENROUTER_API_KEY:')).length, 1,
    'provider secret must occur in exactly one Actions step');
  const order = [proposalName, qaName, securityName, reviewerName, scopeName, buildName]
    .map((name) => model.indexOf('      - name: ' + name + '\n'));
  assert.ok(order.every((value, index) => value >= 0 && (index === 0 || value > order[index - 1])),
    'review steps must be ordered sequentially before the app build');
});

test('token-bearing Actions steps neutralize inherited Bash/Node startup hooks and Node TLS overrides', () => {
  // BASH_ENV runs before a noninteractive Bash command; NODE_OPTIONS can preload
  // arbitrary JavaScript before the publisher's own fail-closed checks execute.
  // Both must be explicitly cleared at step scope, not merely validated inside
  // a JavaScript process that may already have executed an inherited preload.
  const protectedSteps = [
    [model, 'Request one bounded model suggestion with scoped provider credential', 'OPENROUTER_API_KEY:'],
    [model, 'Publish independently verified candidate as Draft PR only', 'GH_TOKEN:'],
    [developer, 'Publish verified bounded fix as Draft PR only', 'GH_TOKEN:']
  ];
  for (const [workflow, name, credential] of protectedSteps) {
    const step = workflow.split(/\n(?=      - name: )/)
      .find((block) => block.startsWith('      - name: ' + name + '\n'));
    assert.ok(step, 'missing protected step: ' + name);
    const envBlock = step.match(/\n        env:\n((?:          .*\n)+)/)?.[1];
    assert.ok(envBlock, 'missing step-scoped environment: ' + name);
    const lines = envBlock.split('\n');
    for (const [variable, expected] of [
      ['BASH_ENV', "''"],
      ['NODE_OPTIONS', "''"],
      ['LD_PRELOAD', "''"],
      ['LD_AUDIT', "''"],
      ['LD_LIBRARY_PATH', "''"],
      ['NODE_EXTRA_CA_CERTS', "''"],
      ['NODE_TLS_REJECT_UNAUTHORIZED', "'1'"]
    ]) {
      assert.equal(lines.filter((line) => line.trim() === variable + ': ' + expected).length, 1,
        name + ' must pin ' + variable + ' at the credential-bearing step');
    }
    assert.ok(lines.some((line) => line.trim().startsWith(credential)),
      'credential must be scoped to the protected step: ' + name);
  }
});

test('independent model QA/Security/Reviewer reject inherited Bash and Node preload hooks', () => {
  for (const name of [
    'Independently run model QA without provider credential',
    'Independently run model Security without provider credential',
    'Independently run model Reviewer without provider credential'
  ]) {
    const stage = model.split(/\n(?=      - name: )/)
      .find((block) => block.startsWith('      - name: ' + name + '\n'));
    assert.ok(stage, 'missing independent reviewer: ' + name);
    const environment = stage.match(/\n        env:\n((?:          .*\n)+)/)?.[1] || '';
    assert.ok(environment.split('\n').some((line) => line.trim() === "BASH_ENV: ''"),
      name + ' must not inherit a Bash startup hook');
    assert.ok(environment.split('\n').some((line) => line.trim() === "NODE_OPTIONS: ''"),
      name + ' must not inherit a Node preload hook');
    for (const libraryVariable of ['LD_PRELOAD', 'LD_AUDIT', 'LD_LIBRARY_PATH']) {
      assert.ok(environment.split('\n').some((line) => line.trim() === libraryVariable + ": ''"),
        name + ' must not inherit dynamic-loader injection: ' + libraryVariable);
    }
    assert.doesNotMatch(environment, /OPENROUTER_API_KEY|GH_TOKEN|secrets\./,
      name + ' must not inherit any provider or publisher credential');
  }
});

test('live provider-backed model chain uses separate credential-isolated runners', () => {
  const jobs = [
    'create-model-draft',
    'model-qa',
    'model-security',
    'model-reviewer',
    'model-build',
    'model-publisher'
  ];
  const jobContent = (name) => {
    const start = model.indexOf('\n  ' + name + ':\n');
    assert.ok(start >= 0, 'missing isolated live model job: ' + name);
    const tail = model.slice(start + ('\n  ' + name + ':\n').length);
    const next = tail.search(/\n  [a-z][a-z0-9-]*:\n/);
    return next < 0 ? tail : tail.slice(0, next);
  };
  const manual = "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.approve_external_source_sharing == true";
  for (const name of jobs) {
    const job = jobContent(name);
    assert.ok(job.includes(manual), 'manual main + source consent is required in ' + name);
    assert.ok(job.includes('runs-on: ubuntu-latest'), 'missing independent runner for ' + name);
    assert.ok(job.includes('persist-credentials: false'), 'checkout credentials must never persist in ' + name);
  }
  const developerJob = jobContent('create-model-draft');
  assert.ok(developerJob.includes('environment: aieo-ai'));
  assert.ok(developerJob.includes('OPENROUTER_API_KEY:'));
  assert.ok(developerJob.includes('contents: read'));
  for (const name of ['model-qa', 'model-security', 'model-reviewer', 'model-build']) {
    const job = jobContent(name);
    assert.doesNotMatch(job, /OPENROUTER_API_KEY|GH_TOKEN|secrets\.|contents:\s*write|pull-requests:\s*write/);
    assert.ok(job.includes('needs:'), 'review chain must have dependency gate: ' + name);
    assert.ok(job.includes('actions/download-artifact@v4'), 'source-bound handoff is required: ' + name);
  }
  const publish = jobContent('model-publisher');
  assert.ok(publish.includes('needs: model-build'));
  assert.ok(publish.includes('contents: write'));
  assert.ok(publish.includes('pull-requests: write'));
  assert.ok(publish.includes('actions/download-artifact@v4'));
  assert.ok(!publish.includes('OPENROUTER_API_KEY'));
  assert.equal((model.match(/OPENROUTER_API_KEY:/g) || []).length, 1);
});

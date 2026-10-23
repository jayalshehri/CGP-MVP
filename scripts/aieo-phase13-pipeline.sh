#!/usr/bin/env bash
set -euo pipefail
: "${AIEO_NODE_IMAGE:?approved pinned image required}"
[[ "$AIEO_NODE_IMAGE" =~ ^node:24-alpine@sha256:[a-f0-9]{64}$ ]] || exit 2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/input/components"
printf 'export const value = "broken";\n' > "$tmp/input/components/AIEOFixture.tsx"
# Proposal generator is offline in this gate; protected live model calls are separate.
AIEO_TEST_MODE=1 node scripts/aieo-phase12-proposal.mjs
node scripts/aieo-patch-content-validator.mjs < aieo-reports/phase12-model-proposal.patch
cp aieo-reports/phase12-model-proposal.patch "$tmp/input/fix.patch"
# Only the disposable synthetic patch is readable by the unprivileged container; mount stays read-only.
chmod 0644 "$tmp/input/fix.patch"
cat > "$tmp/input/execute.cjs" <<'JS'
const fs=require('node:fs');
const assert=require('node:assert/strict');
const patch=fs.readFileSync('/input/fix.patch','utf8');
const expectedHeader='diff --git a/components/AIEOFixture.tsx b/components/AIEOFixture.tsx\nindex 1111111..2222222 100644\n--- a/components/AIEOFixture.tsx\n+++ b/components/AIEOFixture.tsx\n@@ -1 +1 @@\n';
assert.ok(patch.startsWith(expectedHeader));
const changes=patch.slice(expectedHeader.length).split('\n');
assert.deepEqual(changes,['-export const value = "broken";','+export const value = "fixed";','']);
const path='/work/components/AIEOFixture.tsx';
assert.equal(fs.readFileSync(path,'utf8'),'export const value = "broken";\n');
fs.writeFileSync(path,'export const value = "fixed";\n');
assert.equal(fs.readFileSync(path,'utf8'),'export const value = "fixed";\n');
assert.equal(process.env.GITHUB_TOKEN,undefined);
assert.equal(process.env.AIEO_OPENAI_API_KEY,undefined);
console.log('PASS: validated proposal applied inside isolated ephemeral workspace');
JS
docker run --rm --network none --user 65534:65534 --cap-drop ALL \
  --security-opt no-new-privileges:true --read-only --pids-limit 64 \
  --memory 256m --cpus 1 --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --tmpfs /work:rw,nosuid,size=16m,mode=1777 \
  --mount "type=bind,source=$tmp/input,target=/input,readonly" \
  --workdir /work "$AIEO_NODE_IMAGE" sh -eu -c 'mkdir components; cp /input/components/AIEOFixture.tsx components/AIEOFixture.tsx; node /input/execute.cjs'
test "$(cat "$tmp/input/components/AIEOFixture.tsx")" = 'export const value = "broken";'
echo 'PASS: host original unchanged'

#!/usr/bin/env bash
set -euo pipefail
: "${AIEO_NODE_IMAGE:?approved immutable image required}"
[[ "$AIEO_NODE_IMAGE" =~ ^node:24-alpine@sha256:[a-f0-9]{64}$ ]] || exit 2
# The live AI request occurs only on the host under protected environment.
# No API credentials are passed into the offline container.
node scripts/aieo-phase12-proposal.mjs
node scripts/aieo-patch-content-validator.mjs < aieo-reports/phase12-model-proposal.patch
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/input/components"
printf 'export const value = "broken";\n' > "$tmp/input/components/AIEOFixture.tsx"
cp aieo-reports/phase12-model-proposal.patch "$tmp/input/fix.patch"
chmod 0644 "$tmp/input/fix.patch"
cat > "$tmp/input/check.cjs" <<'JS'
const fs=require('node:fs'),assert=require('node:assert/strict');
const patch=fs.readFileSync('/input/fix.patch','utf8');
const expected='diff --git a/components/AIEOFixture.tsx b/components/AIEOFixture.tsx\nindex 1111111..2222222 100644\n--- a/components/AIEOFixture.tsx\n+++ b/components/AIEOFixture.tsx\n@@ -1 +1 @@\n-export const value = "broken";\n+export const value = "fixed";\n';
assert.equal(patch,expected);
const p='/work/components/AIEOFixture.tsx';
assert.equal(fs.readFileSync(p,'utf8'),'export const value = "broken";\n');
fs.writeFileSync(p,'export const value = "fixed";\n');
assert.equal(fs.readFileSync(p,'utf8'),'export const value = "fixed";\n');
for(const key of ['AIEO_OPENAI_API_KEY','GITHUB_TOKEN','SUPABASE_SERVICE_ROLE_KEY']) assert.equal(process.env[key],undefined);
console.log('PASS: approved model proposal applied to isolated synthetic fixture');
JS
docker run --rm --network none --user 65534:65534 --cap-drop ALL \
 --security-opt no-new-privileges:true --read-only --pids-limit 64 \
 --memory 256m --cpus 1 --tmpfs /tmp:rw,noexec,nosuid,size=16m \
 --tmpfs /work:rw,nosuid,size=16m,mode=1777 \
 --mount "type=bind,source=$tmp/input,target=/input,readonly" \
 --workdir /work "$AIEO_NODE_IMAGE" sh -eu -c 'mkdir components; cp /input/components/AIEOFixture.tsx components/AIEOFixture.tsx; node /input/check.cjs'
test "$(cat "$tmp/input/components/AIEOFixture.tsx")" = 'export const value = "broken";'
echo 'PASS: host fixture remains untouched'

#!/usr/bin/env bash
set -euo pipefail
# Applies a deterministic unified diff to a synthetic fixture *inside* the offline container.
# Does not mount the application repository, credentials, docker socket, or GitHub write token.
: "${AIEO_NODE_IMAGE:?Approved pinned Node image required}"
[[ "$AIEO_NODE_IMAGE" =~ ^node:24-alpine@sha256:[a-f0-9]{64}$ ]] || { echo 'Unpinned image refused' >&2; exit 2; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/input/components"
printf 'export const value = "broken";\n' > "$tmp/input/components/AIEOFixture.tsx"
cat > "$tmp/input/fix.patch" <<'PATCH'
diff --git a/components/AIEOFixture.tsx b/components/AIEOFixture.tsx
index 1111111..2222222 100644
--- a/components/AIEOFixture.tsx
+++ b/components/AIEOFixture.tsx
@@ -1 +1 @@
-export const value = "broken";
+export const value = "fixed";
PATCH
node scripts/aieo-patch-content-validator.mjs < "$tmp/input/fix.patch"
docker run --rm \
 --network none --user 65534:65534 --cap-drop ALL \
 --security-opt no-new-privileges:true --read-only \
 --pids-limit 64 --memory 256m --cpus 1 \
 --tmpfs /tmp:rw,noexec,nosuid,size=16m \
 --tmpfs /work:rw,nosuid,size=16m,mode=1777 \
 --mount "type=bind,source=$tmp/input,target=/input,readonly" \
 --workdir /work \
 "$AIEO_NODE_IMAGE" sh -eu -c '
   mkdir components
   cp /input/components/AIEOFixture.tsx components/AIEOFixture.tsx
   patch -p1 < /input/fix.patch
   node -e "const fs=require(\"node:fs\");const assert=require(\"node:assert/strict\");assert.equal(fs.readFileSync(\"components/AIEOFixture.tsx\",\"utf8\"),\"export const value = \\\"fixed\\\";\\n\");assert.equal(process.env.OPENAI_API_KEY,undefined);assert.equal(process.env.GITHUB_TOKEN,undefined);console.log(\"PASS: patch applied and verified within isolated tmpfs\");"
 '
# Ensure original host input was never changed.
test "$(cat "$tmp/input/components/AIEOFixture.tsx")" = 'export const value = "broken";'
echo 'PASS: source fixture unchanged; only ephemeral container copy was patched'

#!/usr/bin/env bash
set -euo pipefail
# This deliberately tests a synthetic file only, not the CGP codebase.
: "${AIEO_NODE_IMAGE:?Approved pinned image required}"
[[ "$AIEO_NODE_IMAGE" =~ ^node:24-alpine@sha256:[a-f0-9]{64}$ ]] || exit 2
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/fixture"
printf 'export const value = "broken";\n' > "$tmp/fixture/AIEOFixture.tsx"
docker run --rm --network none --user 65534:65534 --cap-drop ALL \
  --security-opt no-new-privileges:true --read-only --pids-limit 64 \
  --memory 256m --cpus 1 --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,source=$tmp/fixture,target=/fixture,readonly" \
  "$AIEO_NODE_IMAGE" node -e '
    const fs=require("node:fs");
    const assert=require("node:assert/strict");
    const text=fs.readFileSync("/fixture/AIEOFixture.tsx","utf8");
    assert.equal(text.replace("\"broken\"","\"fixed\""),"export const value = \"fixed\";\n");
    assert.throws(()=>fs.writeFileSync("/fixture/AIEOFixture.tsx","forbidden"));
    assert.equal(process.env.OPENAI_API_KEY,undefined);
    assert.equal(process.env.GITHUB_TOKEN,undefined);
    console.log("PASS: fixture repair simulation is deterministic/read-only");
  '

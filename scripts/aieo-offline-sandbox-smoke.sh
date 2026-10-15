#!/usr/bin/env bash
set -euo pipefail
# This fixture-only harness NEVER consumes an untrusted patch or application repository.
# Docker image download takes place on the runner; execution is offline.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/input" "$tmp/output"
printf 'fixture-only\n' > "$tmp/input/fixture.txt"
# The Docker bind mount is read-only; keep host-side temp dir writable for cleanup.
docker run --rm \
  --network none \
  --user 65534:65534 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --read-only \
  --pids-limit 64 \
  --memory 256m \
  --cpus 1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,source=$tmp/input,target=/input,readonly" \
  --mount "type=bind,source=$tmp/output,target=/output,readonly" \
  --env AIEO_SANDBOX=1 \
  node:24-alpine node -e '
    const fs = require("node:fs");
    const net = require("node:net");
    const assert = require("node:assert/strict");
    assert.equal(fs.readFileSync("/input/fixture.txt","utf8"),"fixture-only\n");
    assert.throws(()=>fs.writeFileSync("/input/fixture.txt","tamper"));
    assert.throws(()=>fs.writeFileSync("/output/tamper","tamper"));
    assert.throws(()=>fs.writeFileSync("/unexpected","tamper"));
    assert.equal(process.env.AIEO_SANDBOX,"1");
    assert.equal(process.env.GITHUB_TOKEN,undefined);
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY,undefined);
    assert.equal(process.getuid(),65534);
    const s=net.connect({host:"1.1.1.1",port:443,timeout:1500});
    s.once("connect",()=>{console.error("FAIL: network connected");process.exit(2)});
    s.once("error",()=>{console.log("PASS: offline, non-root, readonly fixture");process.exit(0)});
    s.once("timeout",()=>{s.destroy();console.log("PASS: offline (timeout), non-root, readonly fixture");process.exit(0)});
  '
test ! -e "$tmp/output/tamper"
echo "PASS: fixture sandbox isolation smoke"

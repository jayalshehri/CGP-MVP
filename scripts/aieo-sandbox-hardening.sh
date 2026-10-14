#!/usr/bin/env bash
set -euo pipefail
# Fixture-only. Never applies external patches or accesses production.
AIEO_NODE_IMAGE="${AIEO_NODE_IMAGE:-}"
if [[ ! "$AIEO_NODE_IMAGE" =~ ^node:24-alpine@sha256:[a-f0-9]{64}$ ]]; then
  echo "FAIL: approved immutable image digest required" >&2
  exit 2
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/input"
printf 'fixture-only\n' > "$tmp/input/fixture.txt"
chmod -R a-w "$tmp/input"
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
  --env AIEO_SANDBOX=1 \
  "$AIEO_NODE_IMAGE" node -e '
    const fs = require("node:fs");
    const net = require("node:net");
    const assert = require("node:assert/strict");
    assert.equal(fs.readFileSync("/input/fixture.txt","utf8"),"fixture-only\n");
    assert.throws(()=>fs.writeFileSync("/input/fixture.txt","tamper"));
    assert.throws(()=>fs.writeFileSync("/unexpected","tamper"));
    assert.equal(process.env.AIEO_SANDBOX,"1");
    for(const key of ["GITHUB_TOKEN","SUPABASE_SERVICE_ROLE_KEY","OPENAI_API_KEY"]) assert.equal(process.env[key],undefined);
    assert.equal(process.getuid(),65534);
    const s=net.connect({host:"1.1.1.1",port:443,timeout:2000});
    s.once("connect",()=>{console.error("FAIL: network connected");process.exit(2)});
    s.once("error",(e)=>{
      if(!["ENETUNREACH","EHOSTUNREACH","EACCES","EPERM"].includes(e.code)){console.error("FAIL: "+e.code);process.exit(2)}
      console.log("PASS: offline nonroot readonly fixture");process.exit(0);
    });
    s.once("timeout",()=>{console.error("FAIL: timeout inconclusive");s.destroy();process.exit(2)});
  '
echo "PASS: isolated fixture smoke"

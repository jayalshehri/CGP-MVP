import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const api = "http://127.0.0.1:54321";
const app = "http://127.0.0.1:3847";
const stack = join(process.env.RUNNER_TEMP, "nudee-local-qa");

async function provision() {
  const status = JSON.parse(execFileSync("supabase", ["status", "--workdir", stack, "-o", "json"], {encoding: "utf8"}));
  assert.equal(status.API_URL, api);
  const publicKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  assert.ok(publicKey && adminKey, "Missing disposable local API keys");
  const admin = createClient(api, adminKey, {auth: {persistSession: false, autoRefreshToken: false}});
  const personas = {};
  const profiles = [];
  for (const [name, role, display] of [
    ["office", "data_governance_team", "مراجع المكتب التجريبي"],
    ["owner", "nudee_owner", "مالك المتطلب التجريبي"],
    ["other", "nudee_owner", "مالك آخر للتجربة"],
  ]) {
    const email = `${name}@example.test`;
    const password = randomBytes(32).toString("base64url");
    const {data, error} = await admin.auth.admin.createUser({email, password, email_confirm: true});
    if (error) throw new Error(`Local Auth provisioning failed for ${name}: ${error.message}`);
    assert.match(data.user.id, /^[0-9a-f-]{36}$/);
    profiles.push(`('${data.user.id}', '${role}', '${display}')`);
    personas[name] = {email, password, id: data.user.id};
  }
  // Only fixture setup uses the database administrator. Every workflow write
  // below goes through the normal user interface with a signed-in persona.
  const seed = `
    BEGIN;
    INSERT INTO public.profiles (user_id, role, display_name) VALUES ${profiles.join(",")}
      ON CONFLICT (user_id) DO UPDATE SET role=excluded.role, display_name=excluded.display_name;
    INSERT INTO public.nudee_requirements
      (source_row, domain_name, standard_code, requirement_title, maturity_level, evidence_name)
      VALUES (1,'حوكمة البيانات','QA-01','توثيق سياسة التصنيف','المستوى 1: البناء','سياسة التصنيف التجريبية');
    COMMIT;
  `;
  execFileSync("docker", ["exec", "-i", "supabase_db_nudee-local-qa", "psql", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {input: seed, stdio: ["pipe", "ignore", "inherit"]});
  return {publicKey, personas};
}

const {publicKey, personas} = await provision();
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3847"], {
  env: {...process.env, NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey},
  stdio: ["ignore", "inherit", "inherit"],
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw new Error("Next exited before becoming ready");
    try { ready = (await fetch(app + "/login", {signal: AbortSignal.timeout(10000)})).ok; } catch {}
    if (ready) break;
    await delay(1000);
  }
  assert.ok(ready, "App login page did not become ready");
  const test = spawn("python", ["tests/nudee_real_qa.py"], {stdio: ["pipe", "inherit", "inherit"]});
  const finished = once(test, "exit");
  test.stdin.end(JSON.stringify({api, app, publicKey, personas}));
  const [code] = await finished;
  assert.equal(code, 0, "Real-account integration failed");
} finally {
  server.kill("SIGTERM");
}

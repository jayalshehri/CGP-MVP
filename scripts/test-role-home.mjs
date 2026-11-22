import assert from "node:assert/strict";
import { roleHomePath } from "../lib/workspaces.ts";

// Dedicated data personas must never begin on cybersecurity metrics.
assert.equal(roleHomePath("data_governance_team"), "/data-governance/nudee");
assert.equal(roleHomePath("nudee_owner"), "/data-governance/nudee");

// Preserve the landing route of every pre-existing cybersecurity persona.
for (const role of ["admin", "cybersecurity_team", "control_owner", "nca_external_auditor"]) {
  assert.equal(roleHomePath(role), "/", role);
}

console.log("PASS: role home routes for all six personas (navigation only).");

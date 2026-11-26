import assert from "node:assert/strict";
import { roleHomePath, workspaceHome } from "../lib/workspaces.ts";

// Dedicated data personas must never begin on cybersecurity metrics.
assert.equal(roleHomePath("data_governance_team"), "/data-governance/nudee-dashboard");
assert.equal(roleHomePath("nudee_owner"), "/data-governance/nudee");

// Cybersecurity roles land on their dashboard.
for (const role of ["admin", "cybersecurity_team", "control_owner", "nca_external_auditor"]) {
  assert.equal(roleHomePath(role), "/cybersecurity", role);
}

assert.equal(workspaceHome("admin", "data"), "/data-governance/nudee-dashboard");
assert.equal(workspaceHome("control_owner", "data"), null);
assert.equal(workspaceHome("nudee_owner", "cyber"), null);
console.log("PASS: workspace routes for all six roles");

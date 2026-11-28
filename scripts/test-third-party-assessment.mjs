import assert from "node:assert/strict";
import { test } from "node:test";
import { applicableChecks, blockerCount, scopeComplete } from "../lib/third-party-assessment.ts";

const basic={kind:"standard",access:"none",data:false,service_impact:false,sensitive:false,cloud:false,subcontractors:false,remote_soc:false};
test("basic suppliers do not get irrelevant checks", () => {
  assert.equal(scopeComplete(basic), true);
  assert.deepEqual(applicableChecks(basic), []);
  assert.equal(scopeComplete({...basic,cloud:undefined}),false);
});
test("sensitive managed cloud work checks local operations, vetting and applicable hosting", () => {
  const context={...basic,kind:"managed",access:"privileged",data:true,data_class:"secret",sensitive:true,system_reference:"AST-1",cloud:true,hosting_location:"reference",remote_soc:true};
  const checks=applicableChecks(context);
  assert.equal(scopeComplete(context),true);
  assert.deepEqual(checks.map(c=>c.key),["confidentiality","secure_deletion","incident_response","policy","risk_controls","local_soc","vetting","national_provider","cloud_review","sensitive_hosting"]);
  const states=Object.fromEntries(checks.map(c=>[c.key,{status:"met",reference:"contract"}]));
  assert.equal(blockerCount(context,states),0);
  assert.equal(blockerCount(context,{...states,local_soc:{status:"met",reference:"  "}}),1);
});
test("missing conditional text and contradictory answers are not complete",()=>{
  assert.equal(scopeComplete({...basic,subcontractors:true}),false);
  assert.equal(scopeComplete({...basic,data:true}),false);
  assert.equal(scopeComplete({...basic,sensitive:true,system_reference:"  "}),false);
  assert.equal(scopeComplete({...basic,remote_soc:true}),false);
});

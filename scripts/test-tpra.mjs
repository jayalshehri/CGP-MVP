import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const path = new URL("../lib/tpra.ts", import.meta.url);
const source = await readFile(path,"utf8");
const helper = new URL("./third-party-assessment.ts",path).href;
const {requirements,evidenceMatches,pendingRequirements,signingTrace} = await import(
  "data:text/javascript,"+encodeURIComponent(stripTypeScriptTypes(source.replace('"./third-party-assessment"', JSON.stringify(helper))))
);
const normal={kind:"standard",access:"none",data:false,service_impact:false,sensitive:false,cloud:false,subcontractors:false,remote_soc:false};
const scope={...normal,kind:"managed",sensitive:true,cloud:true,remote_soc:true};
const contract={contract_number:"A",contract_reference:"PR-1",contract_signed_on:"2026-11-29",contract_document_ref:"SIGNED-1",service_stage:"active"};
const cycle={scope,rule_version:"cgp_tprm_v2",review_trigger:"initial",trigger_reference:null,decision:"approved",decided_at:"2026-11-28T10:00:00Z",
  service_snapshot:{contract_reference:"PR-1",contract_number:null},verified_likelihood:null};
test("apply ECC to a basic service and add applicable cloud and CSCC checks only",()=>{
  assert.deepEqual(requirements(normal).map(x=>x.key),["contract_requirements"]);
  assert.deepEqual(requirements(scope,true).map(x=>x.key),["contract_requirements","confidentiality","secure_deletion","incident_response","policy","risk_controls","local_soc","vetting","national_provider","cloud_requirements","cloud_data","cloud_isolation","cloud_review","sensitive_hosting","residual"]);
});
test("only independently accepted evidence bound to the current scope qualifies",()=>{
  const a={...cycle,scope:normal};
  const e={check_key:"contract_requirements",state:"accepted",verification_context:{
    scope:Object.fromEntries(Object.entries(normal).reverse()),contract:"A",reference:"PR-1",
    contract_document:"SIGNED-1",trigger:"initial",trigger_reference:null,
  }};
  assert.equal(evidenceMatches(e,a,contract),true);
  assert.equal(pendingRequirements(a,contract,[e]),0);
  assert.equal(pendingRequirements(a,contract,[{...e,state:"pending"}]),1);
  assert.equal(pendingRequirements(a,{...contract,contract_number:"B"},[e]),1);
});
test("signing uses audited decisions, same-day ambiguity and Riyadh time",()=>{
  assert.equal(signingTrace(contract,[cycle]).key,"confirmed");
  assert.equal(signingTrace(contract,[{...cycle,decided_at:"2026-11-28T22:30:00Z"}]).key,"same_day");
  assert.equal(signingTrace(contract,[{...cycle,decided_at:"2026-11-30T10:00:00Z"}]).key,"late");
  assert.equal(signingTrace(contract,[{...cycle,review_trigger:"periodic"}]).key,"missing");
  assert.equal(signingTrace(contract,[{...cycle,rule_version:"cgp_tprm_v1"}]).key,"missing");
  assert.equal(signingTrace({...contract,service_stage:"renewal"},[cycle]).key,"missing");
  assert.equal(signingTrace({...contract,contract_signed_on:null},[cycle]).key,"signature_missing");
  assert.equal(signingTrace({...contract,service_stage:"pre_contract",contract_signed_on:null},[cycle]).key,"before_signature");
  assert.equal(signingTrace({...contract,contract_reference:"PR-2"},[cycle]).key,"missing");
  assert.equal(signingTrace(contract,[{...cycle,scope:normal}]),null);
});

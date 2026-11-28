import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { legacyLevel, nfcrmLevel, recordId, httpLink } from "../lib/register-methods.ts";
import { registerWorkbook, riskHeaders, vulnerabilityHeaders } from "../lib/register-exports.ts";

test("risk methods disagree intentionally; unassessed is not a numeric rating", () => {
  assert.equal(nfcrmLevel(12), "متوسط");
  assert.equal(legacyLevel(12), "مرتفع");
  assert.equal(nfcrmLevel(20), "كارثي");
  assert.equal(nfcrmLevel(null), "غير مقيّم");
  assert.equal(nfcrmLevel(2), "منخفض جدًا");
  assert.equal(nfcrmLevel(7), "منخفض");
  assert.equal(nfcrmLevel(15), "مرتفع");
});
test("deep links only accept safe positive IDs and references only accept web URLs", () => {
  assert.equal(recordId("86"),86);
  for (const bad of ["1e2","0","-2","02","9007199254740992","1/2"]) assert.equal(recordId(bad),null);
  for (const bad of ["javascript:alert(1)","data:text/html,test","https://person@example.test"]) assert.equal(httpLink(bad),null);
  assert.equal(httpLink("https://example.test"),"https://example.test/");
});
test("the NCA exports preserve 24/19 columns; strings written as strings, not formulas", () => {
  for (const [headers,width,last] of [[riskHeaders,24,"X"],[vulnerabilityHeaders,19,"S"]]) {
    assert.equal(headers.length,width);
    const xlsx=unzipSync(registerWorkbook("السجل",[headers,["=1+1 <test>",12,null]]));
    const xml=strFromU8(xlsx["xl/worksheets/sheet1.xml"]);
    assert.match(xml,/rightToLeft="1"/);
    assert.match(xml,/r="A2" t="inlineStr".*=1\+1 &lt;test&gt;/);
    assert.match(xml,/<c r="B2"><v>12<\/v><\/c>/);
    assert.match(xml,new RegExp(`autoFilter ref="A1:${last}2"`));
    assert.doesNotMatch(xml,/<f[> ]/);
  }
});
test("the previous alert links and asset links keep distinct routes", () => {
  const text=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const assets=text("app/assets/page.tsx"), risks=text("app/risks/page.tsx"), vulnerabilities=text("app/vulnerabilities/page.tsx");
  assert.match(assets,/\/risks\?asset=/);
  assert.match(assets,/\/vulnerabilities\?asset=/);
  assert.match(risks,/params\.get\("risk"\)/);
  assert.match(risks,/params\.get\("filter"\)/);
  assert.match(vulnerabilities,/awaiting_verification/);
});

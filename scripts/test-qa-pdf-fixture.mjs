import assert from 'node:assert/strict';
import { buildMinimalPdf } from './qa-pdf-fixture.mjs';
let checks = 0;
for (const text of ['MDR evidence v1', 'MDR evidence v2 (updated)', 'Vulnerability Management evidence v2 (updated)', 'PAM evidence v2 (updated)', 'parentheses (nested) and backslash \\', 'line\nbreak\r\nwith\ttab', '']) {
  const bytes = buildMinimalPdf(text), pdf = bytes.toString('ascii');
  assert.deepEqual(bytes, buildMinimalPdf(text)); checks++;
  assert.ok(pdf.startsWith('%PDF-1.4\n') && pdf.endsWith('%%EOF\n')); checks++;
  const start = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.equal(pdf.slice(start, start + 4), 'xref'); checks++;
  const entries = pdf.slice(start).split('\n');
  assert.equal(entries[1], '0 6'); checks++;
  for (let id = 1; id <= 5; id++) {
    const offset = Number(entries[id + 2].slice(0, 10));
    assert.ok(pdf.slice(offset).startsWith(`${id} 0 obj\n`), `xref ${id} must point to that object's header`); checks++;
  }
  const match = /\/Length (\d+) >>\nstream\n/.exec(pdf), streamStart = match.index + match[0].length;
  const streamEnd = pdf.indexOf('endstream', streamStart);
  assert.equal(Number(match[1]), Buffer.byteLength(pdf.slice(streamStart, streamEnd), 'ascii')); checks++;
  assert.ok(pdf.includes('/F1 5 0 R') && pdf.includes('5 0 obj\n<< /Type /Font')); checks++;
  assert.ok(!pdf.slice(streamStart, streamEnd).includes('endobj')); checks++;
}
assert.throws(() => buildMinimalPdf('نص غير مدعوم'), TypeError); checks++;
assert.throws(() => buildMinimalPdf(null), TypeError); checks++;
console.log(`PASS: ${checks} deterministic PDF header, stream-byte-length, xref-object-offset, escaping and input-contract assertions; no network or live fixture execution.`);

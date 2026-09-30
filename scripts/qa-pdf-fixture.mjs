// Pure, local synthetic-fixture generator. No Auth, Storage or database access.
// Helvetica's basic ASCII subset is sufficient for the existing QA pilot tags.
export function buildMinimalPdf(text) {
  if (typeof text !== 'string' || !/^[\x20-\x7e\r\n\t]*$/.test(text)) {
    throw new TypeError('QA PDF fixture text must be ASCII');
  }
  const literal = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  const stream = Buffer.from(`BT /F1 12 Tf 10 50 Td (${literal}) Tj ET\n`, 'ascii');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'), stream, Buffer.from('endstream', 'ascii')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'ascii')], offsets = [0];
  let position = parts[0].length;
  for (const [index, body] of objects.entries()) {
    offsets.push(position);
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), Buffer.from(body), Buffer.from('\nendobj\n', 'ascii')]);
    parts.push(object);
    position += object.length;
  }
  const xref = offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`, 'ascii'));
  return Buffer.concat(parts);
}

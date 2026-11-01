// Opt-in synthetic-only OpenRouter canary. Never reads a repository source file.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SYNTHETIC_SOURCE = 'export function normalizeLabel(value) { return value; }\n';
export const SYNTHETIC_EXPECTED = 'export function normalizeLabel(value) { return value.trim(); }\n';
export const SYNTHETIC_PATH = 'synthetic/normalize-label.js';
const URL = 'https://openrouter.ai/api/v1/chat/completions';
const hash = (s) => createHash('sha256').update(s).digest('hex');

export function verifySyntheticProposal(content) {
  let data;
  try { data = JSON.parse(content); } catch { return { status: 'rejected', reason: 'invalid-json' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).sort().join(',') !== 'find,path,replace' ||
      data.path !== SYNTHETIC_PATH ||
      data.find !== 'return value;' ||
      data.replace !== 'return value.trim();') {
    return { status: 'rejected', reason: 'proposal-outside-synthetic-allowlist' };
  }
  const candidate = SYNTHETIC_SOURCE.replace(data.find, data.replace);
  if (candidate !== SYNTHETIC_EXPECTED) return { status: 'rejected', reason: 'candidate-mismatch' };
  return { status: 'passed', sourceSha256: hash(SYNTHETIC_SOURCE), candidateSha256: hash(candidate) };
}

export async function runSyntheticCanary({ apiKey, model, transport = fetch }) {
  if (typeof apiKey !== 'string' || !apiKey.trim() ||
      typeof model !== 'string' || !/^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/i.test(model)) {
    return { status: 'blocked', reason: 'provider-not-configured' };
  }
  const prompt = {
    model, max_tokens: 180, temperature: 0, stream: false,
    messages: [
      { role: 'system', content: 'Return ONLY strict JSON with exactly path, find, replace. No Markdown, explanations, or extra fields. Never call tools.' },
      { role: 'user', content: 'This is an invented, non-sensitive sample, not repository code. For path synthetic/normalize-label.js, replace exactly return value; with return value.trim(); to trim whitespace. Source:\n' + SYNTHETIC_SOURCE }
    ]
  };
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), 20000);
  try {
    const response = await transport(URL, {
      method: 'POST', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: aborter.signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });
    if (!response?.ok || response.redirected) return { status: 'failed', reason: 'provider-http-failed' };
    const stated = response.headers?.get?.('content-length');
    if (stated && /^\d+$/.test(stated) && Number(stated) > 12000) return { status: 'rejected', reason: 'response-too-large' };
    if (typeof response.body?.getReader !== 'function') return { status: 'rejected', reason: 'missing-stream' };
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 12000) {
          await reader.cancel().catch(() => {});
          return { status: 'rejected', reason: 'response-too-large' };
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const buffer = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    let envelope;
    try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
    catch { return { status: 'rejected', reason: 'invalid-provider-json' }; }
    const proposal = envelope?.choices?.[0]?.message?.content;
    if (typeof proposal !== 'string' || proposal.length > 2000) return { status: 'rejected', reason: 'invalid-provider-answer' };
    return verifySyntheticProposal(proposal);
  } catch {
    return { status: 'failed', reason: 'provider-timeout-or-connection' };
  } finally {
    clearTimeout(timer);
  }
}

// This command is deliberately read-only, without git/gh access or file writes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runSyntheticCanary({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL_ID
  });
  console.log(JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
}

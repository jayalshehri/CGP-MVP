// Synthetic-only live OpenRouter gate. Does not read repository source files.
const MODEL = 'openrouter/free';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const ORIGINAL = 'export const label = "Old status";';
export const EXPECTED = 'export const label = "Current status";';
export const TASK = 'Return only one JSON object with exactly keys find and replace. Change the synthetic label Old status to Current status. Copy the complete input line for find and the complete corrected line for replace.';

export function buildSyntheticRequest() {
  return {
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are testing a synthetic one-line JavaScript fixture. Reply with JSON only. No repository code is available.' },
      { role: 'user', content: TASK + '\nSynthetic input:\n' + ORIGINAL }
    ],
    temperature: 0,
    max_tokens: 2048
  };
}

export function validateSyntheticResult(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.choices) || data.choices.length !== 1)
    return { status: 'INCONCLUSIVE', reason: 'Unexpected provider payload' };
  const choice = data.choices[0];
  if (choice.finish_reason !== 'stop' || typeof choice.message?.content !== 'string')
    return { status: 'INCONCLUSIVE', reason: 'Model output incomplete' };
  const raw = choice.message.content.trim();
  if (raw.length > 2048) return { status: 'INCONCLUSIVE', reason: 'Oversized response' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { status: 'INCONCLUSIVE', reason: 'Invalid JSON' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'find,replace') {
    return { status: 'INCONCLUSIVE', reason: 'Unexpected response schema' };
  }
  if (parsed.find !== ORIGINAL || parsed.replace !== EXPECTED)
    return { status: 'INCONCLUSIVE', reason: 'Synthetic fix does not match the approved fixture' };
  return { status: 'PASS', reason: 'Synthetic replacement validated; no source change executed' };
}

export async function runSyntheticLive({ key, transport = fetch } = {}) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('OPENROUTER_API_KEY is not configured');
  const response = await transport(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSyntheticRequest())
  });
  if (!response.ok) return { status: 'INCONCLUSIVE', reason: 'Provider HTTP ' + response.status };
  const data = await response.json();
  return validateSyntheticResult(data);
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const result = await runSyntheticLive({ key: process.env.OPENROUTER_API_KEY });
    console.log(result.status + ': ' + result.reason);
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error('INCONCLUSIVE: ' + (error.message === 'OPENROUTER_API_KEY is not configured' ? error.message : 'Provider request could not be completed'));
    process.exitCode = 1;
  }
}

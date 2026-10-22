// Synthetic and proposal-only: no source files, logs, patches, or application secrets are read.
const key = process.env.AIEO_OPENAI_API_KEY;
if (!key) throw Error('Protected environment key absent');
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);
try {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    signal: controller.signal,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini', store: false, max_output_tokens: 150,
      instructions: 'Give one short conceptual suggestion for a fictional TypeScript fixture. Do not include code or credentials.',
      input: 'Synthetic example only: a string contains broken and should contain fixed.'
    })
  });
  if (!response.ok) throw Error('API HTTP status ' + response.status);
  const result = await response.json();
  if (!result.id || !Array.isArray(result.output)) throw Error('Unexpected API response');
  console.log('PASS: protected synthetic OpenAI request; no response content logged');
} finally { clearTimeout(timer); }

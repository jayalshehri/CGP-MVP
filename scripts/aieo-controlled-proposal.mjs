// AIEO Phase 10: bounded, proposal-only model invocation; never applies patches.
import {writeFileSync, mkdirSync} from 'node:fs';
const apiKey=process.env.AIEO_OPENAI_API_KEY;
if(!apiKey) throw Error('Protected environment API key missing; fail closed');
const model=process.env.AIEO_MODEL || 'gpt-4.1-mini';
if(!/^gpt-[a-zA-Z0-9.-]{1,40}$/.test(model)) throw Error('Model not allowed');
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),20000);
const input='Synthetic fixture: components/AIEOFixture.tsx contains export const value = "broken"; propose a one-line change to "fixed". Do not provide patches, credentials, network calls, or changes to any other file.';
try {
 const response=await fetch('https://api.openai.com/v1/responses',{
  method:'POST',signal:controller.signal,
  headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model,max_output_tokens:250,store:false,instructions:'Return a short plain-language proposal only. Never include secrets or runnable code. The input is a synthetic fixture.',input})
 });
 if(!response.ok) throw Error('Model request failed HTTP '+response.status);
 const body=await response.json();
 const output=(body.output||[]).flatMap(v=>v.content||[]).filter(v=>v.type==='output_text').map(v=>v.text||'').join('\n').slice(0,2400);
 if(!output) throw Error('Empty proposal');
 mkdirSync('aieo-reports',{recursive:true});
 writeFileSync('aieo-reports/phase10-proposal.md','# AIEO synthetic proposal (non-executable)\n\n'+output+'\n');
 console.log('PASS: model proposal captured; no patch or repository write');
}finally{clearTimeout(timeout)}

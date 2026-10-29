// QA-only preflight: no network, GitHub writes, or secrets are printed.
import {readFileSync} from 'node:fs';
export function qaReadiness(env, ref, event) {
 const failures=[];
 if(event!=='workflow_dispatch')failures.push('manual dispatch required');
 if(ref!=='refs/heads/aieo/qa-live-gate-v9')failures.push('unapproved branch');
 if(env.AIEO_ENABLE_LIVE_AI!=='true')failures.push('live AI disabled');
 if(!env.AI_GATEWAY_API_KEY)failures.push('gateway key missing');
 if(!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(env.AIEO_MODEL_ID||''))failures.push('model identifier missing/invalid');
 return {ready:failures.length===0,failures};
}
if(process.argv[1]?.endsWith('/aieo-qa-readiness-v9.mjs')){
 const result=qaReadiness(process.env,process.env.GITHUB_REF,process.env.GITHUB_EVENT_NAME);
 console.log(JSON.stringify({ready:result.ready,failures:result.failures}));
 if(!result.ready)process.exitCode=1;
}

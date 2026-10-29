// AIEO v15: convert a real-file review into a synthetic-only model task.
// Never sends original CGP source, file content, names, secrets or paths to any provider.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspect} from './aieo-cgp-realfile-v14.mjs';
export function prepare(source){
 const review=inspect(source);
 if(review.status!=='review-required')return {status:review.status,allowed:false};
 const task={language:'JavaScript',snippet:'function extractId(path) { return /^\\/items\\/(\\d+)/.exec(path)?.[1] ?? null; }',
  problem:'A numeric route ID must only match if immediately followed by a slash or the end of the path.',
  requiredOutput:'Return a JSON object with corrected_code and explanation. No Markdown.'};
 return {status:'ready-for-manual-review',allowed:true,syntheticOnly:true,task};
}
if(process.argv[1]?.endsWith('/aieo-sanitized-review-v15.mjs')){
 const source=readFileSync('components/FeedbackWidget.tsx','utf8');
 const result=prepare(source);
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/sanitized-v15.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,syntheticOnly:result.syntheticOnly===true}));
}

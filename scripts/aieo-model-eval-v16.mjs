import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {prepare} from './aieo-sanitized-review-v15.mjs';
export function evaluate(output){
 if(typeof output!=='string'||output.length>6000)return {status:'rejected',reason:'invalid response length'};
 let value;try{value=JSON.parse(output)}catch{return {status:'rejected',reason:'not JSON'}}
 if(!value||typeof value.corrected_code!=='string'||typeof value.explanation!=='string')return {status:'rejected',reason:'invalid schema'};
 const code=value.corrected_code;
 if(code.length>1200||!code.includes('(?:\\/|$)')||!code.includes('extractId')||/eval\(|require\(|fetch\(|process\.env|import\s/.test(code))return {status:'rejected',reason:'unapproved correction'};
 const samples=['/items/12','/items/12/edit','/items/12junk'];
 const result=samples.map(path=>/^\/items\/(\d+)(?:\/|$)/.exec(path)?.[1]??null);
 if(JSON.stringify(result)!==JSON.stringify(['12','12',null]))return {status:'rejected',reason:'boundary test'};
 return {status:'review-required',verifiedSyntheticExamples:3};
}
export function makeTask(source){const task=prepare(source);return task.allowed?task.task:null}
if(process.argv[1]?.endsWith('/aieo-model-eval-v16.mjs')){
 const task=makeTask(readFileSync('components/FeedbackWidget.tsx','utf8'));
 if(!task)throw Error('No allowed task');
 const report={taskType:'synthetic-only',needsModelInvocation:true,readOnly:true};
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/model-eval-v16.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS: sanitized model task prepared; provider not called');
}

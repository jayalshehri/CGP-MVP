import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const RULES=new Set(['react-hooks/set-state-in-effect','react-hooks/preserve-manual-memoization','@typescript-eslint/no-unused-vars']);
export function analyze(input){
 if(typeof input!=='string'||input.length>250000)throw Error('Invalid input');
 const results=[];
 const re=/^([^\r\n]+\/(?:app|components|scripts)\/[^\r\n]+\.(?:ts|tsx|mjs)|(?:app|components|scripts)\/[^\r\n]+\.(?:ts|tsx|mjs))\r?\n\s*(\d+):(\d+)\s+(error|warning)\s+([^\r\n]*)\s+([@\w/-]+)\s*$/gm;
 for(const match of input.matchAll(re)){
   const path=match[1].replace(/^.*?\/(?=(?:app|components|scripts)\/)/,'');
   const rule=match[6];
   if(!/^(?:app|components|scripts)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs)$/.test(path)||path.split('/').includes('..'))continue;
   if(!RULES.has(rule))continue;
   results.push({path,line:Number(match[2]),column:Number(match[3]),severity:match[4],rule,summary:match[5].slice(0,240),recommendation:'Manual review required; no automated code changes.'});
   if(results.length>=40)break;
 }
 return {schema:3,readonly:true,diagnostics:results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=readFileSync(process.argv[2]||'scripts/fixtures/aieo-eslint-diagnostics.txt','utf8');
 mkdirSync('aieo-output',{recursive:true});
 const result=analyze(input);
 writeFileSync('aieo-output/diagnostics-v3.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({count:result.diagnostics.length}));
}

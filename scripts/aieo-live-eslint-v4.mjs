// Read-only integration: real ESLint JSON -> diagnostics -> allowlisted proposals.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATALOG,checkProposal} from './aieo-proposal-policy-v2.mjs';
const allowedRules=new Set(['react-hooks/set-state-in-effect','react-hooks/preserve-manual-memoization','@typescript-eslint/no-unused-vars']);
export function correlate(raw,root=process.cwd(),load=(p)=>readFileSync(p,'utf8')){
 if(!Array.isArray(raw)||raw.length>5000)throw Error('Invalid ESLint report');
 const diagnostics=[],proposals=[];
 for(const item of raw){
  if(!item||typeof item.filePath!=='string'||!Array.isArray(item.messages))continue;
  const absolute=resolve(root,item.filePath);
  const path=relative(root,absolute).replaceAll('\\','/');
  if(path.startsWith('../')||path==='..'||isAbsolute(path)||!/^(app|components|scripts)\/[A-Za-z0-9_./-]+\.(tsx|ts|mjs)$/.test(path)||path.split('/').includes('..'))continue;
  for(const m of item.messages.slice(0,100)){
   if(!allowedRules.has(m.ruleId)||!(m.severity===1||m.severity===2))continue;
   diagnostics.push({path,line:m.line??null,column:m.column??null,rule:m.ruleId,severity:m.severity===2?'error':'warning',message:String(m.message||'').slice(0,250)});
  }
 }
 for(const p of CATALOG){
  const related=diagnostics.filter(d=>d.path===p.path && (p.id==='remove-unused-mkdir-import'?d.rule==='@typescript-eslint/no-unused-vars':false));
  if(!related.length)continue;
  try{proposals.push(checkProposal(p,load(resolve(root,p.path))))}
  catch(e){proposals.push({id:p.id,path:p.path,status:'blocked',reason:String(e.message).slice(0,150)})}
 }
 return {schema:4,readonly:true,diagnostics,proposals,summary:{matched:diagnostics.length,proposed:proposals.filter(p=>p.status==='proposed').length,blocked:proposals.filter(p=>p.status==='blocked').length}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=JSON.parse(readFileSync(process.argv[2]||'aieo-output/eslint.json','utf8'));
 const result=correlate(report);
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/live-analysis-v4.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.summary));
}

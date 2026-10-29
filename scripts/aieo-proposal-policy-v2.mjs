// Deterministic read-only proposal catalog, no AI execution or source mutation.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const CATALOG = Object.freeze([
 {id:'feedback-route-boundary',path:'components/FeedbackWidget.tsx',
  before:'const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);',
  after:'const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);',
  rationale:'Require route boundary after control ID'},
 {id:'remove-unused-mkdir-import',path:'scripts/aieo-autonomous-v1.mjs',
  before:"import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';",
  after:"import {readFileSync,writeFileSync} from 'node:fs';",
  rationale:'Remove unused fs import without changing runtime behavior'}
]);
export function checkProposal(p,source){
 if(!CATALOG.some(x=>x.id===p.id && x.path===p.path && x.before===p.before && x.after===p.after))throw Error('Not allowlisted');
 if(!/^(components|scripts)\/[A-Za-z0-9/_-]+\.(tsx|mjs)$/.test(p.path)||p.path.includes('..'))throw Error('Unsafe path');
 if(p.before===p.after||p.before.length>3000||p.after.length>3000)throw Error('Invalid replacement');
 const count=source.split(p.before).length-1;
 const applied=source.includes(p.after);
 if(count!==1 && !(count===0&&applied))throw Error('Source drift or ambiguous match: '+p.id);
 return {id:p.id,path:p.path,status:count===1?'proposed':'already-applied',
  sha256:createHash('sha256').update(source).digest('hex'),
  rationale:p.rationale,before:p.before,after:p.after,changed:count===1};
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 const proposals=CATALOG.map(p=>checkProposal(p,readFileSync(p.path,'utf8')));
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/proposals-v2.json',JSON.stringify({schema:2,readonly:true,proposals},null,2)+'\n');
 console.log(JSON.stringify(proposals.map(x=>({id:x.id,status:x.status}))));
}

// Deterministic, read-only review helpers. Findings are leads, never verified bugs.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const SOURCE_ROOTS = ['app', 'components'];
const EXT = /\.(tsx|ts|jsx|js)$/;
const MAX_FILES = 600;
const MAX_BYTES = 250000;
const rule = (id, category, description, advice, pattern, file) => ({ id, category, description, advice, pattern, file });
const RULES = [
  rule('UX-RTL-INPUT', 'designer', 'Input may require explicit reading direction for email/URL or identifier', 'Review direction of Latin-only fields and their labels', /<input\b[^>]*(?:type=["'](?:email|url)["'])[^>]*>/g, true),
  rule('UX-ALERT-ROLE', 'designer', 'Dynamic error message may be missing an accessible alert role', 'Check whether error feedback is announced using role=alert or an accessible status region', /\{error\s*\?\s*<(?:div|p)\b(?![^>]*role=["']alert["'])/g, true),
  rule('UX-HARD-COLOR', 'designer', 'Hard-coded inline color needs theme/contrast review', 'Review dark-mode contrast and reusable design tokens', /(?:background|color)\s*:\s*["'](?:#[0-9a-fA-F]{3,8}|rgba?\()/g, true),
  rule('DEV-EMPTY-CATCH', 'developer', 'Empty catch may silently swallow failures', 'Verify error handling and reporting at this location', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g, true),
  rule('DEV-CONSOLE-ERROR', 'developer', 'Client-side console error might expose operational details', 'Check redaction and user-facing error handling', /console\.error\s*\(/g, true),
  rule('DEV-UNSAFE-HTML', 'developer', 'Raw HTML injection surface requires independent sanitization review', 'Trace whether HTML is sanitized before rendering', /dangerouslySetInnerHTML\s*=/g, true),
  rule('DEV-CLIENT-QUERY', 'developer', 'Client-side data query requires RLS and error handling review', 'Verify authorization is enforced server-side by RLS and error paths are handled', /supabase\.from\s*\(/g, true),
  rule('DEV-SESSION-CHECK', 'developer', 'Client session check is not itself an authorization boundary', 'Verify sensitive operations rely on database authorization, not this client state', /supabase\.auth\.getSession\s*\(/g, true),
];
export const REVIEW_RULES = RULES.map(({id,category,description,advice})=>({id,category,description,advice}));

export function analyzeSource({filename, source, role}) {
  if (!['designer','developer'].includes(role)) throw new Error('Unsupported review role');
  if (typeof filename !== 'string' || typeof source !== 'string') throw new Error('Invalid source input');
  const findings=[];
  for (const spec of RULES) {
    if (spec.category!==role) continue;
    const rx=new RegExp(spec.pattern.source,spec.pattern.flags);
    for(const match of source.matchAll(rx)) {
      const line = source.slice(0,match.index).split('\n').length;
      findings.push({rule:spec.id,file:filename,line,severity:'review',reason:spec.description,recommendation:spec.advice});
      if(findings.length>=100) break;
    }
  }
  return findings;
}

export function listSourceFiles(root) {
  const files=[];
  for (const name of SOURCE_ROOTS) {
    const base=join(root,name);
    let items;
    try {items=readdirSync(base,{withFileTypes:true});} catch {throw new Error('Required source directory unavailable: '+name);}
    const stack=items.map(item=>join(base,item.name));
    while(stack.length) {
      const file=stack.pop();
      const stat=lstatSync(file);
      if(stat.isSymbolicLink()) continue;
      if(stat.isDirectory()) {
        if(file.split(sep).some(part=>['node_modules','.next','.git','dist'].includes(part))) continue;
        for (const item of readdirSync(file,{withFileTypes:true})) stack.push(join(file,item.name));
      } else if(stat.isFile()&&EXT.test(file)&&stat.size<=MAX_BYTES) {
        files.push(file);
        if(files.length>MAX_FILES)throw new Error('Review file count exceeds bound');
      }
    }
  }
  return files.sort();
}

export function reviewRepository(root,role) {
  const files=listSourceFiles(root);
  const findings=[];
  const hashes=[];
  for(const file of files){
    const source=readFileSync(file,'utf8');
    const filename=relative(root,file).split(sep).join('/');
    hashes.push(filename+':'+createHash('sha256').update(source).digest('hex'));
    findings.push(...analyzeSource({filename,source,role}));
  }
  findings.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.rule.localeCompare(b.rule));
  const counts={};
  for(const f of findings)counts[f.rule]=(counts[f.rule]||0)+1;
  return {schemaVersion:1,role,mode:'read-only-static-review',scope:SOURCE_ROOTS,filesReviewed:files.length,
    sourceManifestHash:createHash('sha256').update(hashes.join('\n')).digest('hex'),
    findingCount:findings.length,ruleCounts:counts,findings:findings.slice(0,120),
    limitedToFirst:120,verdict:'human-review-required',
    limitations:['Heuristic observations are not verified bugs','No browser, login, QA data or model/provider invocation','No fixes, pull requests, merges or deployment']};
}

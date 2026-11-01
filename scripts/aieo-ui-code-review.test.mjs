import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeSource, reviewRepository } from '../aieo/lib/ui-code-review.mjs';

test('Designer identifies actionable accessibility and styling leads without source excerpts',()=>{
 const r=analyzeSource({filename:'app/login/page.tsx',role:'designer',
   source:'<input type="email" />\n{error ? <div>error</div> : null}\nconst style = { color: "#fff" };'});
 assert.deepEqual(r.map(x=>x.rule),['UX-RTL-INPUT','UX-ALERT-ROLE','UX-HARD-COLOR']);
 assert.ok(r.every(x=>!JSON.stringify(x).includes('const style')));
});
test('Developer identifies bounded code review leads',()=>{
 const r=analyzeSource({filename:'components/Test.tsx',role:'developer',
   source:'try { go() } catch(e) {}\nconsole.error(e)\n<div dangerouslySetInnerHTML={{__html: content}} />'});
 assert.deepEqual(r.map(x=>x.rule),['DEV-EMPTY-CATCH','DEV-CONSOLE-ERROR','DEV-UNSAFE-HTML']);
});
test('Rejects unsupported role',()=>assert.throws(()=>analyzeSource({filename:'x',source:'',role:'security'})));
test('A source manifest is deterministic and source changes alter its digest',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aieo-review-'));
 try{
   mkdirSync(join(dir,'app')); mkdirSync(join(dir,'components'));
   writeFileSync(join(dir,'app','page.tsx'),'<input type="email"/>');
   writeFileSync(join(dir,'components','a.tsx'),'const x=1;');
   const a=reviewRepository(dir,'designer'), b=reviewRepository(dir,'designer');
   assert.deepEqual(a,b);assert.equal(a.filesReviewed,2);
   writeFileSync(join(dir,'components','a.tsx'),'const x=2;');
   assert.notEqual(reviewRepository(dir,'designer').sourceManifestHash,a.sourceManifestHash);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Symlinks are not followed into confidential files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aieo-review-'));
 try{
   mkdirSync(join(dir,'app'));mkdirSync(join(dir,'components'));
   const secret=join(dir,'secret.tsx');writeFileSync(secret,'console.error("SECRET")');
   symlinkSync(secret,join(dir,'app','secret.tsx'));
   writeFileSync(join(dir,'app','page.tsx'),'export default function Page(){return null}');
   const r=reviewRepository(dir,'developer');assert.equal(r.filesReviewed,1);assert.equal(r.findingCount,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Developer reports client-side Supabase query and session review leads',()=>{
 const r=analyzeSource({filename:'app/login/page.tsx',role:'developer',
   source:'await supabase.auth.getSession();\nawait supabase.from("controls").select("*");'});
 assert.deepEqual(r.map(x=>x.rule),['DEV-CLIENT-QUERY','DEV-SESSION-CHECK']);
 assert.ok(r.every(x=>x.severity==='review'));
});

test('Designer does not flag email input already marked LTR',()=>{
 const r=analyzeSource({filename:'app/login/page.tsx',role:'designer',
  source:'<input dir="ltr" id="email" type="email" />\n<input type="email" />'});
 assert.deepEqual(r.map(x=>x.rule),['UX-RTL-INPUT']);
 assert.equal(r[0].line,2);
});
test('Report includes all matching findings within the 500-location bound',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aieo-review-'));
 try {
   mkdirSync(join(dir,'app'));mkdirSync(join(dir,'components'));
   writeFileSync(join(dir,'app','page.tsx'),Array(131).fill('supabase.from("controls");').join('\n'));
   const r=reviewRepository(dir,'developer');
   assert.equal(r.findingCount,131);
   assert.equal(r.findings.length,131);
   assert.equal(r.limitedToFirst,500);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

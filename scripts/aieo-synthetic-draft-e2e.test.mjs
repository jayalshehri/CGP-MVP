// Credential-free integration test of the EXACT shell used by the synthetic Draft PR pilot.
// An isolated local bare remote and fake "gh" client are used. This does not prove
// that GitHub Actions has permission to create a real GitHub Draft PR.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync(new URL('../.github/workflows/aieo-synthetic-draft-pr-pilot.yml',import.meta.url),'utf8');
const publisher=workflow.split('      - name: Publish synthetic proof as a Draft PR, never merge\n')[1];
assert.ok(publisher,'pilot publisher step required');
const block=publisher.split('        run: |\n')[1];
assert.ok(block,'shell must be an unmodified YAML literal');
const shell=block.split('\n').filter(x=>!x||x.startsWith('          ')).map(x=>x.startsWith('          ')?x.slice(10):x).join('\n');
assert.match(shell,/gh pr create/);

function cmd(exe,args,opts={}){
  const r=spawnSync(exe,args,{encoding:'utf8',...opts});
  if(r.error)throw r.error;
  return r;
}
function git(cwd,...args){
  const r=cmd('git',args,{cwd,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});
  assert.equal(r.status,0,'git '+args.join(' ')+': '+r.stderr);
  return r.stdout.trim();
}
function fixture({response='valid',env={},dirty=false}={}){
  const root=mkdtempSync(join(tmpdir(),'aieo-synthetic-pr-'));
  try{
    const work=join(root,'work'), remote=join(root,'origin.git'),bin=join(root,'bin');
    mkdirSync(work);mkdirSync(bin);
    git(root,'init','--bare',remote);git(work,'init','-b','main');
    git(work,'config','user.name','Synthetic Test');
    git(work,'config','user.email','synthetic@example.invalid');
    writeFileSync(join(work,'README.md'),'# Synthetic only\n');
    git(work,'add','README.md');git(work,'commit','-m','initial test fixture');
    git(work,'remote','add','origin',remote);git(work,'push','-u','origin','main');
    const mainSHA=git(work,'rev-parse','main');
    if(dirty)writeFileSync(join(work,'untracked.txt'),'dirty\n');
    // Only the fake gh executable is supplied; Git itself pushes to a local bare repo.
    const gh=[
      '#!/usr/bin/env node',
      "const fs=require('node:fs');",
      'const a=process.argv.slice(2);',
      "fs.appendFileSync(process.env.AIEO_GH_LOG,a.join(' ')+'\\n');",
      "if(a[0]==='auth'&&a[1]==='setup-git')process.exit(0);",
      "if(a[0]==='pr'&&a[1]==='create'){",
      "  if(!a.includes('--draft')||!a.includes('--base')||!a.includes('--head'))process.exit(3);",
      "  console.log('https://github.invalid/CGP-MVP/pull/999');process.exit(0);",
      '}',
      "if(a[0]==='pr'&&a[1]==='view'){",
      '  const id=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;',
      "  const branch='aieo/synthetic-draft-proof-'+id+'-'+attempt;",
      "  const file='docs/aieo-evidence/synthetic-pr-'+id+'-'+attempt+'.md';",
      "  const r={isDraft:true,baseRefName:'main',headRefName:branch,files:[{path:file}]};",
      '  switch(process.env.AIEO_FAKE_RESPONSE){',
      "    case 'not-draft':r.isDraft=false;break;",
      "    case 'wrong-head':r.headRefName='other';break;",
      "    case 'wrong-base':r.baseRefName='other';break;",
      "    case 'extra-file':r.files.push({path:'components/FeedbackWidget.tsx'});break;",
      "    case 'invalid-json':console.log('{invalid');process.exit(0);",
      '  }',
      '  console.log(JSON.stringify(r));process.exit(0);',
      '}',
      'process.exit(4);'
    ].join('\n')+'\n';
    writeFileSync(join(bin,'gh'),gh,{mode:0o755});
    const log=join(root,'gh.log');writeFileSync(log,'');
    const runEnv={
      ...process.env,PATH:bin+':'+process.env.PATH,
      GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
      GITHUB_REPOSITORY:'jayalshehri/CGP-MVP',GITHUB_RUN_ID:'90122012',
      GITHUB_RUN_ATTEMPT:'1',AIEO_FAKE_RESPONSE:response,
      AIEO_GH_LOG:log,GH_TOKEN:'synthetic-only-no-token',
      GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',...env
    };
    const r=cmd('bash',['-e','-o','pipefail','-c',shell],{cwd:work,env:runEnv,timeout:15000});
    return {status:r.status,stderr:r.stderr,log:readFileSync(log,'utf8'),
      mainSHA,afterMain:git(work,'rev-parse','main'),
      remoteBranch:git(work,'ls-remote','--heads','origin','aieo/synthetic-draft-proof-*'),
      changed:git(work,'diff','--name-only','main...HEAD'),
      evidence:existsSync(join(work,'docs/aieo-evidence/synthetic-pr-90122012-1.md'))};
  }finally{rmSync(root,{recursive:true,force:true});}
}

test('actual publisher script pushes a single synthetic file and validates Draft state',()=>{
  const r=fixture();
  assert.equal(r.status,0,r.stderr);
  assert.equal(r.mainSHA,r.afterMain);
  assert.equal(r.changed,'docs/aieo-evidence/synthetic-pr-90122012-1.md');
  assert.equal(r.evidence,true);
  assert.match(r.remoteBranch,/refs\/heads\/aieo\/synthetic-draft-proof-90122012-1/);
  assert.match(r.log,/pr create .*--draft --base main --head aieo\/synthetic-draft-proof-90122012-1/);
  assert.match(r.log,/pr view https:\/\/github.invalid\/CGP-MVP\/pull\/999/);
  assert.doesNotMatch(r.log,/pr merge|release|delete/);
});
for(const response of ['not-draft','wrong-head','wrong-base','extra-file','invalid-json']){
  test('publisher rejects remote attestation: '+response,()=>{
    const r=fixture({response});
    assert.notEqual(r.status,0);
    assert.equal(r.mainSHA,r.afterMain);
    assert.match(r.log,/pr view /);
  });
}
for(const [name,env] of [
  ['non-main branch',{GITHUB_REF:'refs/heads/development'}],
  ['non-manual event',{GITHUB_EVENT_NAME:'pull_request'}],
  ['foreign repository',{GITHUB_REPOSITORY:'untrusted/fork'}],
  ['malformed run ID',{GITHUB_RUN_ID:'12;echo'}],
  ['malformed run attempt',{GITHUB_RUN_ATTEMPT:'../3'}],
]){
  test('publisher refuses '+name+' before any GitHub command',()=>{
    const r=fixture({env});
    assert.notEqual(r.status,0);
    assert.equal(r.log,'');
    assert.equal(r.mainSHA,r.afterMain);
    assert.equal(r.remoteBranch,'');
  });
}
test('publisher refuses dirty workspace before creating branch',()=>{
  const r=fixture({dirty:true});
  assert.notEqual(r.status,0);
  assert.equal(r.log,'');
  assert.equal(r.mainSHA,r.afterMain);
  assert.equal(r.remoteBranch,'');
});

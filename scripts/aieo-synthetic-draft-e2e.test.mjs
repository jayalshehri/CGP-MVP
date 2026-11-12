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
      "const cp=require('node:child_process');",
      "const git=(ref)=>cp.execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();",
      'const a=process.argv.slice(2);',
      "fs.appendFileSync(process.env.AIEO_GH_LOG,a.join(' ')+'\\n');",
      "if(a[0]==='auth'&&a[1]==='setup-git')process.exit(0);",
      "if(a[0]==='pr'&&a[1]==='create'){",
      "  if(!a.includes('--draft')||!a.includes('--base')||!a.includes('--head'))process.exit(3);",
      "  console.log(process.env.AIEO_FAKE_RESPONSE==='created-foreign-url'?'https://github.com/untrusted/repo/pull/999':'https://github.com/jayalshehri/CGP-MVP/pull/999');process.exit(0);",
      '}',
      "if(a[0]==='pr'&&a[1]==='view'){",
      '  const id=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;',
      "  const branch='aieo/synthetic-draft-proof-'+id+'-'+attempt;",
      "  const file='docs/aieo-evidence/synthetic-pr-'+id+'-'+attempt+'.md';",
      "  const r={url:'https://github.com/jayalshehri/CGP-MVP/pull/999',state:'OPEN',isDraft:true,baseRefName:'main',headRefName:branch,baseRefOid:git('main'),headRefOid:git('HEAD'),headRepository:{nameWithOwner:'jayalshehri/CGP-MVP'},headRepositoryOwner:{login:'jayalshehri'},files:[{path:file}]};",
      '  switch(process.env.AIEO_FAKE_RESPONSE){',
      "    case 'not-draft':r.isDraft=false;break;",
      "    case 'closed-pr':r.state='CLOSED';break;",
      "    case 'wrong-view-url':r.url='https://github.com/jayalshehri/CGP-MVP/pull/1000';break;",
      "    case 'wrong-head':r.headRefName='other';break;",
      "    case 'wrong-base':r.baseRefName='other';break;",
      "    case 'wrong-base-oid':r.baseRefOid='0'.repeat(40);break;",
      "    case 'wrong-head-oid':r.headRefOid='0'.repeat(40);break;",
      "    case 'foreign-head-repository':r.headRepository.nameWithOwner='untrusted/CGP-MVP';break;",
      "    case 'foreign-head-owner':r.headRepositoryOwner.login='untrusted';break;",
      "    case 'missing-head-repository':r.headRepository=null;break;",
      "    case 'missing-head-owner':r.headRepositoryOwner=null;break;",
      "    case 'extra-file':r.files.push({path:'components/FeedbackWidget.tsx'});break;",
      "    case 'invalid-json':console.log('{invalid');process.exit(0);",
      '  }',
      '  console.log(JSON.stringify(r));process.exit(0);',
      '}',
      "if(a[0]==='api'&&a[1]==='repos/jayalshehri/CGP-MVP/pulls/999'){",
      "  const r={number:999,url:'https://github.com/jayalshehri/CGP-MVP/pull/999',login:'github-actions[bot]',id:41898282,type:'Bot'};",
      '  switch(process.env.AIEO_FAKE_RESPONSE){',
      "    case 'human-author':r.login='jayalshehri';break;",
      "    case 'forged-bot-id':r.id=191056639;break;",
      "    case 'non-bot-author':r.type='User';break;",
      "    case 'wrong-rest-pr':r.number=1000;break;",
      "    case 'wrong-rest-url':r.url='https://github.com/jayalshehri/CGP-MVP/pull/1000';break;",
      "    case 'missing-rest-author':r.login=null;r.id=null;r.type=null;break;",
      "    case 'invalid-rest-json':console.log('{invalid');process.exit(0);",
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
  assert.match(r.log,/pr view https:\/\/github.com\/jayalshehri\/CGP-MVP\/pull\/999/);
  assert.match(r.log,/--json url,state,isDraft,baseRefName,headRefName,baseRefOid,headRefOid,headRepository,headRepositoryOwner,files/);
  assert.match(r.log,/api repos\/jayalshehri\/CGP-MVP\/pulls\/999 --jq/);
  assert.doesNotMatch(r.log,/pr merge|release|delete/);
});
for(const response of ['not-draft','closed-pr','wrong-view-url','wrong-head','wrong-base','wrong-base-oid','wrong-head-oid','foreign-head-repository','foreign-head-owner','missing-head-repository','missing-head-owner','extra-file','invalid-json']){
  test('publisher rejects remote attestation: '+response,()=>{
    const r=fixture({response});
    assert.notEqual(r.status,0);
    assert.equal(r.mainSHA,r.afterMain);
    assert.match(r.log,/pr view /);
  });
}
for(const response of ['human-author','forged-bot-id','non-bot-author','wrong-rest-pr','wrong-rest-url','missing-rest-author','invalid-rest-json']){
  test('publisher rejects non-attested REST bot author: '+response,()=>{
    const r=fixture({response});
    assert.notEqual(r.status,0);
    assert.equal(r.mainSHA,r.afterMain);
    assert.match(r.log,/pr view /);
    assert.match(r.log,/api repos\/jayalshehri\/CGP-MVP\/pulls\/999/);
  });
}
test('publisher rejects an unexpected cross-repository creation URL before PR lookup',()=>{
  const r=fixture({response:'created-foreign-url'});
  assert.notEqual(r.status,0);
  assert.equal(r.mainSHA,r.afterMain);
  assert.doesNotMatch(r.log,/pr view /);
});
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyze} from './aieo-diagnostics-v3.mjs';
test('extract known lint diagnostics',()=>{
 const x=analyze(readFileSync('scripts/fixtures/aieo-eslint-diagnostics.txt','utf8'));
 assert.equal(x.diagnostics.length,2);
 assert.equal(x.diagnostics[0].path,'components/AppShell.tsx');
 assert.equal(x.readonly,true);
});
test('ignore malicious/unapproved diagnostic paths',()=>{
 const x=analyze('../.env\n  1:1  error  bad  react-hooks/set-state-in-effect\ncomponents/../../.env.tsx\n  1:1  error  bad  react-hooks/set-state-in-effect');
 assert.equal(x.diagnostics.length,0);
});
test('ignore unsupported rules and limit input size',()=>{
 assert.equal(analyze('app/page.tsx\n  1:1  error  no  custom/danger').diagnostics.length,0);
 assert.throws(()=>analyze('x'.repeat(250001)),/Invalid input/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate} from './aieo-model-eval-v16.mjs';
test('approved synthetic fix only becomes review item',()=>{
 const r=evaluate(JSON.stringify({corrected_code:'function extractId(path) { return /^\\/items\\/(\\d+)(?:\\/|$)/.exec(path)?.[1] ?? null; }',explanation:'Require route boundary'}));
 assert.equal(r.status,'review-required');
});
test('malformed or unsafe replies rejected',()=>{
 assert.equal(evaluate('not json').status,'rejected');
 assert.equal(evaluate(JSON.stringify({corrected_code:'eval("bad")',explanation:'x'})).status,'rejected');
});

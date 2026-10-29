import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare} from './aieo-sanitized-review-v15.mjs';
const vulnerable='const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
test('real-file finding becomes synthetic example only',()=>{
 const x=prepare(vulnerable);
 assert.equal(x.allowed,true);
 const serialized=JSON.stringify(x.task);
 assert.equal(serialized.includes('FeedbackWidget'),false);
 assert.equal(serialized.includes('controls'),false);
 assert.equal(serialized.includes('supabase'),false);
});
test('unexpected source never creates provider task',()=>{
 assert.equal(prepare('unrecognized source').allowed,false);
});

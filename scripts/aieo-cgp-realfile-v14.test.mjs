import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from './aieo-cgp-realfile-v14.mjs';
const before='const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const after='const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
test('one exact vulnerable match results in review-only proposal',()=>assert.equal(inspect(before).status,'review-required'));
test('already fixed code is detected',()=>assert.equal(inspect(after).status,'already-fixed'));
test('source drift fails closed',()=>assert.equal(inspect('unrelated content').status,'blocked'));
test('ambiguous duplicate fails closed',()=>assert.equal(inspect(before+before).status,'blocked'));

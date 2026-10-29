import test from 'node:test';
import assert from 'node:assert/strict';
import {qaReadiness} from './aieo-qa-readiness-v9.mjs';
const good={AIEO_ENABLE_LIVE_AI:'true',AI_GATEWAY_API_KEY:'mock-secret',AIEO_MODEL_ID:'test/mock'};
test('QA setup is fail-closed by default',()=>{assert.equal(qaReadiness({},'refs/heads/main','push').ready,false)});
test('only approved manual branch and full configuration pass',()=>{assert.equal(qaReadiness(good,'refs/heads/aieo/qa-live-gate-v9','workflow_dispatch').ready,true)});
test('do not leak secrets to diagnostics',()=>{const x=JSON.stringify(qaReadiness({...good,AIEO_ENABLE_LIVE_AI:'false'},'refs/heads/aieo/qa-live-gate-v9','workflow_dispatch'));assert.equal(x.includes('mock-secret'),false)});
test('unapproved branch fails even if configured',()=>{assert.equal(qaReadiness(good,'refs/heads/main','workflow_dispatch').ready,false)});

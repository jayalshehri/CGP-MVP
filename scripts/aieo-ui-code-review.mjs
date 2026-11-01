// Safe local/CI reviewer: no network, credentials, or repository writes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { reviewRepository } from '../aieo/lib/ui-code-review.mjs';
const role=process.argv[2];
if(!['designer','developer'].includes(role))throw new Error('Expected designer or developer');
const result=reviewRepository(resolve('.'),role);
mkdirSync('aieo-output',{recursive:true});
writeFileSync('aieo-output/'+role+'-review.json',JSON.stringify(result,null,2)+'\n',{flag:'w'});
console.log(JSON.stringify({role,status:'review-produced',filesReviewed:result.filesReviewed,findings:result.findingCount,readOnly:true}));

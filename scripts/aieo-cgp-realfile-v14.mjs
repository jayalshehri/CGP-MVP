// AIEO v14: inspect actual CGP source and emit a review-only proposal.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path='components/FeedbackWidget.tsx';
const original='const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const repaired='const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
export function inspect(source){
 const matches=source.split(original).length-1;
 if(matches===1&&!source.includes(repaired))return {status:'review-required',file:path,reason:'Control IDs may match invalid route suffixes',old:original,proposed:repaired};
 if(matches===0&&source.includes(repaired))return {status:'already-fixed',file:path};
 return {status:'blocked',file:path,reason:'Unexpected source contents; do not create a patch'};
}
if(process.argv[1]?.endsWith('/aieo-cgp-realfile-v14.mjs')){
 const source=readFileSync(path,'utf8'),result=inspect(source);
 const report={schema:14,readOnly:true,sourceSha256:createHash('sha256').update(source).digest('hex'),...result};
 mkdirSync('aieo-output',{recursive:true});
 writeFileSync('aieo-output/cgp-realfile-v14.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({file:report.file,status:report.status,readOnly:true}));
 if(report.status==='blocked')process.exitCode=1;
}

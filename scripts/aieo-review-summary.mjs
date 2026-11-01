// Deterministic consolidation of independent static reviews; no model or external calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function consolidate(designer, developer) {
  if (!designer || !developer ||
      designer.role !== 'designer' || developer.role !== 'developer' ||
      designer.schemaVersion !== 1 || developer.schemaVersion !== 1 ||
      designer.mode !== 'read-only-static-review' || developer.mode !== 'read-only-static-review' ||
      !/^[a-f0-9]{64}$/.test(designer.sourceManifestHash) ||
      designer.sourceManifestHash !== developer.sourceManifestHash ||
      !Number.isInteger(designer.filesReviewed) || designer.filesReviewed <= 0 ||
      designer.filesReviewed !== developer.filesReviewed) {
    throw Error('Mismatched or untrusted review reports');
  }
  const allowedDesigner = new Set(['UX-RTL-INPUT','UX-ALERT-ROLE','UX-HARD-COLOR']);
  const allowedDeveloper = new Set(['DEV-EMPTY-CATCH','DEV-CONSOLE-ERROR','DEV-UNSAFE-HTML','DEV-CLIENT-QUERY','DEV-SESSION-CHECK']);
  for (const [report, allowed] of [[designer,allowedDesigner],[developer,allowedDeveloper]]) {
    if (!Number.isInteger(report.findingCount) || report.findingCount < 0 ||
        !Array.isArray(report.findings) ||
        report.findings.length !== Math.min(report.findingCount,120) ||
        !report.ruleCounts || typeof report.ruleCounts !== 'object') throw Error('Invalid report counts');
    const total=Object.values(report.ruleCounts).reduce((sum,x) => {
      if (!Number.isInteger(x) || x < 0) throw Error('Invalid rule count');
      return sum+x;
    },0);
    if(total!==report.findingCount || Object.keys(report.ruleCounts).some(x=>!allowed.has(x))) throw Error('Unknown rule or inconsistent totals');
    for(const f of report.findings) {
      if(!f || !allowed.has(f.rule) || !Number.isInteger(f.line) || f.line<1 ||
         typeof f.file !== 'string' ||
         !/^(?:app|components)\/[a-zA-Z0-9_./\[\]-]+\.(?:tsx|ts|jsx|js)$/.test(f.file) ||
         f.file.split('/').includes('..') || f.severity!=='review') throw Error('Invalid finding metadata');
    }
  }
  const counts=Object.entries({...designer.ruleCounts,...developer.ruleCounts})
    .map(([rule, count])=>({rule,count,priority:
      ['UX-RTL-INPUT','UX-ALERT-ROLE','DEV-UNSAFE-HTML','DEV-EMPTY-CATCH'].includes(rule) ? 'P1-review' :
      ['DEV-SESSION-CHECK','DEV-CLIENT-QUERY'].includes(rule) ? 'P2-review' : 'P3-review'
    }))
    .sort((a,b)=>a.priority.localeCompare(b.priority)||b.count-a.count||a.rule.localeCompare(b.rule));
  const hotspots=new Map();
  for(const r of [designer, developer]) {
    for(const finding of r.findings) {
      const key=finding.file;
      const item=hotspots.get(key) || {file:key,designerSample:0,developerSample:0};
      if(r.role==='designer')item.designerSample++;
      else item.developerSample++;
      hotspots.set(key,item);
    }
  }
  const topFiles=[...hotspots.values()].sort((a,b)=>
    (b.designerSample+b.developerSample)-(a.designerSample+a.developerSample) || a.file.localeCompare(b.file)).slice(0,12);
  return {
    schemaVersion:1,mode:'review-only',status:'human-triage-required',
    sourceManifestHash:designer.sourceManifestHash,filesReviewed:designer.filesReviewed,
    totalReviewLeads:designer.findingCount+developer.findingCount,
    roleCounts:{designer:designer.findingCount,developer:developer.findingCount},
    rulePriorities:counts,
    topFilesFromSample:topFiles,
    sampledFindings:{designer:designer.findings.length,developer:developer.findings.length},
    warning:'Heuristic leads, not confirmed defects; developer file ranking may omit findings beyond 120-item sample.',
    recommendedActions:['Check LTR input direction and accessible error announcements','Review client Supabase operations against RLS and errors','Validate hardcoded color contrast in actual browser','Perform actual role-based QA before release'],
    requiresHumanApproval:true,codeModified:false,deployPerformed:false
  };
}
const invoked=process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname);
if(invoked) {
  const designer=JSON.parse(readFileSync('aieo-output/designer-review.json','utf8'));
  const developer=JSON.parse(readFileSync('aieo-output/developer-review.json','utf8'));
  const result=consolidate(designer,developer);
  writeFileSync('aieo-output/review-summary.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,totalReviewLeads:result.totalReviewLeads,filesReviewed:result.filesReviewed,sourceMatched:true}));
}

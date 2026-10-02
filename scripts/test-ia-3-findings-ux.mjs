// IA-3 presentation regression: synthetic render only; no live Supabase access or writes.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {posix} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('app/findings/page.tsx',root),'utf8');
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
function load(path,sourceContext={state:'loading',frameworkCode:null,controlCode:null,controlTitle:null,controlAvailable:false},evidenceRows=[]){
  const cache=new Map();
  function compile(file){
    if(cache.has(file))return cache.get(file);
    const loadedModule={exports:{}};cache.set(file,loadedModule.exports);
    const code=ts.transpileModule(readFileSync(new URL(file,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+
      (file==='app/findings/page.tsx'?'\nexports.FindingDetailTest=FindingDetail;exports.CorrectiveActionCardTest=CorrectiveActionCard;':'');
    const resolve=name=>{
      if(name.endsWith('.css'))return {};
      if(name==='react')return {...React,useEffect:()=>{},useState:initial=>[initial?.state==='loading'&&'rows' in initial?{state:'ready',rows:evidenceRows}:initial?.state==='loading'?sourceContext:initial,()=>{}]};
      if(name==='next/link')return {__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
      if(name==='next/navigation')return {useRouter(){throw new Error('navigation is not used in static IA-3 render');},useSearchParams(){throw new Error('navigation is not used in static IA-3 render');}};
      if(name==='@/lib/supabase')return {supabase:{rpc(){throw new Error('effects must not run in static IA-3 render');},from(){throw new Error('effects must not run in static IA-3 render');}}};
      if(name==='@/lib/auth')return {requireProfile(){throw new Error('live auth forbidden');}};
      if(name.startsWith('@/')){const relative=name.slice(2);return compile(relative+(existsSync(new URL(relative+'.tsx',root))?'.tsx':'.ts'));}
      if(name.startsWith('.')){const relative=posix.join(posix.dirname(file),name);return compile(relative+(existsSync(new URL(relative+'.tsx',root))?'.tsx':'.ts'));}
      return require(name);
    };
    vm.runInNewContext(code,{exports:loadedModule.exports,module:loadedModule,require:resolve,Date,Intl,URLSearchParams,console},{filename:file});
    return loadedModule.exports;
  }
  return compile(path);
}
const finding={id:41,reference_code:'FND-41',source_type:'assessment',source_record_id:91,assessment_cycle_id:7,
  control_id:12,framework_id:3,title:'ملاحظة عربية طويلة '.repeat(12),description:'وصف الملاحظة',severity:'high',owner_id:'owner',
  status:'pending_verification',due_date:'2026-09-01',identified_date:'2026-08-01',verification_status:'pending',
  verification_evidence_id:501,verification_reason:null,verified_by:null,verified_at:null,closure_reason:null,closed_by:null,
  closed_at:null,created_by:'creator',revision:1};
const action={id:74,finding_id:41,title:'إصلاح السبب',description:'المعالجة',owner_id:'owner',due_date:'2026-09-15',status:'completed',
  completed_at:'2026-09-14',completed_by:'owner',completion_note:'اكتمل العمل',verification_status:'pending',
  verification_evidence_id:502,verification_reason:null,verified_by:null,verified_at:null,reference_note:null,revision:1};
function renderDetail(record=finding,actions=[action],role='cybersecurity_team',actor='reviewer',context,evidenceRows=[
  {id:501,version_number:3,file_name:'finding.pdf',evidence_name:'دليل الملاحظة',link_id:null},
  {id:502,version_number:2,file_name:'action.pdf',evidence_name:'دليل الإجراء',link_id:7},
]){
  const component=load('app/findings/page.tsx',context,evidenceRows);
  return renderToStaticMarkup(React.createElement(component.FindingDetailTest,{finding:record,actions,role,actor,
    people:[{user_id:'owner',display_name:'مالك الضابط',role:'control_owner'}],busy:false,
    navigationContext:'from=review&framework=DCC&control=12&my_context=attention%3D1',run(){throw new Error('no mutation in render');}}));
}
const available={state:'available',frameworkCode:'DCC',controlCode:'DCC-1',controlTitle:'ضابط تجريبي',controlAvailable:true};
const html=renderDetail(finding,[action,{...action,id:75,title:'إجراء ثان',status:'open',completed_at:null,verification_status:'not_submitted'}],'cybersecurity_team','reviewer',available);
check(html.includes('FND-41')&&html.includes('المصدر والسياق')&&html.includes('الإجراءات التصحيحية (2)'), 'Finding remains parent of two independent actions');
check(html.includes('إصلاح السبب')&&html.includes('إجراء ثان')&&html.includes('بانتظار تحقق مستقل'), 'multiple action states are individually legible');
check(html.includes('فتح بند التقييم المحدد')&&html.includes('cycle=7')&&html.includes('item=91')&&html.includes('DCC-1'), 'exact authorized source and control context');
check(html.includes('دليل تحقق الملاحظة')&&html.includes('الإصدار 3 · مباشر · #501')&&html.includes('الإصدار 2 · مشترك · #502'), 'exact historical version IDs and direct/shared association');
check(html.includes('id="finding-decision"')&&html.includes('id="finding-closure"')&&html.includes('التحقق المستقل')&&html.includes('الإغلاق'), 'verification and closure remain separate destinations');
check(!html.includes('إغلاق بقرار مستقل'), 'pending verification cannot shortcut closure');
check(html.includes('from=review')&&html.includes('review_context='), 'Control 360 Review return context retained');
const accepted=renderDetail({...finding,verification_status:'accepted',verified_by:'reviewer',verified_at:'2026-09-20'},[action],'cybersecurity_team','reviewer',available);
check(accepted.includes('إغلاق بقرار مستقل')&&accepted.includes('سبب قرار الإغلاق'), 'accepted verification exposes separate authorized closure form');
check(accepted.includes('بانتظار الإغلاق'), 'accepted Finding verification is presented as awaiting closure without a new backend status');
check(!accepted.includes('قبول التحقق</button>'), 'already accepted verification has no duplicate accept decision');
const closed=renderDetail({...finding,status:'closed',verification_status:'accepted',closed_at:'2026-09-22',closed_by:'reviewer',closure_reason:'قرار نهائي'},[action],'nca_external_auditor','auditor',available);
check(closed.includes('أُغلقت الملاحظة بقرار منفصل')&&!closed.includes('إغلاق بقرار مستقل')&&!closed.includes('إكمال الإجراء</button>'), 'closed history is read-only for auditor');
const unavailable=renderDetail(finding,[action],'control_owner','owner',{state:'unavailable',frameworkCode:null,controlCode:null,controlTitle:null,controlAvailable:false});
check(unavailable.includes('سجل المصدر غير متاح أو خارج صلاحياتك')&&!unavailable.includes('فتح بند التقييم المحدد')&&!unavailable.includes('#91'), 'missing/deleted/unauthorized source fails safely without fallback ID or link');
check(!unavailable.includes('قبول التحقق</button>')&&!unavailable.includes('إغلاق بقرار مستقل'), 'owner sees no independent review/closure action');
check(!unavailable.includes('class="findings-lifecycle"'), 'owner has no empty decision form when independent review is pending');
const evidenceUnavailable=renderDetail(finding,[action],'cybersecurity_team','reviewer',available,[]);
check(evidenceUnavailable.includes('الدليل المرتبط غير متاح ضمن صلاحياتك')&&!evidenceUnavailable.includes('#501')&&!evidenceUnavailable.includes('#502'), 'unavailable historical evidence is not replaced by current or unrelated evidence');
check(source.includes("decisionFromUrl==='closure'?'finding-closure'")&&source.includes('hasRequestedFinding?')&&source.includes('reviewContextReturn'), 'exact Review Center finding/action/decision and contextual return preserved');
check(source.includes("supabase.from(table).select('id').eq('id',finding.source_record_id).maybeSingle()")&&source.includes("state:source.error||!source.data?'unavailable':'available'"), 'source identity is verified by exact authorized read before display');
check(source.includes("supabase.rpc('grc_evidence_register').select('id,control_id,link_id,version_number,file_name,evidence_name').in('id',ids)")&&source.includes("query=query.eq('control_id',finding.control_id)"), 'historical evidence read is exact-ID and control-scoped');
check(source.includes(".from('grc_findings')")&&!source.includes(".from('assessment_findings')"), 'shared and legacy finding models remain separate');
check(!source.includes('update_action_status_automatically')&&!source.includes('auto_close_finding'), 'no automatic transition introduced');
console.log(`PASS: ${checks} IA-3 Finding parent, multiple actions, source/evidence identity, safe unavailable, roles, SoD, lifecycle and deep-link assertions (synthetic only).`);

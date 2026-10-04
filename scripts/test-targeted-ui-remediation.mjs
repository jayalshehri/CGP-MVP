// Offline production-component rendering and RLS-read query contracts. No live credentials/network.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {posix} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const source=file=>readFileSync(new URL(file,root),'utf8');
const noWrite=()=>{throw new Error('Live effects/mutations are forbidden in visual tests');};
function load(file,{states={},database={from:noWrite,rpc:noWrite},query='',clock=Date}={}){
  const cache=new Map();
  function compile(path){
    if(cache.has(path))return cache.get(path);
    const loadedModule={exports:{}};cache.set(path,loadedModule.exports);
    const extra=path==='app/findings/page.tsx'?'\nexports.FindingsContentTest=FindingsContent;':path==='app/mappings/page.tsx'?'\nexports.MappingRowTest=MappingRow;':'';
    const code=ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText+extra;
    let stateIndex=0;
    const resolve=name=>{
      if(name.endsWith('.css'))return {};
      if(name==='react')return {...React,useEffect:()=>{},useState:initial=>{const index=stateIndex++;return [states[path]?.[index]??(typeof initial==='function'?initial():initial),noWrite];}};
      if(name==='next/link')return {__esModule:true,default:({href,children,...props})=>React.createElement('a',{href,...props},children)};
      if(name==='next/navigation')return {useRouter:()=>({push:noWrite,refresh:noWrite}),useSearchParams:()=>new URLSearchParams(query)};
      if(name==='@/lib/supabase')return {supabase:database};
      if(name==='@/lib/auth')return {requireProfile:noWrite};
      if(name.startsWith('@/')||name.startsWith('.')){const relative=name.startsWith('@/')?name.slice(2):posix.join(posix.dirname(path),name);return compile(relative+(existsSync(new URL(relative+'.tsx',root))?'.tsx':'.ts'));}
      return require(name);
    };
    vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,require:resolve,console,Date:clock,Intl,URLSearchParams},{filename:path});
    return loadedModule.exports;
  }
  return compile(file);
}
const evidence={id:901,control_id:501,version_number:3,is_current:true,evidence_name:'تقرير التحقق من فاعلية ضوابط إدارة الوصول والصلاحيات للأنظمة والخدمات الحساسة',file_name:'access-control-validation-evidence-v3.pdf',file_path:'synthetic-only/file.pdf',status:'pending_review',valid_until:'2025-01-01',uploaded_at:'2026-09-20',uploader_name:'رافع الدليل التجريبي',description:'تفاصيل توثيق تنفيذ الضابط ونطاق التغطية والأدلة الداعمة. '.repeat(5),reviewed_at:'2026-09-22',reviewer_display_name:'مراجع مستقل',review_notes:'توضح النسخة نطاق التحقق وحدوده دون نقل قرار الامتثال إلى ضابط آخر.',association:'shared',framework_code:'ECC',target_control_code:'ECC-1-1-3-LONG-IDENTIFIER',control:{title_ar:'إدارة هويات الدخول والصلاحيات ومراجعتها بصورة دورية عبر الأنظمة الحساسة',control_owner:'فريق إدارة الوصول'}};
const cycle={id:71,framework:'CSCC',framework_version:'2019',scope_name:'نطاق الأنظمة الحساسة والخدمات المركزية وإدارة البنية التحتية للأمن السيبراني',status:'in_progress',total:105,assessed:63,not_applicable:5,compliant:40,compliance:null,completion:60,open_gaps:12,critical_gaps:2,overdue_actions:3,missing_data:9,pending_evidence:2,evidence_needing_refresh:0,improvement:null,due_date:'2025-01-01',next_review_date:null,approved_at:null};
const mapping={id:601,source_id:501,target_id:502,source_framework:'ECC',target_framework:'CSCC',source_code:'ECC-1-1-3-LONG-IDENTIFIER',target_code:'CSCC-1-1-3',source_title:'إدارة هويات الدخول والصلاحيات للأنظمة والخدمات الحساسة والتحقق المستقل من فاعليتها',target_title:'مراجعة واعتماد صلاحيات الوصول للأنظمة الحساسة وتوثيق حدود التغطية والأدلة الداعمة',source_version:'2018',target_version:'2019',coverage_type:'equivalent',validation_status:'pending',source_reference:'وثيقة المواءمة — الإصدار الأول — الصفحة 24',coverage_notes:'حدود التغطية الواردة في الوثيقة تحتاج إلى مراجعة مستقلة. '.repeat(3),reviewed_by:'another-reviewer',reviewed_at:'2026-09-20',approved_at:null,revision:2};
const sourceOption={id:891,label:'ECC — 1-1-3 — نتيجة تقييم إدارة هويات الدخول والصلاحيات — نطاق الأنظمة الحساسة'};
export function visualMarkup(area,mode='populated'){
  if(area==='compliance'){
    const component=load('app/compliance/page.tsx',{states:{'app/compliance/page.tsx':{0:[{id:1,code:'CSCC',name_ar:'ضوابط الأمن السيبراني للأنظمة الحساسة',version:'2019'}],1:[{id:501,framework_id:1}],2:mode==='empty'||mode==='unavailable'?[]:[cycle],3:mode==='restricted'?'data_governance_team':'admin',4:false,6:mode==='unavailable'}}}).default;
    return render(React.createElement(component));
  }
  if(area==='evidence'){
    const component=load('components/EvidenceRegister.tsx',{states:{'components/EvidenceRegister.tsx':{0:mode==='expanded'}}}).default;
    const soon=new Date();soon.setUTCDate(soon.getUTCDate()+10);
    return '<main class="workflow-page evidence-page"><h1>مستودع الأدلة</h1>'+render(React.createElement(component,{rows:mode==='empty'?[]:[evidence,{...evidence,id:902,evidence_name:'سجل مراجعة الصلاحيات',file_name:'review.pdf',association:'direct',status:'accepted',valid_until:'2099-12-31',reviewed_at:null},{...evidence,id:903,evidence_name:'تقرير المتابعة',valid_until:soon.toISOString().slice(0,10)},{...evidence,id:904,evidence_name:'سجل الأدلة',valid_until:null}],canReview:true}))+'</main>';
  }
  if(area==='cycles'){
    const component=load('components/AssessmentPortfolio.tsx').AssessmentPortfolioView;
    return '<main class="workflow-page">'+render(React.createElement(component,{rows:mode==='empty'?[]:[cycle,{...cycle,id:72,framework:'DCC',scope_name:'نطاق حماية البيانات',status:'approved',completion:100,compliance:82,open_gaps:0,critical_gaps:0,overdue_actions:0,improvement:6,due_date:null,approved_at:'2026-09-01'}],view:'all',filter:'',onFilter:noWrite,loading:false,error:''}))+'</main>';
  }
  if(area==='mappings'){
    const component=load('app/mappings/page.tsx',{states:{'app/mappings/page.tsx':{1:mode==='empty'?[]:[mapping,{...mapping,id:602,coverage_type:'supports',validation_status:'approved'}],2:'reviewer',4:false,12:mode==='expanded'?601:null}}}).default;
    return render(React.createElement(component));
  }
  const formState={source_type:'assessment',source_record_id:mode==='pinned'?'891':'',title:'',description:'',severity:'unclassified',owner_id:'',due_date:''};
  const component=load('app/findings/page.tsx',{states:{'app/findings/page.tsx':{0:'reviewer',1:'admin',4:[{user_id:'owner',display_name:'مالك الضابط',role:'control_owner'}],6:false,14:true,15:{kind:'assessment',state:mode==='unavailable'?'unavailable':'ready',rows:mode==='unavailable'||mode==='empty'?[]:[sourceOption]},17:formState}}}).FindingsContentTest;
  return render(React.createElement(component,{params:new URLSearchParams(mode==='pinned'?'source=assessment&source_id=891':'')}));
}
export async function tests(){
  let n=0;const check=(value,message)=>{assert.ok(value,message);n++;};
  const collapsed=visualMarkup('evidence'),expanded=visualMarkup('evidence','expanded');
  check(collapsed.includes('aria-expanded="false"')&&collapsed.includes('evidence-detail-row" hidden'), 'details initially collapsed');
  check(expanded.includes('aria-expanded="true"')&&expanded.includes('<td colSpan="8">'), 'details occupy all eight columns in full-width sibling row');
  check(expanded.includes('رافع الدليل التجريبي')&&expanded.includes('مراجع مستقل')&&expanded.includes('فريق إدارة الوصول'), 'metadata retained');
  check(expanded.includes('/controls/501')&&expanded.includes('/review#evidence-901'), 'exact control/review destination unchanged');
  check(expanded.includes('منتهية')&&expanded.includes('الإصدار'), 'expiry and version retained');
  for(const label of ['الدليل','الضابط','الإطار','المالك','الإصدار','الحالة','الصلاحية','الإجراءات'])check(collapsed.includes(`<th scope="col">${label}</th>`),`compact register retains ${label} column`);
  const summary=collapsed.slice(collapsed.indexOf('evidence-summary-row'),collapsed.indexOf('evidence-detail-row'));
  for(const value of ['فريق إدارة الوصول','ECC','ECC-1-1-3-LONG-IDENTIFIER','معاينة','تنزيل الدليل','فتح الضابط','تفاصيل الدليل'])check(summary.includes(value),`summary retains ${value}`);
  for(const state of ['valid','soon','expired','unspecified'])check(collapsed.includes(`evidence-validity-${state}`),`expiry badge ${state}`);
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-04T12:00:00Z']));}}
  const expiry=load('components/EvidenceRegister.tsx',{clock:FixedDate}).evidenceExpiryState;
  for(const [date,expected] of [[null,'unspecified'],['2026-10-03','expired'],['2026-10-04','soon'],['2026-11-03','soon'],['2026-11-04','valid']])check(expiry(date)===expected,`Riyadh expiry boundary ${date}: ${expected}`);
  check(!summary.includes('<td class="grc-warning"')&&!summary.includes('<td class="evidence-validity'),'expiry color belongs to badge only');
  check(!expanded.slice(expanded.indexOf('evidence-summary-row'),expanded.indexOf('evidence-detail-row')).includes('تفاصيل توثيق'), 'description cannot stretch summary row');
  const evidenceComponent=load('components/EvidenceRegister.tsx').default;
  check(!render(React.createElement(evidenceComponent,{rows:[evidence],canReview:false})).includes('/review#'), 'no extra review authority');
  const cycles=visualMarkup('cycles');
  check(cycles.includes('/assessments?cycle=71')&&cycles.includes('/dcc-assessment?cycle=72'), 'next-action routes exact');
  check(cycles.includes('value="60"')&&cycles.includes('63/105')&&cycles.includes('دورة متأخرة'), 'counts/progress/next action retained');
  check(cycles.includes('حرجة')&&cycles.includes('متأخرة')&&cycles.includes('مفتوحة'), 'gap indicators labeled, not color only');
  const center=visualMarkup('compliance');
  check(center.includes('مركز الامتثال')&&center.includes('دورات قياس الالتزام حسب النطاق'),'actual Compliance Center includes cycles, not just standalone renderer');
  check(center.includes('/compliance/CSCC')&&center.includes('/assessments?cycle=71'),'framework navigation and exact cycle navigation coexist');
  for(const label of ['الإطار والنطاق','نتيجة التقييم المعتمدة','اكتمال التقييم','الفجوات','الإجراء التالي'])check(center.includes(label),`Compliance Center cycle column: ${label}`);
  check(center.includes('value="60"')&&center.includes('63/105')&&center.includes('عرض الدورات'),'page retains summary metrics and filters');
  const emptyCenter=visualMarkup('compliance','empty'),failedCenter=visualMarkup('compliance','unavailable');
  check(emptyCenter.includes('لا توجد دورات مطابقة')&&!emptyCenter.includes('role="alert"'),'page complete-zero read remains empty');
  check(failedCenter.includes('غير متاحة حاليًا')&&!failedCenter.includes('لا توجد دورات مطابقة')&&failedCenter.includes('/compliance/CSCC'),'page failed summary is not zero and framework navigation survives');
  check(!visualMarkup('compliance','restricted').includes('دورات قياس الالتزام حسب النطاق'),'existing data governance assessment restriction preserved');
  const centerSource=source('app/compliance/page.tsx');
  check(centerSource.includes('isBusinessFramework(cycle.framework)'),'normal center excludes QA_SYNTH cycle rows');
  check((centerSource.match(/rpc\("cgp_assessment_summary"\)/g)??[]).length===1&&!centerSource.includes('<AssessmentPortfolio '),'center reuses one existing authorized RPC read');
  const cycleContent=load('components/AssessmentPortfolio.tsx',{states:{'components/AssessmentPortfolio.tsx':{0:'approved'}}}).AssessmentPortfolioContent;
  const filtered=render(React.createElement(cycleContent,{rows:[cycle,{...cycle,id:72,status:'approved'}]}));
  check(!filtered.includes('?cycle=71')&&filtered.includes('?cycle=72'),'shared content preserves approved filter');
  const errorView=load('components/AssessmentPortfolio.tsx').AssessmentPortfolioView;
  const errorMarkup=render(React.createElement(errorView,{rows:[],view:'all',filter:'',onFilter:noWrite,loading:false,error:'RAW DATABASE ERROR'}));
  check(!errorMarkup.includes('RAW DATABASE ERROR')&&!errorMarkup.includes('لا توجد'),'error presentation does not leak raw errors or imply zero');
  const mappingHtml=visualMarkup('mappings','expanded');
  check(mappingHtml.includes('mapping-review-601')&&mappingHtml.includes('colSpan="4"'), 'deliberate full-width mapping workspace');
  check(mappingHtml.includes('/controls/501')&&mappingHtml.includes('/controls/502'), 'mapping identities retained');
  check(mappingHtml.includes('تصدير CSV')&&mappingHtml.includes('طباعة / PDF'), 'exports retained');
  check(!mappingHtml.includes('إنشاء مقترح مواءمة'),'primary proposal UI is absent');
  check(source('app/mappings/page.tsx').includes("action:'create'"),'dormant creation command preserved');
  const mappingRows=Array.from({length:72},(_,i)=>({...mapping,id:i+1,validation_status:i<30?'approved':'pending'}));
  const mappingPage=(extra={})=>render(React.createElement(load('app/mappings/page.tsx',{states:{'app/mappings/page.tsx':{1:mappingRows,2:'reviewer',4:false,...extra}}}).default));
  check(mappingPage().includes('عدد العلاقات المطابقة: 72'),'72 supplied relationships remain 72 without suppression');
  check(mappingPage({9:'approved'}).includes('عدد العلاقات المطابقة: 30'),'same status filter preserves count');
  check(mappingPage({6:'no-match'}).includes('عدد العلاقات المطابقة: 0'),'search zero reflects actual filter');
  check(source('app/mappings/page.tsx').includes("supabase.rpc('cgp_crosswalk')"),'existing relationship RPC read preserved');
  const form=visualMarkup('findings'),pinned=visualMarkup('findings','pinned'),unavailable=visualMarkup('findings','unavailable');
  check(!form.includes('معرّف سجل المصدر')&&form.includes(sourceOption.label), 'human-readable source choices replace raw ID input');
  check(pinned.includes(sourceOption.label)&&pinned.includes('findings-source-reference'), 'exact pinned source readable');
  check(form.includes('إرشاد داخلي في CGP')&&form.includes('ليس منهجية تصنيف صادرة عن NCA'), 'guidance not falsely regulatory');
  check(unavailable.includes('المصادر غير متاحة حاليًا')&&unavailable.includes('لن يُستخدم مصدر بديل'), 'failed source never becomes zero or fallback');
  check(form.includes('تُضاف الإجراءات التصحيحية')&&form.includes('اختياري'), 'progressive action planning and optional fields');
  check(form.includes('findings-step-number')&&form.includes('من سيعالجها ومتى؟'),'four guided sections styled without changing semantics');
  check(/<details id="finding-severity-guidance" class="findings-severity-help">/.test(form),'severity guidance defaults collapsed without open attribute');
  check(!/موعد الاستحقاق[^<]*<input[^>]*required/.test(form),'due date remains optional');
  for(const area of ['evidence','cycles','mappings'])check(visualMarkup(area,'empty').includes('لا توجد'), `${area} true empty state`);
  function database(pages){const calls=[];return {calls,from(table){calls.push(['from',table]);const builder={};for(const name of ['select','not','eq','order','range'])builder[name]=(...args)=>{calls.push([name,...args]);return builder;};builder.then=resolve=>Promise.resolve(pages.shift()).then(resolve);return builder;}};}
  const db=database([{data:[{id:891,code:'1-1-3',title:'عنوان',cycle:{scope_name:'نطاق',frameworks:{code:'ECC'}}}],count:1,error:null}]);
  const read=load('lib/finding-source-options.ts',{database:db}).loadFindingSourceOptions;
  check((await read('assessment',891))[0].label==='ECC — 1-1-3 — عنوان — نطاق','assessment context normalized');
  check(db.calls.some(c=>c[0]==='eq'&&c[1]==='id'&&c[2]===891),'pinned read exact ID');
  check(db.calls.some(c=>c[0]==='order'&&c[1]==='id')&&db.calls.some(c=>c[0]==='range'&&c[2]===499),'stable bounded paging');
  check(db.calls.some(c=>c[0]==='not'&&c[1]==='cycle.status'),'completed source exclusion');
  for(const result of [{data:[],count:0,error:null},{data:[],count:null,error:null},{data:[],count:1,error:null},{data:null,count:null,error:{message:'RAW SECRET ERROR'}}]){
    const fn=load('lib/finding-source-options.ts',{database:database([result])}).loadFindingSourceOptions;
    if(result.count===0)check((await fn('risk',null)).length===0,'zero succeeds');
    else {await assert.rejects(fn('risk',null),/Source unavailable/);n++;}
  }
  await assert.rejects(read('internal_audit',null),/Source unavailable/);n++;
  await assert.rejects(read('assessment',0),/Source unavailable/);n++;
  const page=Array.from({length:500},(_,i)=>({id:i+1,code:`R-${i+1}`,title:'خطر'}));
  const paged=database([{data:page,count:501,error:null},{data:[{id:501,code:'R-501',title:'خطر'}],count:501,error:null}]);
  check((await load('lib/finding-source-options.ts',{database:paged}).loadFindingSourceOptions('risk',null)).length===501,'complete multi-page source read');
  check(paged.calls.some(c=>c[0]==='range'&&c[1]===500&&c[2]===999),'second page deterministic');
  check(!/\.(insert|update|delete|upsert|rpc)\(/.test(source('lib/finding-source-options.ts')),'source resolver read-only');
  console.log(`PASS: ${n} targeted UI disclosure/source/paging/zero/error/identity assertions; no live reads/writes.`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))await tests();

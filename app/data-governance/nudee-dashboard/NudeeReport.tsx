"use client";
import { localLevels as LEVELS } from "../nudee/reference";
import { formatRiyadhDate, riyadhIsoDate } from "@/lib/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import styles from "./nudee-dashboard.module.css";

export type Requirement = {
 id:number; source_row:number; domain_name:string; standard_code:string; maturity_level:string;
 source_compliance:string|null; source_review_status:string|null; source_progress:number|null;
 schedule_indicator:string|null; planned_start:string|null; planned_end:string|null;
 actual_end:string|null; evidence_name:string; review_phase:string|null;
};
export type Assignment = { id:number; requirement_id:number; status:string; updated_at:string; due_date:string|null };
type Filter = {domain:string;level:string;compliance:string;review:string};
const ALL="الكل";
// The original office implementation plan budgets three evidence stages plus a manual final review.
const planLevels=LEVELS.slice(0,3);
const SOURCE_COMPLIANCE=["ممتثل بالكامل","جزئي","ممتثل للمعالي فقط","غير ممتثل","لا ينطبق","لم يُقيَّم","حالة غير معيارية"];
function complianceStatus(value:string|null){
 if(!value?.trim())return "لم يُقيَّم";
 // Mirror the actual Calc!B10 Excel COUNTIFS criterion, not the dashboard heading.
 if(["جزئي","ممتثل جزئيًا","ممتثل جزئيا"].includes(value.trim()))return "جزئي";
 if(["ممتثل بالكامل","ممتثل للمعالي فقط","غير ممتثل","لا ينطبق"].includes(value.trim()))return value.trim();
 return "حالة غير معيارية";
}
function effectiveReview(r:Requirement,assign?:Assignment){
 if(assign?.status==="approved")return "مكتمل";
 if(assign?.status==="submitted")return "بانتظار التحقق";
 if(assign?.status==="changes_requested")return "معاد للتعديل";
 if(assign?.status==="assigned")return "قيد التنفيذ";
 return r.source_review_status?.trim()||"لم يبدأ";
}
// Keep Excel's progress weights (completed=1, in-progress=.5, overdue=.25)
// as source data. An assignment alone is NOT evidence of progress.
// Only submitted/approved work may add CGP workflow progress above the source.
function evidenceProgress(r:Requirement,assignment?:Assignment){
 const original=Math.max(0,Math.min(1,Number(r.source_progress||0)));
 if(assignment?.status==="approved")return 1;
 if(assignment?.status==="submitted")return Math.max(original,0.5);
 if(assignment?.status==="changes_requested")return 0;
 return original;
}
function percent(n:number,d:number){return d?Math.round(1000*n/d)/10:0;}
function fmtPct(n:number,d:number,evaluated?:number){if(!d)return "لا توجد بنود منطبقة";if(evaluated===0)return "لم تتوفر نتيجة تقييم";return percent(n,d).toLocaleString("ar-SA",{maximumFractionDigits:1})+"%";}
const shortDate = formatRiyadhDate;
export default function NudeeReport({records,assignments}:{records:Requirement[];assignments:Assignment[]}){
 const [scope,setScope]=useState<"original"|"live">("original");
 const original=scope==="original";
 const scoped=useMemo(()=>original?records.filter(r=>r.source_row>=2 && r.source_row<=365):records,[original,records]);
 const scopedAssignments=useMemo(()=>original?[]:assignments,[original,assignments]);
 const [filter,setFilter]=useState<Filter>({domain:ALL,level:ALL,compliance:ALL,review:ALL});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [finalReviewProgress,setFinalReviewProgress]=useState(0);
 const [finalReviewInput,setFinalReviewInput]=useState("0");
 const [finalReviewNote,setFinalReviewNote]=useState("");
 const [finalReviewSaving,setFinalReviewSaving]=useState(false);
 const [finalReviewNotice,setFinalReviewNotice]=useState("");
 const [dialogOpen,setDialogOpen]=useState(false);
 const finalReviewPending=useRef(false);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;void Promise.resolve().then(async()=>{
  const f=await supabase.from("nudee_final_review").select("progress").eq("id",1).single();
  if(f.error)throw new Error("تعذر تحميل بيانات التقرير.");
  if(active){
   const currentProgress=Number(f.data?.progress??0);
   setFinalReviewProgress(currentProgress);
   setFinalReviewInput(String(Math.round(currentProgress*100)));
  }
 }).catch(()=>{if(active)setError("تعذر تحميل بيانات التقرير.");})
 .finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[attempt]);
 const mapped=useMemo(()=>new Map(scopedAssignments.map(a=>[a.requirement_id,a])),[scopedAssignments]);
 const domains=useMemo(()=>Array.from(new Set(scoped.map(r=>r.domain_name))).sort((a,b)=>a.localeCompare(b,"ar")),[scoped]);
 const reviews=useMemo(()=>Array.from(new Set(scoped.map(r=>effectiveReview(r,mapped.get(r.id))))).sort((a,b)=>a.localeCompare(b,"ar")),[scoped,mapped]);
 const rows=useMemo(()=>scoped.filter(r=>
  (filter.domain===ALL||r.domain_name===filter.domain)&&
  (filter.level===ALL||r.maturity_level===filter.level)&&
  (filter.compliance===ALL||complianceStatus(r.source_compliance)===filter.compliance)&&
  (filter.review===ALL||effectiveReview(r,mapped.get(r.id))===filter.review)
 ),[scoped,mapped,filter]);
 const stats=useMemo(()=>{
  const count=(condition:(r:Requirement)=>boolean)=>rows.filter(condition).length;
  const full=count(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل");
  const authority=count(r=>complianceStatus(r.source_compliance)==="ممتثل للمعالي فقط");
  const partial=count(r=>complianceStatus(r.source_compliance)==="جزئي");
  const non=count(r=>complianceStatus(r.source_compliance)==="غير ممتثل");
  const na=count(r=>complianceStatus(r.source_compliance)==="لا ينطبق");
  const unknown=count(r=>complianceStatus(r.source_compliance)==="حالة غير معيارية");
  const unassessed=count(r=>complianceStatus(r.source_compliance)==="لم يُقيَّم");
  const reviewed=count(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل");
  const overdue=count(r=>r.schedule_indicator?.trim()==="متأخر");
  return {total:rows.length,full,authority,partial,non,na,unknown,unassessed,reviewed,overdue,assessed:rows.length-unassessed-unknown,applicable:rows.length-na,
    assigned:count(r=>Boolean(mapped.get(r.id))),submitted:count(r=>mapped.get(r.id)?.status==="submitted"),approved:count(r=>mapped.get(r.id)?.status==="approved")};
 },[rows,mapped]);
 const domainMatrix=useMemo(()=>{
  const grouped=new Map<string,Requirement[]>();
  for(const r of rows)grouped.set(r.domain_name,[...(grouped.get(r.domain_name)||[]),r]);
  return [...grouped.entries()].map(([name,list])=>{
   const n=list.length, na=list.filter(r=>complianceStatus(r.source_compliance)==="لا ينطبق").length;
   const full=list.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length;
   const authority=list.filter(r=>complianceStatus(r.source_compliance)==="ممتثل للمعالي فقط").length;
   const non=list.filter(r=>complianceStatus(r.source_compliance)==="غير ممتثل").length;
   const partial=list.filter(r=>complianceStatus(r.source_compliance)==="جزئي").length;
   const residual=n-full-authority-non-na-partial; // Calc!AH30:AH43, includes blanks and nonstandard values.
   return {name,total:n,applicable:n-na,assessed:list.filter(r=>!["لم يُقيَّم","حالة غير معيارية"].includes(complianceStatus(r.source_compliance))).length,reviewed:list.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length,
    full,authority,partial,non,na,residual,levels:LEVELS.map(level=>{const subset=list.filter(r=>r.maturity_level===level);const denominator=subset.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق").length;return {n:subset.length,rate:denominator && subset.some(r=>["ممتثل بالكامل","ممتثل للمعالي فقط","غير ممتثل","جزئي"].includes(complianceStatus(r.source_compliance)))?percent(subset.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,denominator):null};})};
  }); // Preserve original Excel domain ordering from source_row; chart series use this same order.
 },[rows,mapped]);
 // Reproduce the eight-week *weighted* Calc!D60:E67 trend, not a count of due evidence.
 // The workbook snapshot uses AsOfDate=2026-11-05; this live view uses the Riyadh date.
 const weekly=useMemo(()=>{
  const today=original?"2026-11-05":riyadhIsoDate();
  return Array.from({length:8},(_,i)=>{
   const start=new Date("2026-11-08T00:00:00Z");
   start.setUTCDate(start.getUTCDate()+7*i);
   const starts=start.toISOString().slice(0,10);
   start.setUTCDate(start.getUTCDate()+4);
   const until=start.toISOString().slice(0,10);
   // Never reconstruct a closed week using today's workflow state.
   const current=starts<=today && until>=today;
   const stageRates=planLevels.map(level=>{
    const subset=rows.filter(r=>r.maturity_level===level);
    return subset.length?subset.reduce((sum,r)=>sum+evidenceProgress(r,mapped.get(r.id)),0)/subset.length:0;
   });
   return {week:i+1,until,planned:(i+1)*12.5,future:starts>today,actual:current?25*(stageRates.reduce((a,b)=>a+b,0)+(today>="2026-12-20"?finalReviewProgress:0)):null};
  });
 },[original,rows,mapped,finalReviewProgress]);
 async function saveFinalReview(){
  if(finalReviewPending.current)return;
  setFinalReviewNotice("");
  const percentValue=Number(finalReviewInput);
  if(!finalReviewInput.trim()||!Number.isFinite(percentValue)||percentValue<0||percentValue>100){
   setFinalReviewNotice("أدخل نسبة صحيحة من 0 إلى 100.");return;
  }
  if(!finalReviewNote.trim()){setFinalReviewNotice("أدخل ملاحظات تبرر تحديث المراجعة الشاملة.");return;}
  finalReviewPending.current=true;
  setFinalReviewSaving(true);
  try{
   await requireProfile(["admin","data_governance_team"]);
   const {data,error:e}=await supabase.rpc("nudee_set_final_review_progress",{
    p_percent:percentValue,p_notes:finalReviewNote.trim()
   });
   if(e)throw e;
   const saved=Number(data);
   setFinalReviewProgress(saved);
   setFinalReviewInput(String(Math.round(saved*100)));
   setFinalReviewNote("");
   setFinalReviewNotice("تم توثيق تقدم المراجعة الشاملة بنجاح.");
   setDialogOpen(false);
  }catch(e){
   setFinalReviewNotice(e instanceof Error?e.message:"تعذر تحديث المراجعة الشاملة.");
  }finally{finalReviewPending.current=false;setFinalReviewSaving(false)}
 }
 const stages=planLevels.map((level,i)=>{const subset=rows.filter(r=>r.maturity_level===level);
  const completed=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;
  // Excel timetable uses SUM(source_progress)/COUNT, including partial work (50%, 25%).
  const progress=subset.length?subset.reduce((sum,r)=>sum+evidenceProgress(r,mapped.get(r.id)),0)/subset.length:0;
  return {level,phase:i+1,n:subset.length,completed,progress,start:subset.map(r=>r.planned_start).filter((x):x is string=>Boolean(x)).sort()[0]||null,
   end:subset.map(r=>r.planned_end).filter((x):x is string=>Boolean(x)).sort().at(-1)||null};
 });
 const hasFilters=Object.values(filter).some(x=>x!==ALL);
 function field<K extends keyof Filter>(key:K,value:string){setFilter(f=>({...f,[key]:value}));}
 if(loading)return <p role="status">جارٍ تحميل التقرير…</p>;
 if(error)return <div className={styles.alert}><span role="alert">{error}</span>{" "}
  <button type="button" onClick={()=>{setLoading(true);setError("");setAttempt(i=>i+1)}}>إعادة المحاولة</button></div>;
 return <>
   <section className={styles.filters} aria-label="نطاق التقرير"><label>مصدر التقرير<select value={scope} onChange={e=>{setScope(e.target.value as "original"|"live");setFilter({domain:ALL,level:ALL,compliance:ALL,review:ALL});}}><option value="original">ملف المتابعة الأصلي · ٥ نوفمبر ٢٠٢٦</option><option value="live">سجل الأدلة الحالي · جميع المستويات</option></select></label><p>{original?"أرقام الملف عند تاريخ القياس، قبل تحديثات التكليف والمراجعة.":"حالات الامتثال من المصدر، وحالات مراجعة الأدلة من تكليفات المكتب."} · {scoped.length.toLocaleString("ar-SA")} بند · {original?"٥ نوفمبر ٢٠٢٦":shortDate(riyadhIsoDate())}</p></section>
   <section className={styles.filters} aria-label="تصفية بيانات المؤشر">
    <label><span id="nudee-report-level">مستوى النضج</span><select aria-labelledby="nudee-report-level" value={filter.level} onChange={e=>field("level",e.target.value)}>{[ALL,...LEVELS].map(v=><option key={v}>{v}</option>)}</select></label>
    <label><span id="nudee-report-domain">المجال</span><select aria-labelledby="nudee-report-domain" value={filter.domain} onChange={e=>field("domain",e.target.value)}>{[ALL,...domains].map(v=><option key={v}>{v}</option>)}</select></label>
    <label><span id="nudee-report-compliance">حالة الامتثال</span><select aria-labelledby="nudee-report-compliance" value={filter.compliance} onChange={e=>field("compliance",e.target.value)}>{[ALL,...SOURCE_COMPLIANCE].map(v=><option key={v}>{v}</option>)}</select></label>
    <label><span id="nudee-report-review">حالة المراجعة</span><select aria-labelledby="nudee-report-review" value={filter.review} onChange={e=>field("review",e.target.value)}>{[ALL,...reviews].map(v=><option key={v}>{v}</option>)}</select></label>
    <div className={styles.filterBottom}><span>المعروض: {stats.total.toLocaleString("ar-SA")} من أصل {scoped.length.toLocaleString("ar-SA")} دليل</span><button disabled={!hasFilters} onClick={()=>setFilter({domain:ALL,level:ALL,compliance:ALL,review:ALL})}>مسح التصفية</button></div>
   </section>
   <section className={styles.metrics} aria-label="مؤشرات الامتثال">
    {[
     ["إجمالي الأدلة",stats.total,"يتضمن جميع الأدلة في التصفية"],
     ["ممتثل بالكامل",stats.full,fmtPct(stats.full,stats.applicable,stats.assessed-stats.na)+" من الأدلة المنطبقة"],
     ["الفئة الداخلية الإضافية في الملف",stats.authority,fmtPct(stats.authority,stats.applicable,stats.assessed-stats.na)+" من الأدلة المنطبقة"],
     ["تنفيذ جزئي",stats.partial,"يُعرض عدد البنود دون افتراض وزن للدرجة"],
     ["غير ممتثل",stats.non,fmtPct(stats.non,stats.applicable,stats.assessed-stats.na)+" من الأدلة المنطبقة"],
     ["غير منطبق",stats.na,"مستبعد من مقام الامتثال"],
     ["غير مقيّم",stats.unassessed,fmtPct(stats.assessed,stats.total)+" تم تقييمها"],
     ["الامتثال الكامل وفق المصدر",fmtPct(stats.full,stats.applicable,stats.assessed-stats.na),"مصنفة ممتثلة من الأدلة المنطبقة"],
     ["إنجاز مراجعة الأدلة",fmtPct(stats.reviewed,stats.total),stats.reviewed+" من "+stats.total+" مكتمل"],
     ["متأخر وفق الخطة المستوردة",stats.overdue,"تاريخ القياس في الخطة: 5 نوفمبر 2026"]
    ].map(([label,value,detail])=><article className={styles.metric} key={label}><span>{label}</span><strong>{typeof value==="number"?value.toLocaleString("ar-SA"):value}</strong><small>{detail}</small></article>)}
   </section>
   {!original&&<section className={styles.workflow}><div><span>دورة التكليف في CGP</span><p>التكليف والاعتماد يقيسان جاهزية الأدلة داخل المكتب.</p></div><div className={styles.flowNumbers}><span>المسندة <b>{stats.assigned}</b></span><span>بانتظار التحقق <b>{stats.submitted}</b></span><span>المعتمدة <b>{stats.approved}</b></span></div></section>}
   {stats.unknown>0&&<p role="note" className={styles.warning}>تنبيه جودة بيانات: عدد السجلات ذات التصنيف غير المعياري في العرض الحالي: {stats.unknown}. يحتاج تصنيف «ممتثل لمتطلبات الهيئة» إلى تأكيد مكتب البيانات قبل اعتماد نسبة امتثال الجهة. تحتسب معادلة المصدر حالة «ممتثل للمعالي فقط».</p>}
   <div className={styles.twoCols}>
    <section className={styles.panel}><h2>تصنيف الأدلة في ملف المتابعة</h2><p>نسبة الأدلة المصنفة ممتثلة بالكامل: {fmtPct(stats.full,stats.applicable,stats.assessed-stats.na)} · الفئتان المكتملتان وفق معادلة الملف: {fmtPct(stats.full+stats.authority,stats.applicable,stats.assessed-stats.na)}</p>
     {[["ممتثل بالكامل",stats.full],["ممتثل للمعالي فقط (صيغة Excel)",stats.authority],["جزئي",stats.partial],["غير ممتثل",stats.non],["غير منطبق",stats.na],["لم يُقيّم",stats.unassessed],["حالة غير معيارية",stats.unknown]].map(([label,n])=><div className={styles.barItem} key={label}><div><span>{label}</span><b>{n}</b></div><div className={styles.track}><div style={{width:(stats.total?100*Number(n)/stats.total:0)+"%"}}/></div></div>)}
    </section>
    <section className={styles.panel}><h2>الأدلة حسب مستوى النضج</h2><p>توزيع الأدلة ونتائج المراجعة للمستويات المعروضة.</p>
    {LEVELS.map(level=>{const subset=rows.filter(r=>r.maturity_level===level),done=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;return <div className={styles.levelRow} key={level}><span>{level}</span><strong>{subset.length}</strong><div className={styles.track}><div style={{width:(rows.length?100*subset.length/rows.length:0)+"%"}}/></div><small>مكتمل {done} · {fmtPct(done,subset.length)}</small></div>})}
    </section>
   </div>
   <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>مصفوفة الامتثال حسب المجال</h2><p>المجالات الأربعة عشر، النضج، عدد الأدلة المنطبقة والمقيّمة والمكتملة.</p></div><span className={styles.meta}>{domainMatrix.length} مجال</span></div><div className={styles.tableScroll}><table><thead><tr><th>المجال</th>{LEVELS.map((level,i)=><th key={level}>المستوى {i+1}</th>)}<th>ممتثل بالكامل في الملف</th><th>الفئتان في الملف</th><th>الأدلة</th><th>المنطبقة</th><th>المقيّمة</th><th>المراجعة المكتملة</th></tr></thead><tbody>{domainMatrix.map(d=><tr key={d.name}><th scope="row">{d.name}</th>{d.levels.map((l,i)=><td key={i} title={l.n+" دليل"}>{l.rate===null?"—":l.rate.toLocaleString("ar-SA")+"%"}</td>)}<td>{fmtPct(d.full,d.applicable,d.assessed-d.na)}</td><td>{fmtPct(d.full+d.authority,d.applicable,d.assessed-d.na)}</td><td>{d.total}</td><td>{d.applicable}</td><td>{d.assessed}</td><td>{d.reviewed}</td></tr>)}<tr className={styles.totalRow}><th scope="row">الإجمالي</th>{LEVELS.map(level=>{const a=rows.filter(r=>r.maturity_level===level);const valid=a.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق");return <td key={level}>{valid.length?fmtPct(valid.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,valid.length,valid.filter(r=>!["لم يُقيَّم","حالة غير معيارية"].includes(complianceStatus(r.source_compliance))).length):"—"}</td>})}<td>{fmtPct(stats.full,stats.applicable,stats.assessed-stats.na)}</td><td>{fmtPct(stats.full+stats.authority,stats.applicable,stats.assessed-stats.na)}</td><td>{stats.total}</td><td>{stats.applicable}</td><td>{stats.assessed}</td><td>{stats.reviewed}</td></tr></tbody></table></div></section>
   <section className={styles.panel} aria-label="رسوم الامتثال حسب مستوى النضج">
    <div className={styles.sectionHeader}><div><h2>تصنيف الأدلة حسب المجال والمستوى</h2><p>مصدر المستويات الثلاثة الأولى: Calc!H30:H43 وQ30:Q43 وZ30:Z43. النسب من الأدلة المنطبقة.</p></div><span className={styles.meta}>3 مستويات</span></div>
    <div className={styles.domainVisuals}>{LEVELS.map((level,index)=><div className={styles.domainVisual} key={level}><h3>{level}</h3>
     {domainMatrix.map(d=><div key={d.name} className={styles.domainLine}><span title={d.name}>{d.name}</span>{d.levels[index].rate===null?<span>لا توجد نتيجة محسوبة</span>:<div className={styles.track} role="meter" aria-label={d.name+" - "+level} aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.levels[index].rate}><div style={{width:(d.levels[index].rate??0)+"%"}}/></div>}<strong>{d.levels[index].rate===null?"—":d.levels[index].rate.toLocaleString("ar-SA")+"%"}</strong></div>)}
    </div>)}</div>
   </section>
   <section className={styles.panel} aria-label="توزيع الامتثال حسب المجال">
    <div className={styles.sectionHeader}><div><h2>توزيع حالة الامتثال في المجالات</h2><p>مقابل سلاسل Excel Calc!AD30:AH43. المتبقي يشمل غير المقيّم وأي قيمة غير معيارية.</p></div><span className={styles.meta}>٦ فئات</span></div>
    <div className={styles.chartLegend}>{[["ممتثل بالكامل","#159b88"],["ممتثل للمعالي فقط","#4f8ed7"],["جزئي","#845ca0"],["غير ممتثل","#df786b"],["لا ينطبق","#9ca3af"],["غير مقيّم أو غير معياري","#ccd8da"]].map(([name,color])=><span key={name}><i style={{background:color}}/>{name}</span>)}</div>
    <div className={styles.stackedList}>{domainMatrix.map(d=><div className={styles.stackedRow} key={d.name}>
     <span title={d.name}>{d.name}</span>
     <div className={styles.stackedTrack} role="img" aria-label={d.name+": "+d.full+" ممتثل بالكامل، "+d.authority+" في الفئة الإضافية، "+d.partial+" جزئي، "+d.non+" غير ممتثل، "+d.na+" لا ينطبق، "+d.residual+" غير مقيّم أو غير معياري"}>
      {[[d.full,"#159b88"],[d.authority,"#4f8ed7"],[d.partial,"#845ca0"],[d.non,"#df786b"],[d.na,"#9ca3af"],[d.residual,"#ccd8da"]].map(([count,color],i)=><div key={i} style={{width:(d.total?100*Number(count)/d.total:0)+"%",background:String(color)}}/>)}
     </div><strong>{d.total.toLocaleString("ar-SA")}</strong></div>)}</div>
   </section>
   <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>الجدول الزمني ومراجعة الأدلة</h2><p>البرنامج الأساسي: 8 أسابيع من 8 نوفمبر إلى 31 ديسمبر 2026. المخطط تراكمي موزون حسب مدة المراحل الأربع (Calc)، والفعلي يقاس بتاريخ الرياض؛ الأسابيع السابقة تتطلب تاريخ إنجاز فعليًا.</p></div><span className={styles.meta}>8 أسابيع</span></div>
    <div className={styles.stages}>{stages.map(s=><article key={s.level}><b>المرحلة {s.phase}</b><h3>{s.level}</h3><p>{shortDate(s.start)} – {shortDate(s.end)}</p><div className={styles.track}><div style={{width:percent(s.completed,s.n)+"%"}}/></div><small>{s.completed} / {s.n} مكتمل</small></article>)}<article><b>المرحلة 4</b><h3>المراجعة النهائية الشاملة</h3><p>20 ديسمبر – 31 ديسمبر 2026</p><small>مراجعة شاملة لجميع المستويات</small></article></div>
    {!original&&<section className={styles.finalReviewPanel} aria-label="تحديث المراجعة الشاملة">
     <div><h3>المراجعة النهائية الشاملة</h3><p>المرحلة الرابعة مستقلة عن مستويات النضج الثلاثة. أدخل التقدم المعتمد يدويًا كما في Excel (K15)، مع مبرر يوثق كل تغيير. لا يؤدي تحديثها إلى تعديل حالة امتثال أي دليل.</p><strong>{(finalReviewProgress*100).toLocaleString("ar-SA",{maximumFractionDigits:2})}%</strong></div>
     <div><button className={styles.actionButton} type="button" aria-haspopup="dialog" onClick={()=>{
      setFinalReviewInput(String(Number((finalReviewProgress*100).toFixed(2))));
      setFinalReviewNote("");setFinalReviewNotice("");setDialogOpen(true);
     }}>تحديث المراجعة الشاملة</button>
      {!dialogOpen&&finalReviewNotice&&<p role="status">{finalReviewNotice}</p>}
     </div>
    </section>}
    <div className={styles.phaseHeader}><h3>مخطط المراحل الأربع — 8 أسابيع</h3><span>منجز / متبقٍ وفق حالة المراجعة</span></div>
    <div className={styles.phaseAxis}><span>المرحلة</span>{Array.from({length:8},(_,i)=><span key={i}>أ{i+1}</span>)}</div>
    {[...stages,{level:"المراجعة النهائية",phase:4,n:stats.total,completed:0,progress:original?0:finalReviewProgress,start:"2026-12-20",end:"2026-12-31"}].map((phase,i)=><div className={styles.phaseBarRow} key={phase.phase}><span>{phase.level}</span><div className={styles.phaseBar}>
      <div className={styles.phaseBlank} style={{width:i*25+"%"}}/>
      <div className={styles.phaseDone} style={{width:(25*phase.progress)+"%"}}/>
      <div className={styles.phaseRemain} style={{width:(25*(1-phase.progress))+"%"}}/>
      <div className={styles.phaseBlank} style={{width:(3-i)*25+"%"}}/>
     </div></div>)}
    <p className={styles.footnote}>مقابل مخطط Excel للمرحلة الأولى والثانية والثالثة والمراجعة الشاملة، موزعة على أسبوعين لكل مرحلة. خطة المكتب الزمنية تغطي مستويات البناء والتعريف والتفعيل. المراحل الثلاث الأولى مبنية على تقدم الأدلة، بينما المرحلة الرابعة تُحدّث يدويًا من مكتب البيانات وتُسجّل في سجل تدقيق مستقل، دون تغيير الامتثال الرسمي.</p>
    <div className={styles.weekly}>{weekly.map(w=><div key={w.week} className={styles.week}><span>الأسبوع {w.week}</span><small>{shortDate(w.until)}</small><div className={styles.track}><div style={{width:w.planned+"%"}}/></div><small>المخطط {w.planned.toLocaleString("ar-SA")}% · {w.future?"لم يبدأ":w.actual===null?"تُراجع لقطة الفترة المحفوظة":"التقدم "+w.actual.toLocaleString("ar-SA",{maximumFractionDigits:2})+"%"}</small></div>)}</div>
    <p className={styles.footnote}>الخطة المستوردة ثمانية أسابيع من نوفمبر إلى ديسمبر ٢٠٢٦. تاريخ الأصل ٥ نوفمبر ٢٠٢٦. تعرض لقطة الدورة المحفوظة الأرقام وقت حفظها.</p>
   </section>
   <p className={styles.footnote}>المرجع: أوراق «متابعة الأدلة الداعمة» و«لوحة البيانات» و«الجدول الزمني» و«Calc» من ملف نُضيء الأصلي. معادلة امتثال الجهة في Calc!B10 تحتسب فقط النص «ممتثل للمعالي فقط»؛ نعرض التناقض مع بقية مسميات المصدر بوضوح دون تغيير أية بيانات. المراجعة تشمل حالة المصدر والأدلة المعتمدة في CGP، واعتماد الدليل لا يحوّله تلقائيًا إلى «ممتثل».</p>
  {dialogOpen&&<AccessibleDialog labelledBy="nudee-final-review-title" backdropClassName={styles.dialogBackdrop} className={styles.dialogPanel} busy={finalReviewSaving} onClose={()=>{setFinalReviewNotice("");setDialogOpen(false)}}>
   <h2 id="nudee-final-review-title">تحديث المراجعة الشاملة</h2>
   <form className={styles.finalReviewForm} onSubmit={e=>{e.preventDefault();void saveFinalReview()}}>
    <label>نسبة التقدم المعتمدة (%)<input required inputMode="decimal" type="number" min="0" max="100" step="0.01" value={finalReviewInput} onChange={e=>setFinalReviewInput(e.target.value)} disabled={finalReviewSaving}/></label>
    <label>مبرر التحديث<textarea required rows={3} maxLength={2000} value={finalReviewNote} onChange={e=>setFinalReviewNote(e.target.value)} disabled={finalReviewSaving}/></label>
    {finalReviewNotice&&<p role="alert">{finalReviewNotice}</p>}
    <div className={styles.dialogActions}><button type="submit" disabled={finalReviewSaving}>{finalReviewSaving?"جارٍ الحفظ…":"حفظ نسبة المراجعة الشاملة"}</button>
     <button type="button" disabled={finalReviewSaving} onClick={()=>{setFinalReviewNotice("");setDialogOpen(false)}}>إلغاء</button></div>
   </form>
  </AccessibleDialog>}
 </>;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCount, NudeeHeading, NudeeMetric, NudeeNavigation } from "../nudee-workspace";
import ui from "../nudee-workspace.module.css";
import styles from "./nudee-dashboard.module.css";

type Requirement = {
 id:number; source_row:number; domain_name:string; standard_code:string; maturity_level:string;
 source_compliance:string|null; source_review_status:string|null; source_progress:number|null;
 schedule_indicator:string|null; planned_start:string|null; planned_end:string|null;
 actual_end:string|null; evidence_name:string; review_phase:string|null;
};
type Assignment = { requirement_id:number; status:string };
type Filter = {domain:string;level:string;compliance:string;review:string};
const ALL="الكل";
const LEVELS=["المستوى 1: البناء","المستوى 2: التعريف","المستوى 3: التفعيل"];
const SOURCE_COMPLIANCE=["ممتثل بالكامل","ممتثل للمعالي فقط","غير ممتثل","لا ينطبق","لم يُقيَّم","حالة غير معيارية"];
const dateFormat=new Intl.DateTimeFormat("ar-SA-u-ca-gregory",{year:"numeric",month:"short",day:"numeric"});
function complianceStatus(value:string|null){
 if(!value?.trim())return "لم يُقيَّم";
 // Mirror the actual Calc!B10 Excel COUNTIFS criterion, not the dashboard heading.
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
function fmtPct(n:number,d:number){return percent(n,d).toLocaleString("ar-SA",{maximumFractionDigits:1})+"%";}
function shortDate(date:string|null){return date?dateFormat.format(new Date(date+"T12:00:00Z")):"—";}
export default function NudeeDashboard(){
 const [records,setRecords]=useState<Requirement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [filter,setFilter]=useState<Filter>({domain:ALL,level:ALL,compliance:ALL,review:ALL});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [finalReviewProgress,setFinalReviewProgress]=useState(0);
 const [finalReviewInput,setFinalReviewInput]=useState("0");
 const [finalReviewNote,setFinalReviewNote]=useState("");
 const [finalReviewSaving,setFinalReviewSaving]=useState(false);
 const [finalReviewNotice,setFinalReviewNotice]=useState("");
 useEffect(()=>{let active=true;void Promise.resolve().then(async()=>{
  await requireProfile(["admin","data_governance_team"]);
  const [r,a,f]=await Promise.all([
   supabase.from("nudee_requirements").select("id,source_row,domain_name,standard_code,maturity_level,source_compliance,source_review_status,source_progress,schedule_indicator,planned_start,planned_end,actual_end,evidence_name,review_phase").order("source_row").limit(1000),
   supabase.from("nudee_assignments").select("requirement_id,status").limit(1000),
   supabase.from("nudee_final_review").select("progress").eq("id",1).single()
  ]);
  if(r.error||a.error||f.error)throw r.error||a.error||f.error;
  if(active){
   setRecords((r.data||[]) as Requirement[]);
   setAssignments((a.data||[]) as Assignment[]);
   const currentProgress=Number(f.data?.progress??0);
   setFinalReviewProgress(currentProgress);
   setFinalReviewInput(String(Math.round(currentProgress*100)));
  }
 }).catch(e=>{if(active)setError(e instanceof Error?e.message:"تعذر تحميل لوحة نُضيء");})
 .finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[]);
 const mapped=useMemo(()=>new Map(assignments.map(a=>[a.requirement_id,a])),[assignments]);
 const domains=useMemo(()=>Array.from(new Set(records.map(r=>r.domain_name))).sort((a,b)=>a.localeCompare(b,"ar")),[records]);
 const reviews=useMemo(()=>Array.from(new Set(records.map(r=>effectiveReview(r,mapped.get(r.id))))).sort((a,b)=>a.localeCompare(b,"ar")),[records,mapped]);
 const rows=useMemo(()=>records.filter(r=>
  (filter.domain===ALL||r.domain_name===filter.domain)&&
  (filter.level===ALL||r.maturity_level===filter.level)&&
  (filter.compliance===ALL||complianceStatus(r.source_compliance)===filter.compliance)&&
  (filter.review===ALL||effectiveReview(r,mapped.get(r.id))===filter.review)
 ),[records,mapped,filter]);
 const stats=useMemo(()=>{
  const count=(condition:(r:Requirement)=>boolean)=>rows.filter(condition).length;
  const full=count(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل");
  const authority=count(r=>complianceStatus(r.source_compliance)==="ممتثل للمعالي فقط");
  const non=count(r=>complianceStatus(r.source_compliance)==="غير ممتثل");
  const na=count(r=>complianceStatus(r.source_compliance)==="لا ينطبق");
  const unknown=count(r=>complianceStatus(r.source_compliance)==="حالة غير معيارية");
  const unassessed=count(r=>complianceStatus(r.source_compliance)==="لم يُقيَّم");
  const reviewed=count(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل");
  const overdue=count(r=>r.schedule_indicator?.trim()==="متأخر");
  return {total:rows.length,full,authority,non,na,unknown,unassessed,reviewed,overdue,assessed:rows.length-unassessed,applicable:rows.length-na,
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
   const residual=n-full-authority-non-na; // Calc!AH30:AH43, includes blanks and nonstandard values.
   return {name,total:n,applicable:n-na,assessed:list.filter(r=>complianceStatus(r.source_compliance)!=="لم يُقيَّم").length,reviewed:list.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length,
    full,authority,non,na,residual,levels:LEVELS.map(level=>{const subset=list.filter(r=>r.maturity_level===level);const denominator=subset.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق").length;return {n:subset.length,rate:denominator?percent(subset.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,denominator):null};})};
  }); // Preserve original Excel domain ordering from source_row; chart series use this same order.
 },[rows,mapped]);
 // Reproduce the eight-week *weighted* Calc!D60:E67 trend, not a count of due evidence.
 // The workbook snapshot uses AsOfDate=2026-11-05; this live view uses the Riyadh date.
 const weekly=useMemo(()=>{
  const today=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Riyadh"});
  return Array.from({length:8},(_,i)=>{
   const start=new Date("2026-11-08T00:00:00Z");start.setUTCDate(start.getUTCDate()+7*i);
   const end=new Date(start);end.setUTCDate(end.getUTCDate()+4);
   const until=end.toISOString().slice(0,10),starts=start.toISOString().slice(0,10);
   const stageRate=LEVELS.map(level=>{
    const list=rows.filter(r=>r.maturity_level===level);
    if(!list.length)return 0;
    if(starts>today)return 0;
    if(until<today)return list.filter(r=>r.actual_end&&r.actual_end<=until&&effectiveReview(r,mapped.get(r.id))==="مكتمل").length/list.length;
    return list.reduce((sum,r)=>sum+evidenceProgress(r,mapped.get(r.id)),0)/list.length;
   });
   // Calc!E60:E67 weighs four independent phases at 25% each.
   // Its fourth stage is the Data Office's manual comprehensive-review progress
   // (Excel!K15), not another maturity level and not automatic evidence approval.
   const daysAfterPhase4=(Date.parse(until+"T00:00:00Z")-Date.parse("2026-12-20T00:00:00Z"))/86400000;
   const historicalPhase4=Math.min(finalReviewProgress,Math.max(0,Math.min(1,(daysAfterPhase4+3)/14)));
   const phase4Rate=until<"2026-12-20"?0:until<today?historicalPhase4:finalReviewProgress;
   return {week:i+1,until,planned:(i+1)*12.5,actual:starts>today?0:25*(stageRate.reduce((a,b)=>a+b,0)+phase4Rate)};
  });
 },[rows,mapped,finalReviewProgress]);
 async function saveFinalReview(){
  setFinalReviewNotice("");
  const percentValue=Number(finalReviewInput);
  if(!finalReviewInput.trim()||!Number.isFinite(percentValue)||percentValue<0||percentValue>100){
   setFinalReviewNotice("أدخل نسبة صحيحة من 0 إلى 100.");return;
  }
  if(!finalReviewNote.trim()){setFinalReviewNotice("أدخل ملاحظات تبرر تحديث المراجعة الشاملة.");return;}
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
  }catch(e){
   setFinalReviewNotice(e instanceof Error?e.message:"تعذر تحديث المراجعة الشاملة.");
  }finally{setFinalReviewSaving(false)}
 }
 const stages=LEVELS.map((level,i)=>{const subset=rows.filter(r=>r.maturity_level===level);
  const completed=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;
  // Excel timetable uses SUM(source_progress)/COUNT, including partial work (50%, 25%).
  const progress=subset.length?subset.reduce((sum,r)=>sum+evidenceProgress(r,mapped.get(r.id)),0)/subset.length:0;
  return {level,phase:i+1,n:subset.length,completed,progress,start:subset.map(r=>r.planned_start).filter((x):x is string=>Boolean(x)).sort()[0]||null,
   end:subset.map(r=>r.planned_end).filter((x):x is string=>Boolean(x)).sort().at(-1)||null};
 });
 const hasFilters=Object.values(filter).some(x=>x!==ALL);
 function field<K extends keyof Filter>(key:K,value:string){setFilter(f=>({...f,[key]:value}));}
 const complianceCategories = [
  {label:"ممتثل بالكامل", color:"#147667"},
  {label:"ممتثل للمعالي فقط", color:"#5074a4"},
  {label:"غير ممتثل", color:"#b65a4d"},
  {label:"لا ينطبق", color:"#82949c"},
  {label:"غير مقيّم أو غير معياري", color:"#cad6db"},
 ];
 const complianceSummary = [
  ["ممتثل بالكامل", stats.full, fmtPct(stats.full,stats.applicable)+" من الأدلة المنطبقة"],
  ["ممتثل للمعالي فقط", stats.authority, fmtPct(stats.authority,stats.applicable)+" من الأدلة المنطبقة"],
  ["غير ممتثل", stats.non, fmtPct(stats.non,stats.applicable)+" من الأدلة المنطبقة"],
  ["غير منطبق", stats.na, "مستبعد من مقام الامتثال"],
  ["غير مقيّم", stats.unassessed, fmtPct(stats.assessed,stats.total)+" تم تقييمها"],
 ] as const;
 const phases=[...stages,{level:"المراجعة النهائية الشاملة",phase:4,progress:finalReviewProgress,start:"2026-12-20",end:"2026-12-31"}];

 return (
  <main className={ui.workspace} dir="rtl">
   <NudeeHeading title="لوحة مؤشر نُضيء" description="الامتثال من بيانات Excel الأصلية، والإنجاز من مراجعات الأدلة في المنصة.">
    <NudeeNavigation current="dashboard" />
   </NudeeHeading>
   {loading ? <p role="status" className={ui.message}>جاري تحميل بيانات المؤشر…</p>
    : error ? <div className={`${ui.message} ${ui.error}`}>
      <p role="alert">{error}</p><button type="button" className={ui.button} onClick={()=>window.location.reload()}>إعادة تحميل البيانات</button>
     </div>
    : !records.length ? <p role="status" className={ui.message}>لم تُستورد متطلبات المؤشر بعد.</p>
    : <>
     <section className={`${ui.panel} ${styles.filters}`} aria-labelledby="nudee-filter-title">
      <div className={styles.sectionHeader}>
       <div><h2 id="nudee-filter-title">تصفية بيانات المؤشر</h2>
        <p role="status" className={ui.description}>المعروض: {formatCount.format(stats.total)} من أصل {formatCount.format(records.length)} دليل</p>
       </div>
       <button type="button" className={ui.button} disabled={!hasFilters} onClick={()=>setFilter({domain:ALL,level:ALL,compliance:ALL,review:ALL})}>مسح التصفية</button>
      </div>
      <div className={styles.filterFields}>
       <label className={ui.field}>المجال<select value={filter.domain} onChange={e=>field("domain",e.target.value)}>{[ALL,...domains].map(v=><option key={v}>{v}</option>)}</select></label>
       <label className={ui.field}>مستوى النضج<select value={filter.level} onChange={e=>field("level",e.target.value)}>{[ALL,...LEVELS].map(v=><option key={v}>{v}</option>)}</select></label>
       <label className={ui.field}>حالة الامتثال<select value={filter.compliance} onChange={e=>field("compliance",e.target.value)}>{[ALL,...SOURCE_COMPLIANCE].map(v=><option key={v}>{v}</option>)}</select></label>
       <label className={ui.field}>حالة المراجعة<select value={filter.review} onChange={e=>field("review",e.target.value)}>{[ALL,...reviews].map(v=><option key={v}>{v}</option>)}</select></label>
      </div>
     </section>
     {!rows.length && <p role="status" className={ui.message}>لا توجد أدلة تطابق عوامل التصفية الحالية.</p>}
     <section className={ui.summary} aria-labelledby="nudee-dashboard-summary">
      <h2 id="nudee-dashboard-summary">ملخص المؤشر</h2>
      <div className={`${ui.metrics} ${styles.primaryMetrics}`}>
       <NudeeMetric label="إجمالي الأدلة" value={stats.total} detail="ضمن التصفية الحالية" />
       <NudeeMetric label="امتثال NDMO" value={fmtPct(stats.full,stats.applicable)} detail="ممتثل بالكامل ÷ الأدلة المنطبقة" />
       <NudeeMetric label="إنجاز مراجعة الأدلة" value={fmtPct(stats.reviewed,stats.total)} detail={formatCount.format(stats.reviewed)+" من "+formatCount.format(stats.total)+" مكتمل"} />
       <NudeeMetric label="متأخر عن الجدول" value={stats.overdue} detail="وفق مؤشر الجدول الزمني في Excel" />
      </div>
      <dl className={`${ui.panel} ${styles.complianceSummary}`}>
       {complianceSummary.map(([label,value,detail])=><div key={label}>
        <dt>{label}</dt><dd><strong>{formatCount.format(value)}</strong><small>{detail}</small></dd>
       </div>)}
      </dl>
     </section>
     <section className={`${ui.panel} ${styles.workflow}`}>
      <div><h2>دورة التكليف في CGP</h2><p className={ui.description}>حالات الأدلة داخل المنصة، مستقلة عن الامتثال الرسمي في Excel.</p></div>
      <dl className={styles.flowNumbers}>
       <div><dt>المسندة</dt><dd>{formatCount.format(stats.assigned)}</dd></div>
       <div><dt>بانتظار التحقق</dt><dd>{formatCount.format(stats.submitted)}</dd></div>
       <div><dt>المعتمدة</dt><dd>{formatCount.format(stats.approved)}</dd></div>
      </dl>
     </section>
     {stats.unknown>0 && <p role="note" className={`${ui.message} ${ui.warning}`}>تنبيه جودة البيانات: {formatCount.format(stats.unknown)} قيمة غير معيارية. تحتسب معادلة Excel «ممتثل للمعالي فقط»، وتبقى القيم الأخرى مثل «ممتثل لمتطلبات الهيئة» كما وردت في المصدر.</p>}

     <div className={styles.twoCols}>
      <section className={ui.panel}>
       <h2>حالة الامتثال</h2>
       <p className={ui.description}>امتثال متطلبات الهيئة <bdi>{fmtPct(stats.full+stats.authority,stats.applicable)}</bdi></p>
       <div className={styles.chartRows}>
        {[
         ["ممتثل بالكامل",stats.full],["ممتثل للمعالي فقط",stats.authority],
         ["غير ممتثل",stats.non],["غير منطبق",stats.na],["لم يُقيّم",stats.unassessed],["حالة غير معيارية",stats.unknown]
        ].map(([label,count])=><div className={styles.barItem} key={label}>
         <div><span>{label}</span><strong>{formatCount.format(Number(count))}</strong></div>
         <div className={styles.track} aria-hidden="true"><span style={{width:(stats.total?100*Number(count)/stats.total:0)+"%"}} /></div>
        </div>)}
       </div>
      </section>
      <section className={ui.panel}>
       <h2>الأدلة حسب مستوى النضج</h2>
       <p className={ui.description}>توزيع الأدلة ونتائج المراجعة للمستويات الثلاثة.</p>
       <div className={styles.chartRows}>
        {LEVELS.map(level=>{
         const subset=rows.filter(r=>r.maturity_level===level);
         const done=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;
         return <div className={styles.levelRow} key={level}>
          <div><span>{level}</span><strong>{formatCount.format(subset.length)}</strong></div>
          <div className={styles.track} aria-hidden="true"><span style={{width:(rows.length?100*subset.length/rows.length:0)+"%"}} /></div>
          <small>مكتمل {formatCount.format(done)} · <bdi>{fmtPct(done,subset.length)}</bdi></small>
         </div>;
        })}
       </div>
      </section>
     </div>

     <section className={ui.panel}>
      <h2 id="nudee-domain-matrix">مصفوفة الامتثال حسب المجال</h2>
      <p id="nudee-matrix-description" className={ui.description}>{formatCount.format(domainMatrix.length)} مجال · الامتثال حسب مستوى النضج وحالة الأدلة.</p>
      <p className={styles.scrollHint}>مرّر أفقيًا لعرض بقية الأعمدة.</p>
      <div className={styles.tableScroll} role="region" tabIndex={0} aria-labelledby="nudee-domain-matrix" aria-describedby="nudee-matrix-description">
       <table>
        <thead><tr><th scope="col">المجال</th>
         {LEVELS.map((level,i)=><th key={level} scope="col">المستوى {formatCount.format(i+1)}</th>)}
         <th scope="col" lang="en">NDMO</th><th scope="col">متطلبات الهيئة</th><th scope="col">الأدلة</th><th scope="col">المنطبقة</th><th scope="col">المقيّمة</th><th scope="col">المراجعة المكتملة</th>
        </tr></thead>
        <tbody>
         {domainMatrix.map(d=><tr key={d.name}><th scope="row">{d.name}</th>
          {d.levels.map((l,i)=><td key={i} title={formatCount.format(l.n)+" دليل"}><bdi>{l.rate===null?"—":l.rate.toLocaleString("ar-SA")+"%"}</bdi></td>)}
          <td><bdi>{fmtPct(d.full,d.applicable)}</bdi></td><td><bdi>{fmtPct(d.full+d.authority,d.applicable)}</bdi></td>
          <td>{formatCount.format(d.total)}</td><td>{formatCount.format(d.applicable)}</td><td>{formatCount.format(d.assessed)}</td><td>{formatCount.format(d.reviewed)}</td>
         </tr>)}
         <tr className={styles.totalRow}><th scope="row">الإجمالي</th>
          {LEVELS.map(level=>{
           const a=rows.filter(r=>r.maturity_level===level);
           const valid=a.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق");
           return <td key={level}><bdi>{valid.length?fmtPct(valid.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,valid.length):"—"}</bdi></td>;
          })}
          <td><bdi>{fmtPct(stats.full,stats.applicable)}</bdi></td><td><bdi>{fmtPct(stats.full+stats.authority,stats.applicable)}</bdi></td>
          <td>{formatCount.format(stats.total)}</td><td>{formatCount.format(stats.applicable)}</td><td>{formatCount.format(stats.assessed)}</td><td>{formatCount.format(stats.reviewed)}</td>
         </tr>
        </tbody>
       </table>
      </div>
     </section>

     <section className={ui.panel}>
      <h2>امتثال NDMO حسب المجال ومستوى النضج</h2>
      <p className={ui.description}>نسبة الامتثال من الأدلة المنطبقة لكل مستوى. تعرض الشرطة غياب أدلة منطبقة.</p>
      <table className={styles.domainTable}>
       <thead><tr><th scope="col">المجال</th>{LEVELS.map(level=><th scope="col" key={level}>{level}</th>)}</tr></thead>
       <tbody>{domainMatrix.map(d=><tr key={d.name}>
        <th scope="row">{d.name}</th>
        {d.levels.map(({rate},index)=><td key={LEVELS[index]}>
         <bdi>{rate===null?"—":rate.toLocaleString("ar-SA")+"%"}</bdi>
         <div className={styles.track} aria-hidden="true"><span style={{width:(rate??0)+"%"}} /></div>
        </td>)}
       </tr>)}</tbody>
      </table>
     </section>

     <section className={ui.panel}>
      <h2>توزيع حالة الامتثال في المجالات</h2>
      <p className={ui.description}>يمثل طول الشريط حصة كل حالة من أدلة المجال.</p>
      <ul className={styles.legend}>{complianceCategories.map(({label,color})=><li key={label}><i aria-hidden="true" style={{background:color}} />{label}</li>)}</ul>
      <div className={styles.stackedList}>{domainMatrix.map(d=><div className={styles.stackedRow} key={d.name}>
       <span>{d.name}</span>
       <div className={styles.stackedTrack} role="img" aria-label={d.name+": "+d.full+" ممتثل بالكامل، "+d.authority+" ممتثل للمعالي، "+d.non+" غير ممتثل، "+d.na+" لا ينطبق، "+d.residual+" غير مقيّم أو غير معياري"}>
        {[d.full,d.authority,d.non,d.na,d.residual].map((count,i)=><span key={complianceCategories[i].label} style={{width:(d.total?100*count/d.total:0)+"%",background:complianceCategories[i].color}} />)}
       </div>
       <strong>{formatCount.format(d.total)}</strong>
      </div>)}</div>
     </section>

     <section className={ui.panel}>
      <h2>الجدول الزمني لمراجعة الأدلة</h2>
      <p className={ui.description}>ثمانية أسابيع من ٨ نوفمبر إلى ٣١ ديسمبر ٢٠٢٦، موزعة على أربع مراحل.</p>
      <ol className={styles.stages}>
       {phases.map(phase=><li key={phase.phase}>
        <div className={styles.stageHeading}><span aria-label={"المرحلة "+formatCount.format(phase.phase)}>{formatCount.format(phase.phase)}</span><h3>{phase.level}</h3></div>
        <p>{shortDate(phase.start)} – {shortDate(phase.end)}</p>
        <div className={styles.track} aria-hidden="true"><span style={{width:("completed" in phase?percent(phase.completed,phase.n):finalReviewProgress*100)+"%"}} /></div>
        <small>{"completed" in phase
         ? <><bdi>{formatCount.format(phase.completed)} / {formatCount.format(phase.n)}</bdi> مكتمل</>
         : <>تقدم معتمد <bdi>{(finalReviewProgress*100).toLocaleString("ar-SA",{maximumFractionDigits:2})}%</bdi></>}
        </small>
       </li>)}
      </ol>
      <div className={styles.sectionHeader}>
       <h3 id="nudee-phase-chart">مخطط المراحل حسب الأسبوع</h3>
       <ul className={styles.legend}><li><i className={styles.phaseDone} />منجز</li><li><i className={styles.phaseRemain} />متبقٍ</li></ul>
      </div>
      <div className={styles.phaseScroll} role="region" aria-labelledby="nudee-phase-chart" tabIndex={0}>
       <div className={styles.phaseGrid}>
        <div className={styles.phaseAxis}><span>المرحلة</span>{Array.from({length:8},(_,i)=><span key={i}>{formatCount.format(i+1)}</span>)}</div>
        {phases.map((phase,i)=><div className={styles.phaseBarRow} key={phase.phase}>
         <span>{phase.level}</span>
         <div className={styles.phaseBar} role="img" aria-label={"الأسبوع "+formatCount.format(i*2+1)+" إلى "+formatCount.format(i*2+2)+"، منجز "+fmtPct(phase.progress,1)}>
          <div className={styles.phaseDone} style={{width:(25*phase.progress)+"%",marginInlineStart:i*25+"%"}} />
          <div className={styles.phaseRemain} style={{width:(25*(1-phase.progress))+"%"}} />
         </div>
        </div>)}
       </div>
      </div>
      <p className={styles.footnote}>يعرض المخطط التقدم الموزون للأدلة. المرحلة الرابعة تُحدّث يدويًا من مكتب إدارة البيانات وتُسجّل في سجل تدقيق مستقل.</p>
     </section>

     <section className={ui.panel}>
      <h2>التوزيع الأسبوعي</h2>
      <p className={ui.description}>مقارنة التقدم التراكمي المخطط والفعلي، وفق تاريخ القياس في الرياض.</p>
      <ul className={styles.legend}><li><i className={styles.phaseRemain} />المخطط</li><li><i className={styles.phaseDone} />الفعلي</li></ul>
      <ol className={styles.weekly}>
       {weekly.map(w=><li key={w.week} className={styles.week}>
        <div className={styles.weekLabel}><strong>الأسبوع {formatCount.format(w.week)}</strong><time dateTime={w.until}>{shortDate(w.until)}</time></div>
        <div className={styles.weekPlot}>
         <div className={styles.track} aria-hidden="true"><span className={styles.planned} style={{width:w.planned+"%"}} /></div>
         <bdi><span className="sr-only">المخطط </span>{w.planned.toLocaleString("ar-SA")}%</bdi>
         <div className={styles.track} aria-hidden="true"><span style={{width:w.actual+"%"}} /></div>
         <bdi><span className="sr-only">الفعلي </span>{w.actual.toLocaleString("ar-SA",{maximumFractionDigits:2})}%</bdi>
        </div>
       </li>)}
      </ol>
      <p className={styles.footnote}>المخطط يزيد بمقدار ١٢٫٥٪ كل أسبوع (Calc!D60:D67). الفعلي يجمع المراحل الأربع بأوزان متساوية، ويستخدم تواريخ الإنجاز الفعلية للأسابيع المكتملة. تاريخ القياس في المصنف الأصلي هو ٥ نوفمبر ٢٠٢٦.</p>
     </section>

     <section className={`${ui.panel} ${styles.finalReviewPanel}`} aria-labelledby="nudee-final-review">
      <div>
       <h2 id="nudee-final-review">تحديث المراجعة النهائية الشاملة</h2>
       <p className={ui.description}>أدخل نسبة المرحلة الرابعة كما في Excel (K15)، مع مبرر يوثق التحديث.</p>
       <output className={styles.finalValue} aria-label="التقدم المعتمد حاليًا"><bdi>{(finalReviewProgress*100).toLocaleString("ar-SA",{maximumFractionDigits:2})}%</bdi></output>
      </div>
      <div className={styles.finalReviewForm}>
       <label className={ui.field}>نسبة التقدم المعتمدة (%)<input inputMode="decimal" type="number" min="0" max="100" step="0.01" value={finalReviewInput} onChange={e=>setFinalReviewInput(e.target.value)} disabled={finalReviewSaving} /></label>
       <label className={ui.field}>مبرر التحديث<textarea rows={2} maxLength={2000} value={finalReviewNote} onChange={e=>setFinalReviewNote(e.target.value)} disabled={finalReviewSaving} placeholder="ملاحظات مسؤول مكتب إدارة البيانات" /></label>
       <button className={`${ui.button} ${ui.primary}`} type="button" onClick={saveFinalReview} disabled={finalReviewSaving||!finalReviewNote.trim()||!finalReviewInput.trim()}>{finalReviewSaving?"جاري الحفظ...":"حفظ نسبة المراجعة الشاملة"}</button>
       {finalReviewNotice && <p role="status" className={ui.message}>{finalReviewNotice}</p>}
      </div>
     </section>
     <p className={styles.footnote}>المصدر: أوراق «متابعة الأدلة الداعمة» و«لوحة البيانات» و«الجدول الزمني» و«Calc» من ملف نُضيء. امتثال الجهة يتبع معيار النص في Calc!B10، وتستند رسوم المجالات إلى Calc!H30:H43 وQ30:Q43 وZ30:Z43 وAD30:AH43. اعتماد الدليل يحدّث المراجعة داخل المنصة، وتظل حالة الامتثال من المصدر.</p>
    </>}
  </main>
 );
}

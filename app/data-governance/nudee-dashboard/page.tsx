"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
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
function percent(n:number,d:number){return d?Math.round(1000*n/d)/10:0;}
function fmtPct(n:number,d:number){return percent(n,d).toLocaleString("ar-SA",{maximumFractionDigits:1})+"%";}
function shortDate(date:string|null){return date?dateFormat.format(new Date(date+"T12:00:00Z")):"—";}
export default function NudeeDashboard(){
 const [records,setRecords]=useState<Requirement[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [filter,setFilter]=useState<Filter>({domain:ALL,level:ALL,compliance:ALL,review:ALL});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{let active=true;void Promise.resolve().then(async()=>{
  await requireProfile(["admin","data_governance_team"]);
  const [r,a]=await Promise.all([
   supabase.from("nudee_requirements").select("id,source_row,domain_name,standard_code,maturity_level,source_compliance,source_review_status,source_progress,schedule_indicator,planned_start,planned_end,actual_end,evidence_name,review_phase").order("source_row").limit(1000),
   supabase.from("nudee_assignments").select("requirement_id,status").limit(1000)
  ]);
  if(r.error||a.error)throw r.error||a.error;
  if(active){setRecords((r.data||[]) as Requirement[]);setAssignments((a.data||[]) as Assignment[]);}
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
  const now=new Date();const today=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0")+"-"+String(now.getDate()).padStart(2,"0");
  const overdue=count(r=>Boolean(r.planned_end&&r.planned_end<today&&effectiveReview(r,mapped.get(r.id))!=="مكتمل"));
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
   return {name,total:n,applicable:n-na,assessed:list.filter(r=>complianceStatus(r.source_compliance)!=="لم يُقيَّم").length,reviewed:list.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length,
    full,authority,levels:LEVELS.map(level=>{const subset=list.filter(r=>r.maturity_level===level);const denominator=subset.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق").length;return {n:subset.length,rate:denominator?percent(subset.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,denominator):null};})};
  }).sort((a,b)=>b.total-a.total);
 },[rows,mapped]);
 const weekly=useMemo(()=>Array.from({length:8},(_,i)=>{
  const start=new Date("2026-11-08T00:00:00Z");start.setUTCDate(start.getUTCDate()+7*i);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+4);
  const d=end.toISOString().slice(0,10);
  return {week:i+1,until:d,planned:rows.filter(r=>r.planned_end&&r.planned_end<=d).length,
   actual:rows.filter(r=>r.actual_end&&r.actual_end<=d&&effectiveReview(r,mapped.get(r.id))==="مكتمل").length};
 }),[rows,mapped]);
 const stages=LEVELS.map((level,i)=>{const subset=rows.filter(r=>r.maturity_level===level);
  const completed=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;
  return {level,phase:i+1,n:subset.length,completed,start:subset.map(r=>r.planned_start).filter((x):x is string=>Boolean(x)).sort()[0]||null,
   end:subset.map(r=>r.planned_end).filter((x):x is string=>Boolean(x)).sort().at(-1)||null};
 });
 const hasFilters=Object.values(filter).some(x=>x!==ALL);
 function field<K extends keyof Filter>(key:K,value:string){setFilter(f=>({...f,[key]:value}));}
 return <main className={styles.root} dir="rtl">
  <header className={styles.heading}><div><span className={styles.eyebrow}>مكتب إدارة البيانات · المؤشر الوطني للبيانات</span><h1>لوحة مؤشر نُضيء</h1><p>قياس الامتثال ومراجعة الأدلة ومتابعة الإنجاز، وفق بيانات Excel الأصلية وتكليفات CGP المباشرة.</p></div><Link className={styles.back} href="/data-governance/nudee">التكليفات والأدلة</Link></header>
  <nav className={styles.tabbar} aria-label="صفحات مؤشر نُضيء"><Link href="/data-governance/nudee">إدارة التكليفات</Link><Link aria-current="page" href="/data-governance/nudee-dashboard">لوحة البيانات</Link></nav>
  {error&&<div role="alert" className={styles.alert}>{error}</div>}
  {loading?<p role="status">جاري تحميل بيانات المؤشر…</p>:error?<div role="status" className={styles.alert}>تعذر عرض بيانات المؤشر. تحقق من الاتصال والصلاحيات ثم أعد تحميل الصفحة.</div>:!records.length?<div role="status" className={styles.alert}>لم تُستورد متطلبات المؤشر بعد. يرجى إكمال استيراد المصدر والتحقق منه.</div>:<>
   <section className={styles.filters} aria-label="تصفية بيانات المؤشر">
    <label>مستوى النضج<select value={filter.level} onChange={e=>field("level",e.target.value)}>{[ALL,...LEVELS].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>المجال<select value={filter.domain} onChange={e=>field("domain",e.target.value)}>{[ALL,...domains].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>حالة الامتثال<select value={filter.compliance} onChange={e=>field("compliance",e.target.value)}>{[ALL,...SOURCE_COMPLIANCE].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>حالة المراجعة<select value={filter.review} onChange={e=>field("review",e.target.value)}>{[ALL,...reviews].map(v=><option key={v}>{v}</option>)}</select></label>
    <div className={styles.filterBottom}><span>المعروض: {stats.total.toLocaleString("ar-SA")} من أصل {records.length.toLocaleString("ar-SA")} دليل</span><button disabled={!hasFilters} onClick={()=>setFilter({domain:ALL,level:ALL,compliance:ALL,review:ALL})}>مسح التصفية</button></div>
   </section>
   <section className={styles.metrics} aria-label="مؤشرات الامتثال">
    {[
     ["إجمالي الأدلة",stats.total,"يتضمن جميع الأدلة في التصفية"],
     ["ممتثل بالكامل",stats.full,fmtPct(stats.full,stats.applicable)+" من الأدلة المنطبقة"],
     ["ممتثل لمتطلبات الهيئة حسب معادلة Excel",stats.authority,fmtPct(stats.authority,stats.applicable)+" من الأدلة المنطبقة"],
     ["غير ممتثل",stats.non,fmtPct(stats.non,stats.applicable)+" من الأدلة المنطبقة"],
     ["غير منطبق",stats.na,"مستبعد من مقام الامتثال"],
     ["غير مقيّم",stats.unassessed,fmtPct(stats.assessed,stats.total)+" تم تقييمها"],
     ["امتثال NDMO",fmtPct(stats.full,stats.applicable),"ممتثل بالكامل ÷ الأدلة المنطبقة"],
     ["إنجاز مراجعة الأدلة",fmtPct(stats.reviewed,stats.total),stats.reviewed+" من "+stats.total+" مكتمل"],
     ["متأخر عن الجدول",stats.overdue,"وفق تاريخ اليوم والاستحقاق المخطط"]
    ].map(([label,value,detail])=><article className={styles.metric} key={label}><span>{label}</span><strong>{typeof value==="number"?value.toLocaleString("ar-SA"):value}</strong><small>{detail}</small></article>)}
   </section>
   <section className={styles.workflow}><div><span>دورة التكليف في CGP</span><p>تُعرض حالات الأدلة داخل المنصة بصورة منفصلة عن تصنيف الامتثال الرسمي في Excel.</p></div><div className={styles.flowNumbers}><span>المسندة <b>{stats.assigned}</b></span><span>بانتظار التحقق <b>{stats.submitted}</b></span><span>المعتمدة <b>{stats.approved}</b></span></div></section>
   {stats.unknown>0&&<p role="note" className={styles.warning}>تنبيه جودة بيانات: توجد {stats.unknown} قيمة لا تدخل في نتائج معادلات Excel الأصلية (مثل «ممتثل لمتطلبات الهيئة»)، بينما تحسب المعادلة «ممتثل للمعالي فقط». احتفظنا بالقيم الأصلية ولم نعدلها أو نحتسبها كممتثلة.</p>}
   <div className={styles.twoCols}>
    <section className={styles.panel}><h2>حالة الامتثال للمؤشر</h2><p>إجمالي الامتثال لمتطلبات NDMO: {fmtPct(stats.full,stats.applicable)} · امتثال متطلبات الهيئة: {fmtPct(stats.full+stats.authority,stats.applicable)}</p>
     {[["ممتثل بالكامل",stats.full],["ممتثل للمعالي فقط (صيغة Excel)",stats.authority],["غير ممتثل",stats.non],["غير منطبق",stats.na],["لم يُقيّم",stats.unassessed],["حالة غير معيارية",stats.unknown]].map(([label,n])=><div className={styles.barItem} key={label}><div><span>{label}</span><b>{n}</b></div><div className={styles.track}><div style={{width:(stats.total?100*Number(n)/stats.total:0)+"%"}}/></div></div>)}
    </section>
    <section className={styles.panel}><h2>الأدلة حسب مستوى النضج</h2><p>توزيع الأدلة ونتائج المراجعة للمستويات الثلاثة.</p>
    {LEVELS.map(level=>{const subset=rows.filter(r=>r.maturity_level===level),done=subset.filter(r=>effectiveReview(r,mapped.get(r.id))==="مكتمل").length;return <div className={styles.levelRow} key={level}><span>{level}</span><strong>{subset.length}</strong><div className={styles.track}><div style={{width:(rows.length?100*subset.length/rows.length:0)+"%"}}/></div><small>مكتمل {done} · {fmtPct(done,subset.length)}</small></div>})}
    </section>
   </div>
   <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>مصفوفة الامتثال حسب المجال</h2><p>المجالات الأربعة عشر، النضج، عدد الأدلة المنطبقة والمقيّمة والمكتملة.</p></div><span className={styles.meta}>{domainMatrix.length} مجال</span></div><div className={styles.tableScroll}><table><thead><tr><th>المجال</th>{LEVELS.map((level,i)=><th key={level}>المستوى {i+1}</th>)}<th>NDMO</th><th>متطلبات الهيئة</th><th>الأدلة</th><th>المنطبقة</th><th>المقيّمة</th><th>المراجعة المكتملة</th></tr></thead><tbody>{domainMatrix.map(d=><tr key={d.name}><th scope="row">{d.name}</th>{d.levels.map((l,i)=><td key={i} title={l.n+" دليل"}>{l.rate===null?"—":l.rate.toLocaleString("ar-SA")+"%"}</td>)}<td>{fmtPct(d.full,d.applicable)}</td><td>{fmtPct(d.full+d.authority,d.applicable)}</td><td>{d.total}</td><td>{d.applicable}</td><td>{d.assessed}</td><td>{d.reviewed}</td></tr>)}<tr className={styles.totalRow}><th scope="row">الإجمالي</th>{LEVELS.map(level=>{const a=rows.filter(r=>r.maturity_level===level);const valid=a.filter(r=>complianceStatus(r.source_compliance)!=="لا ينطبق");return <td key={level}>{valid.length?fmtPct(valid.filter(r=>complianceStatus(r.source_compliance)==="ممتثل بالكامل").length,valid.length):"—"}</td>})}<td>{fmtPct(stats.full,stats.applicable)}</td><td>{fmtPct(stats.full+stats.authority,stats.applicable)}</td><td>{stats.total}</td><td>{stats.applicable}</td><td>{stats.assessed}</td><td>{stats.reviewed}</td></tr></tbody></table></div></section>
   <section className={styles.panel}><div className={styles.sectionHeader}><div><h2>الجدول الزمني ومراجعة الأدلة</h2><p>البرنامج الأساسي: 8 أسابيع تبدأ في 8 نوفمبر 2026. يظهر الإنجاز المؤرخ فقط في الرسم الزمني.</p></div><span className={styles.meta}>8 أسابيع</span></div>
    <div className={styles.stages}>{stages.map(s=><article key={s.level}><b>المرحلة {s.phase}</b><h3>{s.level}</h3><p>{shortDate(s.start)} – {shortDate(s.end)}</p><div className={styles.track}><div style={{width:percent(s.completed,s.n)+"%"}}/></div><small>{s.completed} / {s.n} مكتمل</small></article>)}<article><b>المرحلة 4</b><h3>المراجعة النهائية الشاملة</h3><p>20 ديسمبر – 31 ديسمبر 2026</p><small>مراجعة شاملة لجميع المستويات</small></article></div>
    <div className={styles.weekly}>{weekly.map(w=><div key={w.week} className={styles.week}><span>الأسبوع {w.week}</span><small>{shortDate(w.until)}</small><div className={styles.track}><div style={{width:percent(w.planned,stats.total)+"%"}}/></div><div className={styles.track+" "+styles.actual}><div style={{width:percent(w.actual,stats.total)+"%"}}/></div><small>المخطط {w.planned} · المؤرخ {w.actual}</small></div>)}</div>
    <p className={styles.footnote}>المخطط: الأدلة المستحقة حتى نهاية الأسبوع. الفعلي: الأدلة المكتملة التي لها تاريخ انتهاء فعلي. قد توجد أدلة مكتملة دون تاريخ، فلا تُنسب إلى أسبوع محدد.</p>
   </section>
   <p className={styles.footnote}>المرجع: أوراق «متابعة الأدلة الداعمة» و«لوحة البيانات» و«الجدول الزمني» و«Calc» من ملف نُضيء الأصلي. معادلة امتثال الجهة في Calc!B10 تحتسب فقط النص «ممتثل للمعالي فقط»؛ نعرض التناقض مع بقية مسميات المصدر بوضوح دون تغيير أية بيانات. المراجعة تشمل حالة المصدر والأدلة المعتمدة في CGP، واعتماد الدليل لا يحوّله تلقائيًا إلى «ممتثل».</p>
  </>}
 </main>;
}

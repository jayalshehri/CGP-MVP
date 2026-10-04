'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {cycleLabels,displayPercent} from '@/lib/assessment';
import {todayRiyadh} from '@/lib/grc';
import './assessment-portfolio.css';
type Summary={id:number;framework:string;framework_version:string;scope_name:string;status:string;total:number;assessed:number;not_applicable:number;compliant:number;compliance:number|null;completion:number|null;open_gaps:number;critical_gaps:number;overdue_actions:number;missing_data:number;pending_evidence:number;evidence_needing_refresh:number;improvement:number|null;due_date:string|null;next_review_date:string|null;approved_at:string|null};
export const assessmentPath=(code:string)=>({CSCC:'/assessments',DCC:'/dcc-assessment',TCC:'/tcc-assessment',OSMACC:'/osmacc-assessment'}[code]??'/assessments');
export default function AssessmentPortfolio({framework,view='all'}:{framework?:string;view?:'all'|'attention'|'schedule'}){
 const [rows,setRows]=useState<Summary[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[filter,setFilter]=useState('');
 useEffect(()=>{let active=true;void supabase.rpc('cgp_assessment_summary').then(r=>{if(active){setError(r.error?.message??'');setRows(r.data??[]);setLoading(false);}});return()=>{active=false;};},[]);
 const needsAttention=(r:Summary)=>r.missing_data>0||r.overdue_actions>0||r.critical_gaps>0||r.pending_evidence>0||r.status==='completed'||r.evidence_needing_refresh>0||!!(r.next_review_date&&r.next_review_date<=todayRiyadh())||!!(r.due_date&&r.due_date<todayRiyadh()&&!['approved','closed'].includes(r.status));
 const visible=rows.filter(r=>view==='all'||(view==='attention'?needsAttention(r):!!r.next_review_date)).filter(r=>(!framework||r.framework===framework)&&(!filter||(filter==='approved'?['approved','closed'].includes(r.status):filter==='attention'?needsAttention(r):!['approved','closed'].includes(r.status))));
 return <AssessmentPortfolioView rows={visible} view={view} filter={filter} onFilter={setFilter} loading={loading} error={error}/>;
}

export function AssessmentPortfolioView({rows,view,filter,onFilter,loading,error}:{rows:Summary[];view:'all'|'attention'|'schedule';filter:string;onFilter:(value:string)=>void;loading:boolean;error:string}) {
 return <section className="workflow-card cycle-portfolio" dir="rtl">
  <header className="cycle-portfolio-heading"><div><h2>{view==='schedule'?'مواعيد إعادة تقييم الأطر':view==='attention'?'تقييمات تحتاج متابعة':'دورات قياس الالتزام حسب النطاق'}</h2><p>كل صف يمثل نطاقًا ودورة. النتائج المعتمدة مستقلة عن حالة التطبيق العامة، ولا يُحتسب متوسط بين نطاقات مختلفة.</p></div>
   <label>عرض الدورات<select value={filter} onChange={e=>onFilter(e.target.value)}><option value="">جميع الدورات</option><option value="approved">المعتمدة</option><option value="progress">قيد العمل</option><option value="attention">تحتاج إجراءً</option></select></label></header>
  {error&&<p role="alert">تعذر تحميل مؤشرات التقييم: {error}</p>}
  {loading?<p role="status">جاري تحميل التقييمات…</p>:!rows.length?<p className="workflow-empty">لا توجد دورات مطابقة ضمن صلاحياتك.</p>:<>
   <p className="cycle-result-count" role="status">{rows.length} دورة ضمن التصفية الحالية</p>
   <div className="cycle-table-wrap"><table className="cycle-table"><colgroup><col style={{width:'27%'}}/><col style={{width:'17%'}}/><col style={{width:'18%'}}/><col style={{width:'17%'}}/><col style={{width:'21%'}}/></colgroup>
    <thead><tr><th>الإطار والنطاق</th><th>نتيجة التقييم المعتمدة</th><th>اكتمال التقييم</th><th>الفجوات</th><th>{view==='schedule'?'إعادة التقييم والإجراء':'الإجراء التالي'}</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id}>
     <td><div className="cycle-identity"><b dir="ltr">{r.framework}</b><span className={`cycle-status cycle-status-${r.status}`}>{cycleLabels[r.status]}</span></div><Link className="cycle-scope" href={`${assessmentPath(r.framework)}?cycle=${r.id}`}>{r.scope_name}</Link><small>الدورة <b dir="ltr">#{r.id}</b> · الإصدار <b dir="ltr">{r.framework_version}</b>{r.approved_at&&<> · اعتماد <time dir="ltr">{r.approved_at.slice(0,10)}</time></>}</small></td>
     <td><strong className="cycle-result">{displayPercent(r.compliance)}</strong>{r.improvement!==null&&<small>التغير عن الدورة السابقة: <b dir="ltr">{r.improvement>=0?'+':''}{Math.round(r.improvement)}</b> نقطة مئوية</small>}</td>
     <td><strong>{displayPercent(r.completion)}</strong>{r.completion!==null&&<progress aria-label={`اكتمال تقييم ${r.framework} — ${r.scope_name}`} max={100} value={r.completion}/> }<small><b dir="ltr">{r.assessed}/{r.total}</b> متطلبًا تم تقييمه</small></td>
     <td><div className="cycle-gap-list"><span><b>{r.open_gaps}</b> مفتوحة</span><span className={r.critical_gaps?'cycle-gap-critical':''}><b>{r.critical_gaps}</b> حرجة</span><span className={r.overdue_actions?'cycle-gap-overdue':''}><b>{r.overdue_actions}</b> متأخرة</span></div></td>
     <td>{view==='schedule'&&<small>{r.next_review_date}</small>}<p className="cycle-next">{r.evidence_needing_refresh>0?`${r.evidence_needing_refresh} دليل يحتاج تحديثًا`:r.status==='completed'?'بانتظار اعتماد':r.next_review_date&&r.next_review_date<todayRiyadh()?'إعادة تقييم مستحقة':r.due_date&&r.due_date<todayRiyadh()&&!['approved','closed'].includes(r.status)?'دورة متأخرة':r.missing_data?`${r.missing_data} متطلبًا يحتاج استكمالًا`:r.pending_evidence?`${r.pending_evidence} دليل ينتظر المراجعة`:'متابعة الدورة'}</p><Link className="cycle-next-link" href={`${assessmentPath(r.framework)}?cycle=${r.id}`}>فتح الدورة ←</Link></td>
    </tr>)}</tbody>
   </table></div>
  </>}
 </section>;
}

'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {assessmentPath} from '@/components/AssessmentPortfolio';
type Row={id:number;title:string;status:string;due_date:string|null;project_id:number|null;item_id:number};
export default function AssessmentFindingLinks(){
 const [rows,setRows]=useState<Row[]>([]),[paths,setPaths]=useState<Record<number,string>>({}),[error,setError]=useState('');
 useEffect(()=>{let active=true;void(async()=>{const [g,i,a,f]=await Promise.all([supabase.from('assessment_findings').select('id,title,status,due_date,project_id,item_id').not('project_id','is',null),supabase.from('assessment_items').select('id,cycle_id'),supabase.from('assessment_cycles').select('id,framework_id'),supabase.from('frameworks').select('id,code')]);if(g.error||i.error||a.error||f.error){if(active)setError('تعذر تحميل روابط فجوات التقييم');return;}const result:Record<number,string>={};for(const item of i.data??[]){const cycle=a.data?.find(c=>c.id===item.cycle_id),fw=f.data?.find(fw=>fw.id===cycle?.framework_id);if(cycle&&fw)result[item.id]=`${assessmentPath(fw.code)}?cycle=${cycle.id}`;}if(active){setRows(g.data??[]);setPaths(result);}})();return()=>{active=false;};},[]);
 return <details className="workflow-card"><summary>فجوات التقييم المرتبطة بالمشاريع ({rows.length})</summary><p>إنجاز المشروع لا يغلق الفجوة. الإغلاق يتطلب دليل معالجة وتحققًا مستقلًا داخل دورة التقييم.</p>{error&&<p role="alert">{error}</p>}{!rows.length?<p>لم تُربط فجوات تقييم بمشاريع بعد.</p>:<div style={{overflowX:'auto'}}><table className="workflow-table"><thead><tr><th>الفجوة</th><th>المشروع</th><th>الحالة</th><th>الموعد</th><th>المصدر</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>#{r.project_id}</td><td>{{open:'مفتوحة',in_progress:'قيد المعالجة',verification:'بانتظار التحقق',closed:'مغلقة'}[r.status]??r.status}</td><td>{r.due_date||'غير محدد'}</td><td>{paths[r.item_id]&&<Link href={paths[r.item_id]}>فتح التقييم</Link>}</td></tr>)}</tbody></table></div>}</details>;
}

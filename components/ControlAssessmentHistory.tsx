'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {assessmentLabels,cycleLabels} from '@/lib/assessment';
import {assessmentPath} from '@/components/AssessmentPortfolio';
type Row={id:number;cycle_id:number;compliance_status:string|null;review_status:string;cycle:{scope_name:string;status:string;approved_at:string|null}|null};
export default function ControlAssessmentHistory({controlId,framework}:{controlId:number;framework:string}){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;void supabase.from('assessment_items').select('id,cycle_id,compliance_status,review_status,cycle:assessment_cycles!cycle_id(scope_name,status,approved_at)').eq('control_id',controlId).order('id',{ascending:false}).limit(50).then(r=>{if(active){setError(r.error?.message??'');setRows((r.data??[]).map(x=>({...x,cycle:Array.isArray(x.cycle)?x.cycle[0]??null:x.cycle})));setLoading(false);}});return()=>{active=false;};},[controlId]);
 return <section className="detail-card"><h2>نتائج قياس الالتزام حسب النطاق</h2><p>كل دورة تحتفظ بنتيجتها وأدلتها. هذه النتائج لا تستبدل قرار التحقق العام للضابط.</p>{error?<p role="alert">تعذر تحميل نتائج التقييم.</p>:loading?<p>جاري التحميل…</p>:!rows.length?<p>لا توجد نتائج ضمن صلاحياتك.</p>:<div className="detail-timeline">{rows.map(r=><article key={r.id}><Link href={`${assessmentPath(framework)}?cycle=${r.cycle_id}`}>{r.cycle?.scope_name??'دورة تقييم'} · #{r.cycle_id}</Link><p>{cycleLabels[r.cycle?.status??'']??'غير متاح'} · {assessmentLabels[r.compliance_status??'']??'لم يُقيّم'}{!['approved','closed'].includes(r.cycle?.status??'')?' — نتيجة غير معتمدة':''}</p>{r.cycle?.approved_at&&<small>الاعتماد: {r.cycle.approved_at.slice(0,10)}</small>}</article>)}</div>}{rows.length===50&&<p>أحدث 50 دورة؛ بقية التاريخ متاح داخل صفحة التقييم.</p>}</section>;
}

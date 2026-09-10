"use client";
import { useEffect,useState } from "react";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import { WorkflowHeading,WorkflowMetric } from "@/components/WorkflowUI";

type AuditEvent={id:number;risk_id:number;event_type:string;previous_status:string|null;new_status:string|null;created_at:string};
const labels:Record<string,string>={created:"إنشاء خطر",updated:"تحديث الخطر",status_changed:"تغيير الحالة"};
const status:Record<string,string>={open:"مفتوح",treatment_in_progress:"قيد المعالجة",accepted:"مقبول",closed:"مغلق"};

export default function AuditPage(){
 const [items,setItems]=useState<AuditEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let live=true;(async()=>{try{await requireProfile(["admin","cybersecurity_team"]);const {data,error}=await supabase.from("cyber_risk_events").select("id,risk_id,event_type,previous_status,new_status,created_at").order("created_at",{ascending:false}).limit(50);if(error)throw error;if(live)setItems((data??[]) as AuditEvent[])}catch(e){if(live)setError(e instanceof Error?e.message:"تعذر تحميل سجل التدقيق")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[]);
 if(loading)return <main className="workflow-page" dir="rtl">جاري تحميل سجل التدقيق…</main>;
 return <main className="workflow-page" dir="rtl"><WorkflowHeading title="سجل التدقيق" description="آخر 50 حدثاً في دورة حياة مخاطر الأمن السيبراني. يُسجل تلقائياً عند الإنشاء أو التحديث أو تغيير الحالة."/>{error&&<p className="cgp-shell-error" role="alert">{error}</p>}<div className="workflow-metrics"><WorkflowMetric label="الأحداث المعروضة" value={items.length}/><WorkflowMetric label="تغييرات الحالة" value={items.filter(x=>x.event_type==="status_changed").length}/></div><section className="workflow-card"><h2>سجل الأحداث</h2>{items.length===0?<p>لا توجد أحداث حتى الآن. سيُنشأ السجل تلقائياً عند إضافة خطر أو تحديثه.</p>:<table className="workflow-table"><thead><tr><th>الوقت</th><th>الخطر</th><th>الحدث</th><th>التغيير</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{new Intl.DateTimeFormat("ar-SA",{dateStyle:"medium",timeStyle:"short"}).format(new Date(x.created_at))}</td><td dir="ltr">RISK-{x.risk_id}</td><td>{labels[x.event_type]??x.event_type}</td><td>{x.previous_status?(status[x.previous_status]??x.previous_status)+" ← "+(status[x.new_status??""]??x.new_status):(status[x.new_status??""]??"—")}</td></tr>)}</tbody></table>}</section></main>;
}
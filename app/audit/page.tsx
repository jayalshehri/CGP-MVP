"use client";
import GrcAuditTrail from "@/components/GrcAuditTrail";
import { useEffect,useState } from "react";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import { WorkflowHeading,WorkflowMetric } from "@/components/WorkflowUI";
import { formatComplianceDateTime } from "@/lib/grc";

type AuditEvent={id:number;risk_id:number;event_type:string;previous_status:string|null;new_status:string|null;created_at:string;cyber_risks:{risk_code:string}[]};
const labels:Record<string,string>={created:"إنشاء خطر",updated:"تحديث الخطر",status_changed:"تغيير الحالة"};
const status:Record<string,string>={open:"مفتوح",treatment_in_progress:"قيد المعالجة",accepted:"مقبول",closed:"مغلق"};

export default function AuditPage(){
 const [items,setItems]=useState<AuditEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let live=true;(async()=>{try{await requireProfile(["admin","cybersecurity_team"]);const {data,error}=await supabase.from("cyber_risk_events").select("id,risk_id,event_type,previous_status,new_status,created_at,cyber_risks(risk_code)").order("created_at",{ascending:false}).limit(50);if(error)throw error;if(live)setItems((data??[]) as AuditEvent[])}catch(e){if(live)setError(e instanceof Error?e.message:"تعذر تحميل سجل النشاط والتغييرات")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[]);
 if(loading)return <main className="workflow-page" dir="rtl">جاري تحميل سجل النشاط والتغييرات…</main>;
 return <main className="workflow-page" dir="rtl"><WorkflowHeading title="سجل النشاط والتغييرات" description="تاريخ الضوابط والأدلة والتكليفات والمراجعات، مع الاحتفاظ بسجل المخاطر السابق."/>{error&&<p className="cgp-shell-error" role="alert">{error}</p>}<GrcAuditTrail/><details><summary>أحداث المخاطر السابقة</summary><div className="workflow-metrics"><WorkflowMetric label="الأحداث المعروضة" value={items.length}/><WorkflowMetric label="تغييرات الحالة" value={items.filter(x=>x.event_type==="status_changed").length}/></div><section className="workflow-card"><h2>سجل الأحداث</h2>{items.length===0?<p>لا توجد أحداث حتى الآن. سيُنشأ السجل تلقائياً عند إضافة خطر أو تحديثه.</p>:items.map(x=>{const riskCode=x.cyber_risks?.[0]?.risk_code??`RISK-${x.risk_id}`;const change=x.previous_status?`${status[x.previous_status]??x.previous_status} ← ${status[x.new_status??""]??x.new_status}`:(status[x.new_status??""]??"—");return <details key={x.id} className="control-evidence-item"><summary><span dir="ltr">{riskCode}</span> · {labels[x.event_type]??x.event_type} · الفاعل: غير متاح في هذا السجل · {formatComplianceDateTime(x.created_at)}</summary><p>التغيير: {change}</p></details>;})}</section></details></main>;
}

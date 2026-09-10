"use client";
import { useEffect,useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import { WorkflowHeading,WorkflowMetric } from "@/components/WorkflowUI";
import "./alerts.css";

type Control={id:number;control_code:string;title_ar:string;control_owner:string|null;due_date:string|null;evidence_status:string;implementation_status:string;frameworks:{code:string}[]|null};
type Risk={id:number;risk_code:string;risk_description:string;residual_score:number;action_due_date:string|null;treatment_owner:string;};
type Alert={type:"danger"|"warning"|"info";detail:string;href:string};
type AlertGroup={key:string;type:"danger"|"warning"|"info";title:string;count:number;description:string;href:string;items:Alert[]};
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"});
const hasEvidence=(value:string)=>["uploaded","pending_review","under_review","accepted","approved","verified"].includes((value||"").toLowerCase());

export default function AlertsPage(){
 const router=useRouter(),[controls,setControls]=useState<Control[]>([]),[risks,setRisks]=useState<Risk[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[selected,setSelected]=useState("");
 useEffect(()=>{let live=true;(async()=>{try{await requireProfile(["admin","cybersecurity_team"]);const [c,r]=await Promise.all([supabase.from("controls").select("id,control_code,title_ar,control_owner,due_date,evidence_status,implementation_status,frameworks(code)"),supabase.from("cyber_risks").select("id,risk_code,risk_description,residual_score,action_due_date,treatment_owner")]);if(c.error)throw c.error;if(r.error)throw r.error;if(live){setControls((c.data??[]) as Control[]);setRisks((r.data??[]) as Risk[])}}catch(e){setError(e instanceof Error?e.message:"تعذر تحميل التنبيهات");router.replace("/")}finally{if(live)setLoading(false)}})();return()=>{live=false}},[router]);
 const groups=useMemo<AlertGroup[]>(()=>{const now=today();
   const unassigned=controls.filter(x=>!x.control_owner).map(x=>({type:"warning" as const,detail:`${x.frameworks?.[0]?.code??""} · ${x.control_code} — ${x.title_ar}`,href:`/controls/${x.id}/assign`}));
   const missingEvidence=controls.filter(x=>!hasEvidence(x.evidence_status)).map(x=>({type:"warning" as const,detail:`${x.frameworks?.[0]?.code??""} · ${x.control_code} — ${x.title_ar}`,href:`/controls/${x.id}`}));
   const overdue=controls.filter(x=>x.due_date&&x.due_date<now&&x.implementation_status!=="implemented").map(x=>({type:"danger" as const,detail:`${x.frameworks?.[0]?.code??""} · ${x.control_code} — استحقاق ${x.due_date}`,href:`/controls/${x.id}`}));
   const criticalRisks=risks.filter(x=>x.residual_score>=17).map(x=>({type:"danger" as const,detail:`${x.risk_code} — ${x.risk_description}`,href:"/risks"}));
   const overdueRiskActions=risks.filter(x=>x.action_due_date&&x.action_due_date<now&&x.residual_score>3).map(x=>({type:"danger" as const,detail:`${x.risk_code} — ${x.treatment_owner} · ${x.action_due_date}`,href:"/risks"}));
   return [
     {key:"unassigned",type:"warning",title:"ضوابط بلا مالك",count:unassigned.length,description:"عيّن مالكاً واحداً لكل ضابط قبل بدء المتابعة.",href:"/tasks?filter=unassigned",items:unassigned},
     {key:"evidence",type:"warning",title:"أدلة ناقصة",count:missingEvidence.length,description:"ضوابط تحتاج رفع دليل أو إكمال مراجعة الدليل.",href:"/tasks?filter=evidence",items:missingEvidence},
     {key:"overdue",type:"danger",title:"استحقاقات متأخرة",count:overdue.length,description:"تكليفات تجاوزت تاريخ الاستحقاق المحدد.",href:"/tasks?filter=overdue",items:overdue},
     {key:"critical",type:"danger",title:"مخاطر متبقية حرجة",count:criticalRisks.length,description:"مخاطر متبقية بدرجة 17 أو أكثر.",href:"/risks",items:criticalRisks},
     {key:"risk-actions",type:"danger",title:"معالجات مخاطر متأخرة",count:overdueRiskActions.length,description:"إجراءات معالجة لمخاطر لم تُغلق في وقتها.",href:"/risks",items:overdueRiskActions},
   ];
 },[controls,risks]);
 useEffect(()=>{if(!selected&&groups.length)setSelected(groups.find(g=>g.count>0)?.key||groups[0].key)},[groups,selected]);
 if(loading)return <main className="workflow-page" dir="rtl">جاري تحميل مركز التنبيهات…</main>;
 const active=groups.find(group=>group.key===selected)||groups[0]; const total=groups.reduce((sum,group)=>sum+group.count,0); const critical=groups.filter(group=>group.type==="danger").reduce((sum,group)=>sum+group.count,0);
 return <main className="workflow-page" dir="rtl"><WorkflowHeading title="مركز التنبيهات التشغيلية" description="ملخص تنفيذي قابل للإجراء. اختر نوع التنبيه لعرض العشرة الأهم فقط، ثم افتح القائمة المفلترة للمتابعة الكاملة."/>{error&&<p className="cgp-shell-error" role="alert">{error}</p>}<div className="workflow-metrics"><WorkflowMetric label="تنبيهات حرجة" value={critical} tone="danger"/><WorkflowMetric label="ضوابط بلا مالك" value={groups[0]?.count||0} tone="warning"/><WorkflowMetric label="حالات تحتاج إجراء" value={total}/></div><section className="alert-groups" aria-label="ملخص التنبيهات">{groups.map(group=><button type="button" key={group.key} onClick={()=>setSelected(group.key)} aria-pressed={group.key===active?.key} className={`alert-group-card ${group.type} ${group.key===active?.key?"selected":""}`}><span>{group.title}</span><strong>{group.count}</strong><small>{group.description}</small></button>)}</section>{active&&<section className="alerts-list" aria-label={active.title}><div className="alerts-list-head"><div><h2>{active.title}</h2><p>{active.description}</p></div><a href={active.href}>فتح القائمة الكاملة ←</a></div>{active.count===0?<div className="workflow-empty">لا توجد عناصر ضمن هذا التنبيه حالياً.</div>:active.items.slice(0,10).map((item,index)=><a key={index} href={item.href} className={`alert-item ${item.type}`}><div><b>{active.title}</b><p>{item.detail}</p></div><span>فتح ←</span></a>)}{active.count>10&&<p className="alerts-more">تُعرض أول 10 عناصر من أصل {active.count}. استخدم «فتح القائمة الكاملة» للمتابعة.</p>}</section>}</main>;
}
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../roadmap.css";

type Project={id:number;project_code:string;name_ar:string;planned_year:number;planned_quarter:string;priority:"high"|"medium"|"low";status:"planned"|"in_progress"|"on_hold"|"completed";progress_percent:number;target_outcome:string|null};
type LinkRow={project_id:number;control_id:number};
type Treatment={priority:"high"|"medium"|"low"};
const priorityText={high:"عالية",medium:"متوسطة",low:"منخفضة"};

export default function ExecutiveRoadmapPage(){
 const router=useRouter();const [projects,setProjects]=useState<Project[]>([]);const [links,setLinks]=useState<LinkRow[]>([]);const [treatments,setTreatments]=useState<Treatment[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 useEffect(()=>{let active=true;(async()=>{try{await requireProfile();const[p,l,t]=await Promise.all([supabase.from("cybersecurity_projects").select("id,project_code,name_ar,planned_year,planned_quarter,priority,status,progress_percent,target_outcome").order("planned_year").order("planned_quarter"),supabase.from("cybersecurity_project_controls").select("project_id,control_id"),supabase.from("cybersecurity_project_gap_treatments").select("priority")]);if(p.error)throw p.error;if(l.error)throw l.error;if(t.error)throw t.error;if(active){setProjects((p.data??[]) as Project[]);setLinks((l.data??[]) as LinkRow[]);setTreatments((t.data??[]) as Treatment[])}}catch(cause){if(!active)return;const message=cause instanceof Error?cause.message:"تعذر تحميل العرض التنفيذي.";if(message.includes("تسجيل الدخول")){router.replace("/login");return}setError(message)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[router]);
 const data=useMemo(()=>{const years=[2027,2028,2029].map(year=>{const items=projects.filter(p=>p.planned_year===year);return{year,items,high:items.filter(p=>p.priority==="high").length,progress:items.length?Math.round(items.reduce((sum,p)=>sum+Number(p.progress_percent||0),0)/items.length):0}});return{years,high:projects.filter(p=>p.priority==="high").length,controls:new Set(links.map(l=>l.control_id)).size,highTreatments:treatments.filter(t=>t.priority==="high").length}},[projects,links,treatments]);
 if(loading)return <main className="roadmap-page" dir="rtl"><p className="roadmap-loading">جاري إعداد العرض التنفيذي…</p></main>;
 return <main className="roadmap-page executive-board" dir="rtl"><section className="roadmap-shell"><header className="executive-hero"><div><span>عرض الإدارة العليا · 2027–2029</span><h1>خارطة التحول السيبراني</h1><p>رؤية مختصرة للمبادرات الاستراتيجية، الأولويات الاستثمارية، والقرارات المطلوبة.</p></div><aside><button type="button" onClick={()=>window.print()}>تصدير PDF</button><Link href="/roadmap/dashboard">العودة للخارطة ←</Link></aside></header>{error&&<p className="roadmap-alert">{error}</p>}
 <section className="executive-kpis"><Kpi label="المبادرات الاستراتيجية" value={projects.length} detail="ضمن الخطة الثلاثية"/><Kpi label="أولوية الاستثمار" value={data.high} detail="مبادرات عالية الأولوية" tone="amber"/><Kpi label="ضوابط مستهدفة" value={data.controls} detail="مرتبطة بخطة الإغلاق" tone="teal"/><Kpi label="قرارات مطلوبة" value={Math.max(1,data.highTreatments)} detail="فجوات عالية تحتاج اعتمادًا" tone="blue"/></section>
 <section className="executive-section"><header><span>المسار الاستراتيجي</span><h2>التدرج السنوي للمبادرات</h2><p>تنتقل المبادرات من تأسيس الحوكمة والحماية إلى الاستدامة والتحسين المستمر.</p></header><div className="executive-timeline">{data.years.map(year=><article key={year.year}><header><b>{year.year}</b><span>{year.items.length} مبادرات</span></header><div className="executive-progress"><i style={{width:`${year.progress}%`}}/></div><small>{year.high} عالية الأولوية</small><ul>{year.items.map(project=><li key={project.id}><b dir="ltr">{project.project_code}</b><span>{project.name_ar}</span><em className={project.priority}>{priorityText[project.priority]}</em></li>)}</ul></article>)}</div></section>
 <section className="executive-decisions"><header><span>قرارات الإدارة العليا</span><h2>ما المطلوب الآن؟</h2></header><article><b>01</b><div><strong>اعتماد خط الأساس لخطة 2027</strong><p>تأكيد نطاق المبادرات عالية الأولوية وترتيب بدء التنفيذ.</p></div></article><article><b>02</b><div><strong>توجيه التمويل نحو الحماية الأساسية</strong><p>الهوية، الشبكات، نقاط النهاية والمراقبة تمثل أساس خفض المخاطر في السنة الأولى.</p></div></article><article><b>03</b><div><strong>تثبيت مواعيد التنفيذ والملاك التنفيذيين</strong><p>بعد الاعتماد تُسجل التواريخ والملاك في سجل المشاريع للمتابعة الشهرية.</p></div></article></section>
 </section></main>;
}
function Kpi({label,value,detail,tone=""}:{label:string;value:string|number;detail:string;tone?:string}){return <article className={`roadmap-exec-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>}

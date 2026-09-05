"use client";
import { WorkflowHeading, WorkflowMetric, ResultSummary } from "@/components/WorkflowUI";
import StatusBadge from "@/components/StatusBadge";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import "./catalog.css";
import { supabase } from "@/lib/supabase";

type Control = {
  id: number;
  framework_id: number;
  control_code: string;
  title_ar: string;
  description_ar: string | null;
  domain_ar: string;
  implementation_status: string;
  evidence_status: string;
  verification_status: string;
  due_date: string | null;
  last_review_date: string | null;
  control_owner: string | null;
  evidence_owner: string | null;
  implementation_notes: string | null;
};



export default function ControlsPage() {
  const router = useRouter();
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
  const [controls,setControls] = useState<Control[]>([]);

  const [error,setError] = useState<Error|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{ let active=true; (async()=>{try {
    const {user,profile}=await requireProfile();
    if(!active)return;
    let query=supabase.from("controls").select("*").order("id");
    if(profile.role==="control_owner")query=query.eq("control_owner_id",user.id);
    const {data,error}=await query; if(error)throw error;
    if(active)setControls(data??[]);
  }catch(e){if(active)setError(new Error(e instanceof Error?e.message:"تعذر تحميل الضوابط"));
    const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");
  }finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);
  if(loading)return <main dir="rtl" style={{padding:40}}>جاري تحميل الضوابط...</main>;

  if (error) {
    return (
      <main
        dir="rtl"
        style={{
          padding: "40px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1>تعذر تحميل الضوابط</h1>

        <p style={{ color: "#b42318" }}>
          {error.message}
        </p>

        <Link href="/">العودة إلى لوحة المتابعة</Link>
      </main>
    );
  }

  const filtered=controls.filter(control=>`${control.control_code} ${control.title_ar} ${control.domain_ar} ${control.control_owner||""}`.toLowerCase().includes(search.trim().toLowerCase())&&(status==="all"||control.implementation_status===status));
  const searching=!!search.trim()||status!=="all";
  const sorted=[...filtered].sort((a,b)=>a.control_code.localeCompare(b.control_code,"en",{numeric:true}));
  const domains=Map.groupBy(sorted,c=>`${c.framework_id}:${c.domain_ar||"غير مصنف"}`);
  return <main className="workflow-page" dir="rtl">
    <WorkflowHeading title="الضوابط" description="اختر المجال لاستعراض ضوابطه، أو ابحث للوصول مباشرة إلى أي ضابط."/>
    <div className="workflow-metrics"><WorkflowMetric label="إجمالي الضوابط" value={controls.length}/><WorkflowMetric label="مطبق" value={controls.filter(c=>c.implementation_status==="implemented").length} tone="success"/><WorkflowMetric label="قيد التنفيذ" value={controls.filter(c=>c.implementation_status==="in_progress").length} tone="warning"/><WorkflowMetric label="لم يبدأ" value={controls.filter(c=>c.implementation_status==="not_started").length}/></div>
    <div className="workflow-filter workflow-filter-grid"><div><label htmlFor="control-search" className="cgp-field-label">البحث في الضوابط</label><input id="control-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="رقم الضابط أو عنوانه أو المجال أو المالك"/></div><div><label htmlFor="control-status" className="cgp-field-label">حالة التنفيذ</label><select id="control-status" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">كل الحالات</option><option value="implemented">مطبق</option><option value="in_progress">قيد التنفيذ</option><option value="not_started">لم يبدأ</option></select></div></div>
    <ResultSummary count={filtered.length} total={controls.length} active={!!search||status!=="all"} reset={()=>{setSearch("");setStatus("all");}}/>
    {filtered.length===0?<div className="workflow-empty">{controls.length?"لا توجد ضوابط مطابقة. جرّب تغيير البحث أو مسح التصفية.":"لا توجد ضوابط ضمن نطاق صلاحياتك بعد."}</div>:<div className="catalog-domains" key={searching?`${search}:${status}`:"browse"}>{[...domains].map(([key,items])=>{
      const all=controls.filter(c=>`${c.framework_id}:${c.domain_ar||"غير مصنف"}`===key);
      const done=all.filter(c=>c.implementation_status==="implemented").length;
      const percent=Math.round(done/all.length*100);
      const subdomains=Map.groupBy(items,c=>c.control_code.split("-").slice(0,2).join("-"));
      return <details className="catalog-domain" key={key} open={searching?true:undefined}>
        <summary><span className="catalog-chevron" aria-hidden="true">‹</span><span className="catalog-domain-name">{items[0].domain_ar||"غير مصنف"}<small>{searching?`${items.length} نتيجة من ${all.length} ضابط`:`${all.length} ضابط · ${subdomains.size} مجال فرعي`}</small></span><span className="catalog-progress"><strong>{percent}%</strong><small>نسبة التنفيذ</small><progress max={all.length} value={done} aria-label={`نسبة التنفيذ في ${items[0].domain_ar}`}/></span></summary>
        <div className="catalog-sections">{[...subdomains].map(([code,rows])=><section key={code} className="catalog-subdomain"><h2><span dir="ltr">{code}</span> {rows[0].title_ar.replace(/\s*[-–]\s*\d+-\d+-\d+\s*$/,"")}</h2><ul>{rows.map(control=><li key={control.id}><Link className="catalog-row" href={`/controls/${control.id}`}><span className="catalog-code" dir="ltr">{control.control_code}</span><span className="catalog-title">{control.title_ar.replace(/\s*[-–]\s*\d+-\d+-\d+\s*$/,"")}</span><StatusBadge status={control.implementation_status}/><span aria-hidden="true">←</span><span className="catalog-sr">فتح تفاصيل الضابط</span></Link></li>)}</ul></section>)}</div>
      </details>;
    })}</div>}

  </main>;
}

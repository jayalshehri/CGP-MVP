"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import { EVIDENCE_PRESENT, frameworkOf, isApplicable, isImplemented, isVerified, percentage } from "@/lib/compliance";

type Dashboard = { total:number; compliance:number; waiting_evidence:number; overdue:number; pending_review:number; verified:number; domains:{name:string;total:number;done:number;percentage:number}[] };
type DashboardControl = { id:number; domain_ar:string; implementation_status:string; evidence_status:string; verification_status:string; due_date:string|null; frameworks:unknown };

export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  const [userRole, setUserRole] = useState<UserRole>("control_owner");


  const [stats, setStats] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    let running = false;
    async function loadUser() {
      if (running) return;
      running = true;
      setRefreshing(true);
      try {
        const { profile } = await requireProfile();
        if (!mounted) return;

        setUserRole(profile.role);

        setAuthReady(true);
        const [controlResult,evidenceResult] = await Promise.all([
          supabase.from("controls").select("id,domain_ar,implementation_status,evidence_status,verification_status,due_date,frameworks!inner(code,name_ar)"),
          supabase.from("evidence").select("id",{count:"exact",head:true}).eq("is_current",true).in("status",["pending_review","under_review"]),
        ]);
        if (controlResult.error || evidenceResult.error) throw controlResult.error || evidenceResult.error;
        const controls=(controlResult.data??[]) as DashboardControl[];
        const applicable=controls.filter(c=>isApplicable(c.implementation_status));
        const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Riyadh"});
        const domainMap=new Map<string,{name:string;total:number;done:number;percentage:number}>();
        applicable.forEach(c=>{const f=frameworkOf(c.frameworks);const name=`${f.code} · ${f.name_ar}`;const row=domainMap.get(name)??{name,total:0,done:0,percentage:0};row.total++;if(isImplemented(c.implementation_status))row.done++;row.percentage=percentage(row.done,row.total);domainMap.set(name,row)});
        const dashboard:Dashboard={total:applicable.length,compliance:percentage(applicable.filter(c=>isImplemented(c.implementation_status)).length,applicable.length),waiting_evidence:applicable.filter(c=>!EVIDENCE_PRESENT.has((c.evidence_status||"").toLowerCase())).length,overdue:applicable.filter(c=>Boolean(c.due_date&&c.due_date<today&&!isImplemented(c.implementation_status))).length,pending_review:evidenceResult.count??0,verified:applicable.filter(c=>isVerified(c.verification_status)).length,domains:[...domainMap.values()]};
        if (mounted) { setStats(dashboard); setError(""); setUpdatedAt(new Date().toLocaleTimeString("ar-SA")); }
      } catch (e) {
        if (mounted) { setStats(null); setError(e instanceof Error ? e.message : "تعذر تحميل البيانات. حاول مرة أخرى."); setAuthReady(true); }
        const { data } = await supabase.auth.getSession();
        if (!data.session && mounted) router.replace("/login");
      } finally { running = false; if (mounted) setRefreshing(false); }
    }
    void loadUser();
    const refresh = () => { if (document.visibilityState === "visible") void loadUser(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setStats(null); router.replace("/login"); }
    });

    return () => {
      mounted = false;
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
      listener.subscription.unsubscribe();
    };
  }, [router, refreshKey]);



  if (!authReady) {
    return <main dir="rtl" className="cgp-loading-screen" aria-busy="true" aria-label="جاري تحميل لوحة المتابعة"><span className="cgp-skeleton title"/><span className="cgp-skeleton" style={{width:"min(580px,90%)"}}/><div className="cgp-loading-metrics"><span className="cgp-skeleton metric"/><span className="cgp-skeleton metric"/><span className="cgp-skeleton metric"/><span className="cgp-skeleton metric"/></div></main>;
  }



  return (
    <main dir="rtl" className="cgp-ops-page">


      <div className="cgp-page-body" style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>


        <section className="cgp-content cgp-ops-content">
          <WorkflowHeading title="لوحة المتابعة التشغيلية" description="قائمة العمل اليومية: المتأخرات، الأدلة الناقصة، والقرارات المطلوبة." action={<button type="button" disabled={refreshing} onClick={()=>setRefreshKey(k=>k+1)} className="workflow-button">{refreshing?"جاري التحديث...":"تحديث البيانات"}</button>}/>
          <div className="dashboard-context">{userRole==="control_owner"?"الضوابط المسندة إليك فقط":"جميع الضوابط"}{updatedAt&&` · آخر تحديث ${updatedAt}`}</div>
          {error&&<div role="alert" style={{background:"#fff2f0",color:"#b42318",padding:16,marginBottom:18,borderRadius:9}}>{error}</div>}
          {stats?.total===0&&<p>لا توجد ضوابط ضمن نطاق صلاحيتك حاليًا.</p>}
          <div className="workflow-metrics cgp-ops-metrics"><WorkflowMetric label="مهام متأخرة" value={stats ? stats.overdue : "—"} tone={stats?.overdue?"danger":"neutral"}/><WorkflowMetric label="تحتاج دليلًا" value={stats ? stats.waiting_evidence : "—"} tone={stats?.waiting_evidence?"warning":"neutral"}/><WorkflowMetric label="بانتظار قرار مراجعة" value={stats ? stats.pending_review : "—"} tone={stats?.pending_review?"warning":"neutral"}/><WorkflowMetric label="تم التحقق" value={stats ? stats.verified : "—"} tone="success"/></div>
          <section className="cgp-priority-card cgp-ops-priority"><div><span className="cgp-card-eyebrow">القرار التالي</span><h2>تحتاج انتباهك</h2><p>ابدأ بالعناصر التي تؤثر في التنفيذ أو تنتظر قرارًا.</p></div>{stats&&<div className="cgp-priority-actions"><AlertItem href="/tasks?filter=overdue" count={stats.overdue} text="مهام متأخرة" tone="danger"/><AlertItem href="/tasks?filter=evidence" count={stats.waiting_evidence} text="ضوابط تحتاج دليلًا" tone="warning"/><AlertItem href={userRole==="control_owner"?"/evidence":"/review"} count={stats.pending_review} text="أدلة بانتظار المراجعة" tone="info"/></div>}</section>
          <div style={{marginTop:"24px",display:"flex",gap:12,flexWrap:"wrap"}}>
            <Link href="/tasks" style={primaryLink}>فتح مهامي / التكليفات ←</Link>
            <Link href="/controls" style={secondaryLink}>عرض جميع الضوابط</Link>
            {userRole==="control_owner"&&<Link href="/evidence" style={secondaryLink}>مركز الأدلة</Link>}
          </div>
        </section>
      </div>
    </main>
  );
}

function AlertItem({href,count,text,tone}:{href:string;count:number;text:string;tone:string}) { return <Link href={href} className="cgp-action-row"><span>{text}</span><span className={`cgp-status cgp-status-${count? tone:"neutral"}`}><span className="cgp-action-count">{count}</span><span aria-hidden="true">←</span></span></Link>; }
const primaryLink={display:"inline-block",background:"var(--cgp-teal)",color:"white",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};
const secondaryLink={display:"inline-block",background:"white",border:"1px solid #ccd6dc",color:"#0b1f33",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};

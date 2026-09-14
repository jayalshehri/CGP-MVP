"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowMetric } from "@/components/WorkflowUI";
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
          <header className="cgp-dashboard-hero">
            <div className="cgp-dashboard-hero-copy"><span className="cgp-dashboard-eyebrow"><i aria-hidden="true"/>متابعة تشغيلية مباشرة</span><h1>لوحة المتابعة التشغيلية</h1><p>رؤية يومية للقرارات المطلوبة، الأدلة الناقصة، وحالة الالتزام.</p><small>{userRole==="control_owner"?"الضوابط المسندة إليك فقط":"جميع الضوابط ضمن نطاقك"}{updatedAt&&` · آخر تحديث ${updatedAt}`}</small></div>
            <div className="cgp-dashboard-hero-score"><span>نسبة الالتزام</span><strong>{stats ? `${stats.compliance}%` : "—"}</strong><progress value={stats?.compliance ?? 0} max="100" aria-label="نسبة الالتزام الحالية"/><button type="button" disabled={refreshing} onClick={()=>setRefreshKey(k=>k+1)}>{refreshing?"جاري التحديث...":"تحديث البيانات"}</button></div>
          </header>
          {error&&<div role="alert" style={{background:"#fff2f0",color:"#b42318",padding:16,marginBottom:18,borderRadius:9}}>{error}</div>}
          {stats?.total===0&&<p>لا توجد ضوابط ضمن نطاق صلاحيتك حاليًا.</p>}
          <div className="workflow-metrics cgp-ops-metrics"><WorkflowMetric label="مهام متأخرة" value={stats ? stats.overdue : "—"} tone={stats?.overdue?"danger":"neutral"} icon={<MetricIcon name="clock"/>}/><WorkflowMetric label="تحتاج دليلًا" value={stats ? stats.waiting_evidence : "—"} tone={stats?.waiting_evidence?"warning":"neutral"} icon={<MetricIcon name="evidence"/>}/><WorkflowMetric label="بانتظار قرار مراجعة" value={stats ? stats.pending_review : "—"} tone={stats?.pending_review?"warning":"neutral"} icon={<MetricIcon name="review"/>}/><WorkflowMetric label="تم التحقق" value={stats ? stats.verified : "—"} tone="success" icon={<MetricIcon name="verified"/>}/></div>
          <section className="cgp-priority-card cgp-ops-priority"><div><span className="cgp-card-eyebrow">القرار التالي</span><h2>تحتاج انتباهك</h2><p>ابدأ بالعناصر التي تؤثر في التنفيذ أو تنتظر قراراً.</p></div>{stats&&<div className="cgp-priority-actions"><AlertItem href="/tasks?filter=overdue" count={stats.overdue} text="مهام متأخرة" tone="danger"/><AlertItem href="/tasks?filter=evidence" count={stats.waiting_evidence} text="ضوابط تحتاج دليلًا" tone="warning"/><AlertItem href={userRole==="control_owner"?"/evidence":"/review"} count={stats.pending_review} text="أدلة بانتظار المراجعة" tone="info"/></div>}</section>
          <section className="cgp-ops-insight-grid" aria-label="ملخص الالتزام">
            <article className="cgp-ops-insight-card cgp-compliance-score">
              <div className="cgp-ops-insight-heading"><div><span>صورة الالتزام</span><h2>مؤشر الالتزام الحالي</h2></div><Link href="/reports">التقارير ←</Link></div>
              <div className="cgp-compliance-score-body"><strong>{stats ? `${stats.compliance}%` : "—"}</strong><div><progress value={stats?.compliance ?? 0} max="100" aria-label="نسبة الالتزام الحالية"/><p>{stats ? `${stats.verified} ضابطاً تم التحقق منه من أصل ${stats.total} ضمن نطاقك.` : "جاري احتساب مؤشر الالتزام."}</p></div></div>
            </article>
            <article className="cgp-ops-insight-card">
              <div className="cgp-ops-insight-heading"><div><span>التغطية التنظيمية</span><h2>حالة الأطر</h2></div><Link href="/controls">عرض الضوابط ←</Link></div>
              <div className="cgp-framework-bars">{stats?.domains.length ? stats.domains.slice(0, 5).map(domain=><div key={domain.name}><div><b>{domain.name}</b><strong>{domain.percentage}%</strong></div><progress value={domain.percentage} max="100" aria-label={`نسبة الالتزام في ${domain.name}`}/><small>{domain.done} من {domain.total} ضابط مطبق</small></div>) : <p className="cgp-ops-empty">لا توجد بيانات كافية لعرض الأطر التنظيمية.</p>}</div>
            </article>
          </section>
          <div className="cgp-ops-actions">
            <Link href="/tasks" className="primary">فتح مهامي / التكليفات ←</Link>
            <Link href="/controls" className="secondary">عرض جميع الضوابط</Link>
            {userRole==="control_owner"&&<Link href="/evidence" className="secondary">مركز الأدلة</Link>}
          </div>
        </section>
      </div>
    </main>
  );
}

function AlertItem({href,count,text,tone}:{href:string;count:number;text:string;tone:string}) { return <Link href={href} className="cgp-action-row"><span>{text}</span><span className={`cgp-status cgp-status-${count? tone:"neutral"}`}><span className="cgp-action-count">{count}</span><span aria-hidden="true">←</span></span></Link>; }

function MetricIcon({name}:{name:"clock"|"evidence"|"review"|"verified"}) { const paths={clock:"M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",evidence:"M6 3h9l3 3v15H6z M9 11h6 M9 15h6",review:"M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4",verified:"M12 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4"}; return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>; }

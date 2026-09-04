"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { cgpCardStyle } from "@/lib/design";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";





type Dashboard = { total:number; compliance:number; waiting_evidence:number; overdue:number; pending_review:number; verified:number; domains:{name:string;total:number;done:number;percentage:number}[] };

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
        const { data, error: queryError } = await supabase.rpc("cgp_dashboard");
        if (queryError) throw queryError;
        if (mounted) { setStats(data as Dashboard); setError(""); setUpdatedAt(new Date().toLocaleTimeString("ar-SA")); }
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
    return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",color:"#0b1f33",fontFamily:"Arial, sans-serif"}}>جاري تحميل منصة CGP...</main>;
  }



  return (
    <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}}>


      <div className="cgp-page-body" style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>


        <section className="cgp-content" style={{flex:1,padding:"40px",minWidth:0}}>
          <div style={{marginBottom:"30px"}}><h1 style={{margin:0,fontSize:"34px",color:"#0b1f33"}}>لوحة المتابعة التشغيلية</h1><p style={{marginTop:"10px",color:"#586875",fontSize:"15px"}}>متابعة حالة الالتزام والضوابط والأدلة والمهام</p></div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:18}}><button type="button" disabled={refreshing} onClick={()=>setRefreshKey(k=>k+1)} style={secondaryLink}>{refreshing?"جاري التحديث...":"تحديث البيانات"}</button><span style={{color:"#586875",fontSize:13}}>{userRole==="control_owner"?"الضوابط المسندة إليك فقط":"جميع الضوابط"}{updatedAt&&` · آخر تحديث ${updatedAt}`}</span></div>
          {error&&<div role="alert" style={{background:"#fff2f0",color:"#b42318",padding:16,marginBottom:18,borderRadius:9}}>{error}</div>}
          {stats?.total===0&&<p>لا توجد ضوابط ضمن نطاق صلاحيتك حاليًا.</p>}
          <div className="cgp-responsive-grid cgp-kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:"18px",marginBottom:"28px"}}><KpiCard title="نسبة الالتزام" value={stats ? `${stats.compliance}%` : "—"}/><KpiCard title="إجمالي الضوابط" value={stats ? String(stats.total) : "—"}/><KpiCard title="بانتظار الأدلة" value={stats ? String(stats.waiting_evidence) : "—"}/><KpiCard title="مهام متأخرة" value={stats ? String(stats.overdue) : "—"} danger={!!stats?.overdue}/></div>
          <div className="cgp-responsive-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"20px"}}>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>حالة الالتزام حسب المجال</h2>{stats?.domains.map(domain=><div key={domain.name} className="cgp-domain-row"><div><span>{domain.name}</span><strong>{domain.percentage}%</strong></div><progress max={100} value={domain.percentage} aria-label={`الالتزام في ${domain.name}`}/><p style={{fontSize:12,color:"#586875",marginBottom:0}}>{domain.done} من {domain.total} ضابط مكتمل</p></div>)}</div>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>تحتاج انتباهك</h2>{stats&&<><AlertItem href="/tasks?filter=overdue" count={stats.overdue} text="مهام متأخرة" tone="danger"/><AlertItem href="/tasks?filter=evidence" count={stats.waiting_evidence} text="ضوابط تحتاج دليلًا" tone="warning"/><AlertItem href={userRole==="control_owner"?"/evidence":"/review"} count={stats.pending_review} text="أدلة بانتظار المراجعة" tone="info"/><p style={{fontSize:13,color:"#586875"}}>{stats.verified} ضوابط تم التحقق منها</p></>}</div>
          </div>
          <div style={{marginTop:"24px",display:"flex",gap:12,flexWrap:"wrap"}}>
            <Link href="/controls" style={primaryLink}>عرض جميع الضوابط ←</Link>
            <Link href="/tasks" style={secondaryLink}>فتح مهامي / التكليفات</Link>
            <Link href="/evidence" style={secondaryLink}>مركز الأدلة</Link>
            {userRole!=="control_owner"&&<Link href="/reports" style={secondaryLink}>التقارير</Link>}
            {userRole!=="control_owner"&&<Link href="/executive" style={{...secondaryLink,borderColor:"#0f7d73",color:"#0f6f67"}}>اللوحة التنفيذية</Link>}
          </div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({title,value,danger=false}:{title:string;value:string;danger?:boolean}) { return <div style={{...cgpCardStyle,minHeight:"82px"}}><div style={{color:"#586875",fontSize:"14px",marginBottom:"10px"}}>{title}</div><div style={{color:danger?"#a3261a":"#0f7d73",fontSize:"32px",fontWeight:"bold"}}>{value}</div></div>; }
function AlertItem({href,count,text,tone}:{href:string;count:number;text:string;tone:string}) { return <Link href={href} className="cgp-action-row"><span>{text}</span><span className={`cgp-status cgp-status-${count? tone:"neutral"}`}><span className="cgp-action-count">{count}</span><span aria-hidden="true">←</span></span></Link>; }
const primaryLink={display:"inline-block",background:"#0f7d73",color:"white",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};
const secondaryLink={display:"inline-block",background:"white",border:"1px solid #ccd6dc",color:"#0b1f33",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};

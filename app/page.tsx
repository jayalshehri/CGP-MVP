"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { cgpCardStyle } from "@/lib/design";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";

const roleLabels: Record<UserRole, string> = {
  admin: "مدير النظام",
  cybersecurity_team: "فريق الأمن السيبراني",
  control_owner: "مالك الضابط",
};

const menuItems = [
  { name: "لوحة المتابعة", href: "/", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "الضوابط", href: "/controls", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "مهامي / التكليفات", href: "/tasks", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "الأدلة", href: "/evidence", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "التقييم والتحقق", href: "/review", roles: ["admin", "cybersecurity_team"] },
  { name: "التقارير", href: "/reports", roles: ["admin", "cybersecurity_team"] },
  { name: "اللوحة التنفيذية", href: "/executive", roles: ["admin", "cybersecurity_team"] },
  { name: "إدارة المستخدمين", href: "/users", roles: ["admin"] },
];

type Dashboard = { total:number; compliance:number; waiting_evidence:number; overdue:number; pending_review:number; verified:number; domains:{name:string;total:number;done:number;percentage:number}[] };

export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("control_owner");
  const [displayName, setDisplayName] = useState("");

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
        const { user, profile } = await requireProfile();
        if (!mounted) return;
        setUserEmail(user.email ?? "");
        setUserRole(profile.role);
        setDisplayName(profile.display_name ?? "");
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!authReady) {
    return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",color:"#0b1f33",fontFamily:"Arial, sans-serif"}}>جاري تحميل منصة CGP...</main>;
  }

  const visibleMenu = menuItems.filter((item) => item.roles.includes(userRole));

  return (
    <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial, sans-serif",color:"#0b1f33"}}>
      <header style={{minHeight:"86px",background:"#0b1f33",color:"white",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"24px",padding:"0 38px"}}>
        <div><div style={{fontSize:"24px",fontWeight:"bold"}}>Cyber Governance Platform</div><div style={{fontSize:"13px",opacity:.7,marginTop:"5px"}}>منصة حوكمة الأمن السيبراني</div></div>
        <div style={{display:"flex",alignItems:"center",gap:"18px"}}>
          <div style={{textAlign:"left"}}>
            <div style={{fontSize:"13px",fontWeight:700}}>{displayName || userEmail}</div>
            <div style={{fontSize:"12px",opacity:.65,marginTop:"4px"}}>{roleLabels[userRole]} · دورة التقييم 2026</div>
          </div>
          <button type="button" onClick={handleSignOut} style={{border:"1px solid rgba(255,255,255,.22)",borderRadius:"9px",background:"rgba(255,255,255,.08)",color:"white",padding:"9px 13px",cursor:"pointer",fontSize:"13px"}}>تسجيل الخروج</button>
        </div>
      </header>

      <div style={{display:"flex",minHeight:"calc(100vh - 86px)"}}>
        <aside className="cgp-sidebar" style={{width:"260px",background:"white",borderLeft:"1px solid #e2e7eb",padding:"28px 20px",flexShrink:0}}>
          {visibleMenu.map((item) => {
            const active = item.href === "/";
            return <Link key={item.name} href={item.href} style={{display:"block",padding:"15px 18px",marginBottom:"7px",borderRadius:"10px",textDecoration:"none",fontSize:"15px",fontWeight:active?"bold":"normal",background:active?"#e8f5f2":"transparent",color:active?"#0f6f67":"#44515c"}}>{item.name}</Link>;
          })}
        </aside>

        <section className="cgp-content" style={{flex:1,padding:"40px",minWidth:0}}>
          <div style={{marginBottom:"30px"}}><h1 style={{margin:0,fontSize:"34px",color:"#0b1f33"}}>لوحة المتابعة التشغيلية</h1><p style={{marginTop:"10px",color:"#7a8794",fontSize:"15px"}}>متابعة حالة الالتزام والضوابط والأدلة والمهام</p></div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginBottom:18}}><button type="button" disabled={refreshing} onClick={()=>setRefreshKey(k=>k+1)} style={secondaryLink}>{refreshing?"جاري التحديث...":"تحديث البيانات"}</button><span style={{color:"#7a8794",fontSize:13}}>{userRole==="control_owner"?"الضوابط المسندة إليك فقط":"جميع الضوابط"}{updatedAt&&` · آخر تحديث ${updatedAt}`}</span></div>
          {error&&<div role="alert" style={{background:"#fff2f0",color:"#b42318",padding:16,marginBottom:18,borderRadius:9}}>{error}</div>}
          {stats?.total===0&&<p>لا توجد ضوابط ضمن نطاق صلاحيتك حاليًا.</p>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:"18px",marginBottom:"28px"}}><KpiCard title="نسبة الالتزام" value={stats ? `${stats.compliance}%` : "—"}/><KpiCard title="إجمالي الضوابط" value={stats ? String(stats.total) : "—"}/><KpiCard title="بانتظار الأدلة" value={stats ? String(stats.waiting_evidence) : "—"}/><KpiCard title="مهام متأخرة" value={stats ? String(stats.overdue) : "—"}/></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"20px"}}>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>حالة الالتزام حسب المجال</h2>{stats?.domains.map((domain)=><div key={domain.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"19px 0",borderBottom:"1px solid #edf0f2"}}><span style={{fontSize:"15px"}}>{domain.name}</span><strong style={{color:"#0f7d73",fontSize:"18px"}}>{domain.percentage}% · {domain.done}/{domain.total}</strong></div>)}</div>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>تحتاج انتباهك</h2>{stats&&<><AlertItem icon="🔴" text={`${stats.overdue} مهام متأخرة`}/><AlertItem icon="🟠" text={`${stats.waiting_evidence} ضوابط بانتظار الأدلة`}/><AlertItem icon="🔵" text={`${stats.pending_review} أدلة بانتظار المراجعة`}/><AlertItem icon="🟢" text={`${stats.verified} ضوابط تم التحقق منها`}/></>}</div>
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

function KpiCard({title,value}:{title:string;value:string}) { return <div style={{...cgpCardStyle,minHeight:"82px"}}><div style={{color:"#7a8794",fontSize:"14px",marginBottom:"10px"}}>{title}</div><div style={{color:"#0f7d73",fontSize:"32px",fontWeight:"bold"}}>{value}</div></div>; }
function AlertItem({icon,text}:{icon:string;text:string}) { return <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"14px 0",fontSize:"15px"}}><span style={{fontSize:"20px"}}>{icon}</span><span>{text}</span></div>; }
const primaryLink={display:"inline-block",background:"#0f7d73",color:"white",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};
const secondaryLink={display:"inline-block",background:"white",border:"1px solid #ccd6dc",color:"#0b1f33",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"};

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  { name: "التكليفات", href: "#", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "الأدلة", href: "#", roles: ["admin", "cybersecurity_team", "control_owner"] },
  { name: "التقييم والتحقق", href: "#", roles: ["admin", "cybersecurity_team"] },
  { name: "التقارير", href: "#", roles: ["admin", "cybersecurity_team"] },
  { name: "الإعدادات", href: "#", roles: ["admin"] },
];

const domainStatus = [
  { name: "حوكمة الأمن السيبراني", value: "82%" },
  { name: "تعزيز الأمن السيبراني", value: "64%" },
  { name: "صمود الأمن السيبراني", value: "70%" },
  { name: "الأطراف الخارجية والحوسبة السحابية", value: "55%" },
];

export default function Home() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("control_owner");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }

      const user = data.session.user;
      setUserEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!mounted) return;
      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (profile?.role && profile.role in roleLabels) setUserRole(profile.role as UserRole);
      if (profile?.display_name) setDisplayName(profile.display_name);
      setAuthReady(true);
    }

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

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
        <aside style={{width:"260px",background:"white",borderLeft:"1px solid #e2e7eb",padding:"28px 20px",flexShrink:0}}>
          {visibleMenu.map((item) => {
            const active = item.href === "/";
            return <Link key={item.name} href={item.href} style={{display:"block",padding:"15px 18px",marginBottom:"7px",borderRadius:"10px",textDecoration:"none",fontSize:"15px",fontWeight:active?"bold":"normal",background:active?"#e8f5f2":"transparent",color:active?"#0f6f67":"#44515c"}}>{item.name}</Link>;
          })}
        </aside>

        <section style={{flex:1,padding:"40px",minWidth:0}}>
          <div style={{marginBottom:"30px"}}><h1 style={{margin:0,fontSize:"34px",color:"#0b1f33"}}>لوحة المتابعة التشغيلية</h1><p style={{marginTop:"10px",color:"#7a8794",fontSize:"15px"}}>متابعة حالة الالتزام والضوابط والأدلة والمهام</p></div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(0, 1fr))",gap:"18px",marginBottom:"28px"}}><KpiCard title="نسبة الالتزام" value="68%"/><KpiCard title="إجمالي الضوابط" value="108"/><KpiCard title="بانتظار الأدلة" value="17"/><KpiCard title="مهام متأخرة" value="6"/></div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:"20px"}}>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>حالة الالتزام حسب المجال</h2>{domainStatus.map((domain)=><div key={domain.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"19px 0",borderBottom:"1px solid #edf0f2"}}><span style={{fontSize:"15px"}}>{domain.name}</span><strong style={{color:"#0f7d73",fontSize:"18px"}}>{domain.value}</strong></div>)}</div>
            <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"28px"}}><h2 style={{marginTop:0,marginBottom:"25px",fontSize:"21px"}}>تحتاج انتباهك</h2><AlertItem icon="🔴" text="6 مهام متأخرة"/><AlertItem icon="🟠" text="17 دليلاً بانتظار الرفع"/><AlertItem icon="🔵" text="9 أدلة بانتظار المراجعة"/><AlertItem icon="🟢" text="34 ضابطاً تم التحقق منها"/></div>
          </div>
          <div style={{marginTop:"24px"}}><Link href="/controls" style={{display:"inline-block",background:"#0f7d73",color:"white",textDecoration:"none",padding:"13px 20px",borderRadius:"9px",fontWeight:"bold",fontSize:"14px"}}>عرض جميع الضوابط ←</Link></div>
        </section>
      </div>
    </main>
  );
}

function KpiCard({title,value}:{title:string;value:string}) { return <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:"14px",padding:"24px",minHeight:"82px"}}><div style={{color:"#7a8794",fontSize:"14px",marginBottom:"10px"}}>{title}</div><div style={{color:"#0f7d73",fontSize:"32px",fontWeight:"bold"}}>{value}</div></div>; }
function AlertItem({icon,text}:{icon:string;text:string}) { return <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"14px 0",fontSize:"15px"}}><span style={{fontSize:"20px"}}>{icon}</span><span>{text}</span></div>; }

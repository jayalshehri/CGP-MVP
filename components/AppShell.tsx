"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const navigation = [
  { href: "/", label: "لوحة المتابعة", icon: "◫" },
  { href: "/controls", label: "الضوابط", icon: "▤" },
  { href: "/tasks", label: "التكليفات", icon: "☑" },
  { href: "/evidence", label: "الأدلة", icon: "▱" },
  { href: "/review", label: "مراجعة الأدلة", icon: "✓", team: true },
  { href: "/reports", label: "التقارير", icon: "▥", team: true },
  { href: "/executive", label: "اللوحة التنفيذية", icon: "◈", team: true },
  { href: "/users", label: "إدارة المستخدمين", icon: "♙", admin: true },
];
const roleLabels: Record<UserRole, string> = { admin: "مدير النظام", cybersecurity_team: "فريق الأمن السيبراني", control_owner: "مالك الضابط" };

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, string> = {
    "/": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "/controls": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/tasks": "M5 4h14v17H5z M9 3h6v3H9z M8 13l3 3 5-6",
    "/evidence": "M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h7v3",
    "/review": "M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z M8 12l3 3 5-6",
    "/reports": "M4 3v18h17 M8 17v-5 M13 17V8 M18 17V5",
    "/executive": "M3 4h18v13H3z M8 21h8 M12 17v4 M7 13l4-4 3 2 3-4",
    "/users": "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a6 6 0 0 1 12 0v2 M16 4a4 4 0 0 1 0 8 M17 15a5 5 0 0 1 5 5v1",
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[href]}/></svg>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (["/login", "/activate"].includes(pathname)) return children;
  return <Workspace pathname={pathname}>{children}</Workspace>;
}

function Workspace({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const router = useRouter();
  const [account, setAccount] = useState<{ name: string; role: UserRole } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    requireProfile().then(({ user, profile }) => {
      if (active) setAccount({ name: profile.display_name || user.email || "حسابي", role: profile.role });
    }).catch(() => { if (active) setAccount(null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) { setAccount(null); router.replace("/login"); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [pathname, router]);

  const items = account ? navigation.filter(item => (!item.admin || account.role === "admin") && (!item.team || account.role !== "control_owner")) : [];
  const current = navigation.find(item => item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/")))?.label || (pathname === "/change-password" ? "تغيير كلمة المرور" : "لوحة المتابعة");
  const controlId = /^\/controls\/(\d+)/.exec(pathname)?.[1];
  const leaf = pathname.endsWith("/assign") ? "تكليف المالك" : pathname.endsWith("/evidence/new") ? "رفع دليل" : controlId ? "تفاصيل الضابط" : current;
  const links = items.map(item => <Link key={item.href} href={item.href} className="cgp-nav-link" aria-current={(item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")) ? "page" : undefined}><NavIcon href={item.href}/>{item.href === "/tasks" && account?.role === "control_owner" ? "مهامي" : item.label}</Link>);
  async function signOut() {
    setSigningOut(true); setError("");
    const { error } = await supabase.auth.signOut();
    if (error) { setError("تعذر تسجيل الخروج. حاول مرة أخرى."); setSigningOut(false); return; }
    router.replace("/login");
  }
  return <div className="cgp-workspace" dir="rtl">
    <a href="#cgp-content" className="cgp-skip">انتقل إلى المحتوى</a>
    <header className="cgp-topbar">
      <Link href="/" className="cgp-brand" aria-label="CGP — لوحة المتابعة"><span className="cgp-brand-mark">CGP</span><span>حوكمة الأمن السيبراني<small>Cyber Governance Platform</small></span></Link>
      <div className="cgp-account"><span>{account?.name || "مساحة العمل"}<small>{account ? roleLabels[account.role] : "جاري التحقق من الحساب"}</small></span><button type="button" onClick={signOut} disabled={signingOut} className="cgp-signout">{signingOut ? "جاري الخروج…" : "تسجيل الخروج"}</button></div>
    </header>
    <div className="cgp-workspace-grid">
      <aside className="cgp-navigation"><p className="cgp-nav-caption">مساحة العمل</p><nav aria-label="التنقل الرئيسي">{links}</nav><Link href="/change-password" className="cgp-nav-link cgp-account-link" aria-current={pathname === "/change-password" ? "page" : undefined}>إعدادات كلمة المرور</Link><p className="cgp-scope">{account?.role === "control_owner" ? "تعرض المنصة الضوابط المكلف بها فقط." : "متابعة الضوابط والأدلة ضمن صلاحيات حسابك."}</p></aside>
      <div className="cgp-page-column">
        <details key={pathname} className="cgp-mobile-navigation" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>القائمة <span>{current}</span></summary><nav aria-label="التنقل على الجوال">{links}<Link className="cgp-nav-link" href="/change-password">إعدادات كلمة المرور</Link></nav></details>
        <nav className="cgp-breadcrumb" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link>{pathname !== "/" && <><span aria-hidden="true">/</span>{controlId ? <><Link href="/controls">الضوابط</Link><span aria-hidden="true">/</span>{leaf !== "تفاصيل الضابط" && <><Link href={`/controls/${controlId}`}>تفاصيل الضابط</Link><span aria-hidden="true">/</span></>}</> : null}<span aria-current="page">{leaf}</span></>}</nav>
        {error && <p role="alert" className="cgp-shell-error">{error}</p>}
        <div id="cgp-content" tabIndex={-1} className="cgp-route">{children}</div>
      </div>
    </div>
  </div>;
}

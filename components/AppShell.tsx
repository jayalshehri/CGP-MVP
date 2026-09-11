"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import FeedbackWidget from "@/components/FeedbackWidget";

const navigation = [
  { href: "/", label: "لوحة المتابعة", group: "نظرة عامة" },
  { href: "/executive", label: "اللوحة التنفيذية", group: "نظرة عامة", team: true },
  { href: "/reports", label: "التقارير", group: "نظرة عامة", team: true },
  { href: "/controls", label: "الضوابط", group: "الالتزام" },
  { href: "/data-governance", label: "إدارة البيانات والحوكمة", group: "مساحات العمل", data: true },
  { href: "/data-governance/requests", label: "طلبات إدارة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/assets", label: "سجل أصول البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/quality", label: "جودة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/privacy", label: "الخصوصية وسجل المعالجة", group: "مساحات العمل", data: true },
  { href: "/data-governance/sharing", label: "مشاركة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/reports", label: "تقارير حوكمة البيانات", group: "مساحات العمل", data: true },
  { href: "/assessments", label: "تقييم CSCC", group: "قياس الالتزام", team: true },
  { href: "/dcc-assessment", label: "تقييم DCC", group: "قياس الالتزام", team: true },
  { href: "/tcc-assessment", label: "تقييم TCC", group: "قياس الالتزام", team: true },
  { href: "/osmacc-assessment", label: "تقييم OSMACC", group: "قياس الالتزام", team: true },
  { href: "/mappings", label: "خريطة المواءمة", group: "قياس الالتزام", team: true },
  { href: "/third-parties", label: "مخاطر الأطراف الخارجية", group: "الالتزام", team: true },
  { href: "/assets", label: "سجل الأصول التقنية", group: "العمليات", team: true },
  { href: "/risks", label: "سجل المخاطر السيبرانية", group: "العمليات" },
  { href: "/vulnerabilities", label: "سجل الثغرات", group: "العمليات" },
  { href: "/tasks", label: "التكليفات", group: "العمليات" },
  { href: "/alerts", label: "مركز التنبيهات", group: "العمليات", team: true },
  { href: "/evidence", label: "الأدلة", group: "العمليات" },
  { href: "/review", label: "مراجعة الأدلة", group: "العمليات", team: true },
  { href: "/audit", label: "سجل التدقيق", group: "العمليات", team: true },
  { href: "/users", label: "إدارة المستخدمين", group: "الإدارة", admin: true },
  { href: "/feedback", label: "نتائج الاختبارات", group: "الإدارة", admin: true },
];
const roleLabels: Record<UserRole, string> = { admin: "مدير النظام", cybersecurity_team: "فريق الأمن السيبراني", data_governance_team: "فريق إدارة البيانات", control_owner: "مالك الضابط" };
type SearchResult = { id:number; control_code:string; title_ar:string };

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, string> = {
    "/": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "/controls": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/tasks": "M5 4h14v17H5z M9 3h6v3H9z M8 13l3 3 5-6",
    "/alerts": "M12 3l9 16H3L12 3z M12 9v4 M12 17h.01",
    "/evidence": "M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h7v3",
    "/review": "M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z M8 12l3 3 5-6",
    "/audit": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/reports": "M4 3v18h17 M8 17v-5 M13 17V8 M18 17V5",
    "/executive": "M3 4h18v13H3z M8 21h8 M12 17v4 M7 13l4-4 3 2 3-4",
    "/third-parties": "M12 3l8 4v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7z M9 12l2 2 4-4",
    "/vulnerabilities": "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
    "/risks": "M12 3l9 16H3L12 3z M12 9v4 M12 17h.01",
    "/assets": "M4 7h16v13H4z M7 7V4h10v3 M8 12h8 M8 16h5",
    "/assessments": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7 M20 16V5",
    "/dcc-assessment": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7 M20 16V5",
    "/tcc-assessment": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7 M20 16V5",
    "/osmacc-assessment": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7 M20 16V5",
    "/mappings": "M5 5h6v6H5z M13 13h6v6h-6z M11 8h2 M12 8v5 M12 13h1",
    "/users": "M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a6 6 0 0 1 12 0v2 M16 4a4 4 0 0 1 0 8 M17 15a5 5 0 0 1 5 5v1",
    "/feedback": "M20 11.5a8 8 0 0 1-8 8 8.8 8.8 0 0 1-3.4-.7L4 20l1.2-3.7A8 8 0 1 1 20 11.5z M8 11.5h.01 M12 11.5h.01 M16 11.5h.01",
    "/data-governance": "M4 5h16v14H4z M8 9h8 M8 13h5 M16 3v4 M8 3v4",
    "/data-governance/requests": "M5 4h14v17H5z M8 8h8 M8 12h8 M8 16h5",
    "/data-governance/assets": "M4 7h16v13H4z M7 7V4h10v3 M8 12h8 M8 16h5",
    "/data-governance/quality": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7",
    "/data-governance/privacy": "M12 3l8 4v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7z M9 12l2 2 4-4",
    "/data-governance/sharing": "M4 5h16v14H4z M8 9h8 M8 13h5 M16 3v4 M8 3v4",
    "/data-governance/reports": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7",
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
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [controlResults, setControlResults] = useState<SearchResult[]>([]);
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

  const items = account ? navigation.filter(item => account.role === "data_governance_team" ? Boolean(item.data) : (!item.admin || account.role === "admin") && (!item.team || account.role === "admin" || account.role === "cybersecurity_team") && (!item.data || account.role === "admin")) : [];
  const current = navigation.find(item => item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/")))?.label || (pathname === "/change-password" ? "تغيير كلمة المرور" : "لوحة المتابعة");
  const controlId = /^\/controls\/(\d+)/.exec(pathname)?.[1];
  const leaf = pathname.endsWith("/assign") ? "تكليف المالك" : pathname.endsWith("/evidence/new") ? "رفع دليل" : controlId ? "تفاصيل الضابط" : current;
  const linkFor = (item:typeof navigation[number]) => <Link key={item.href} href={item.href} className="cgp-nav-link" title={navCollapsed?item.label:undefined} aria-current={(item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")) ? "page" : undefined}><NavIcon href={item.href}/><span>{item.href === "/tasks" && account?.role === "control_owner" ? "مهامي" : item.label}</span></Link>;
  const links = items.map(linkFor);
  const groups = [...new Set(items.map(item=>item.group))];
  const activeGroup = navigation.find(item => item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"))?.group ?? "نظرة عامة";
  const navigationResults = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return normalized ? items.filter(item => item.label.toLowerCase().includes(normalized)).slice(0, 5) : [];
  }, [items, searchQuery]);
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) { setControlResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const escaped = query.replace(/[,%()]/g, " ");
      const { data } = await supabase.from("controls").select("id,control_code,title_ar").or(`control_code.ilike.%${escaped}%,title_ar.ilike.%${escaped}%`).order("control_code").limit(8);
      setControlResults((data ?? []) as SearchResult[]);
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  async function signOut() {
    setSigningOut(true); setError("");
    const { error } = await supabase.auth.signOut();
    if (error) { setError("تعذر تسجيل الخروج. حاول مرة أخرى."); setSigningOut(false); return; }
    router.replace("/login");
  }
  return <div className={`cgp-workspace ${navCollapsed?"cgp-nav-collapsed":""}`} dir="rtl">
    <a href="#cgp-content" className="cgp-skip">انتقل إلى المحتوى</a>
    <header className="cgp-topbar">
      <Link href="/" className="cgp-brand" aria-label="CGP — لوحة المتابعة"><span className="cgp-brand-mark">CGP</span><span>حوكمة الأمن السيبراني<small>Cyber Governance Platform</small></span></Link>
      <button type="button" className="cgp-global-search" onClick={()=>setSearchOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">⌕</span> بحث سريع <kbd>⌘ K</kbd></button>
      <div className="cgp-account"><span>{account?.name || "مساحة العمل"}<small>{account ? roleLabels[account.role] : "جاري التحقق من الحساب"}</small></span><button type="button" onClick={signOut} disabled={signingOut} className="cgp-signout">{signingOut ? "جاري الخروج…" : "تسجيل الخروج"}</button></div>
    </header>
    {searchOpen && <div className="cgp-search-backdrop" role="presentation" onMouseDown={()=>setSearchOpen(false)}>
      <section className="cgp-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title" onMouseDown={event=>event.stopPropagation()}>
        <div className="cgp-search-title"><h2 id="global-search-title">بحث سريع</h2><button type="button" onClick={()=>setSearchOpen(false)} aria-label="إغلاق البحث">×</button></div>
        <label className="cgp-search-input"><span aria-hidden="true">⌕</span><input autoFocus value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder="ابحث باسم الصفحة أو رقم الضابط أو اسمه" /></label>
        {searching && <p className="cgp-search-hint" role="status">جاري البحث…</p>}
        {!searching && searchQuery.trim().length < 2 && <p className="cgp-search-hint">اكتب حرفين على الأقل للبحث في الضوابط، أو اختر صفحة من القائمة.</p>}
        {navigationResults.length > 0 && <div className="cgp-search-section"><h3>الصفحات</h3>{navigationResults.map(item=><Link key={item.href} href={item.href} onClick={()=>setSearchOpen(false)}><span>{item.label}</span><small>{item.group}</small></Link>)}</div>}
        {controlResults.length > 0 && <div className="cgp-search-section"><h3>الضوابط</h3>{controlResults.map(item=><Link key={item.id} href={`/controls/${item.id}`} onClick={()=>setSearchOpen(false)}><b dir="ltr">{item.control_code}</b><span>{item.title_ar}</span></Link>)}</div>}
        {!searching && searchQuery.trim().length >= 2 && !navigationResults.length && !controlResults.length && <p className="cgp-search-hint">لا توجد نتائج مطابقة ضمن صلاحياتك.</p>}
      </section>
    </div>}
    <div className="cgp-workspace-grid">
      <aside className="cgp-navigation"><div className="cgp-nav-head"><p className="cgp-nav-caption">مساحة العمل</p><button type="button" onClick={()=>setNavCollapsed(v=>!v)} aria-label={navCollapsed?"توسيع القائمة":"طي القائمة"} aria-expanded={!navCollapsed}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg></button></div><nav aria-label="التنقل الرئيسي">{groups.map(group=>{const groupItems=items.filter(item=>item.group===group);const evidenceItems=group==="العمليات"?groupItems.filter(item=>["/evidence","/review"].includes(item.href)):[];const primaryItems=group==="العمليات"?groupItems.filter(item=>!["/evidence","/review"].includes(item.href)):groupItems;return <details className="cgp-nav-group" key={group} open={group===activeGroup}><summary><span>{group}</span><span className="cgp-nav-group-count">{groupItems.length}</span></summary>{primaryItems.map(linkFor)}{evidenceItems.length>0&&<div className="cgp-nav-subgroup"><span>الأدلة</span>{evidenceItems.map(linkFor)}</div>}</details>})}</nav><Link href="/change-password" className="cgp-nav-link cgp-account-link" aria-current={pathname === "/change-password" ? "page" : undefined}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-8H4v8a2 2 0 0 0 2 2zm1-10V8a5 5 0 0 1 10 0v3"/></svg><span>إعدادات كلمة المرور</span></Link><p className="cgp-scope">{account?.role === "control_owner" ? "تعرض المنصة الضوابط المكلف بها فقط." : "متابعة الضوابط والأدلة ضمن صلاحيات حسابك."}</p></aside>
      <div className="cgp-page-column">
        <details key={pathname} className="cgp-mobile-navigation" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>القائمة <span>{current}</span></summary><nav aria-label="التنقل على الجوال">{links}<Link className="cgp-nav-link" href="/change-password">إعدادات كلمة المرور</Link></nav></details>
        <nav className="cgp-breadcrumb" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link>{pathname !== "/" && <><span aria-hidden="true">/</span>{controlId ? <><Link href="/controls">الضوابط</Link><span aria-hidden="true">/</span>{leaf !== "تفاصيل الضابط" && <><Link href={`/controls/${controlId}`}>تفاصيل الضابط</Link><span aria-hidden="true">/</span></>}</> : null}<span aria-current="page">{leaf}</span></>}</nav>
        {error && <p role="alert" className="cgp-shell-error">{error}</p>}
        <div id="cgp-content" tabIndex={-1} className="cgp-route">{children}</div>
        <FeedbackWidget pagePath={pathname} visible={Boolean(account)} />
      </div>
    </div>
  </div>;
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import FeedbackWidget from "@/components/FeedbackWidget";

// CGP v2 IA (Package P1): grouped by domain (الامتثال / المخاطر / المراجعة
// والتدقيق / الاستراتيجية والتنفيذ), each with at most one subgroup level.
// Items sharing a `group` (or `subgroup`) must stay adjacent in this array --
// the sidebar renderer below groups them by walking the array in order, not
// by a separate lookup table, so array order IS visual order.
// Deliberately NOT included (no real page behind them yet, so no nav entry
// per the "no empty placeholders" rule): a dedicated الامتثال overview
// ("مركز الامتثال" is a subgroup label, not its own page), a Risk overview
// page, "خطط المعالجة" (treatment plans), and Audit Management's
// "نظرة عامة / خطة التدقيق / عمليات التدقيق / النتائج والإجراءات" (P4).
const navigation = [
  { href: "/", label: "الرئيسية", group: "" },

  // الامتثال -- shallow on purpose (P1.1): no subgroups, four real
  // destinations only. CSCC/DCC/TCC/OSMACC assessment routes are
  // intentionally NOT linked here anymore -- their pages/URLs are
  // untouched and still fully reachable as deep links; P2 re-surfaces them
  // inside each framework's own workspace. "مركز الامتثال" has no page of
  // its own yet, so it is not a nav item (no placeholder links).
  { href: "/controls", label: "الأطر والضوابط", group: "الامتثال", auditor: true },
  { href: "/evidence", label: "الأدلة", group: "الامتثال", auditor: true },
  { href: "/review", label: "التحقق", group: "الامتثال", team: true },
  { href: "/mappings", label: "المواءمة", group: "الامتثال", team: true },

  // المخاطر
  { href: "/risks", label: "سجل المخاطر", group: "المخاطر" },
  { href: "/assets", label: "الأصول", group: "المخاطر", team: true },
  { href: "/vulnerabilities", label: "الثغرات", group: "المخاطر" },
  { href: "/third-parties", label: "الأطراف الثالثة", group: "المخاطر", team: true },

  // المراجعة والتدقيق (Full Audit Management is P4 -- only the periodic
  // control-review schedule, which already exists, is exposed in P1)
  { href: "/audit-schedule", label: "المراجعات الدورية للضوابط", group: "المراجعة والتدقيق", auditor: true },

  // الاستراتيجية والتنفيذ
  { href: "/roadmap/analysis", label: "المحفظة السيبرانية", group: "الاستراتيجية والتنفيذ", team: true },
  { href: "/roadmap/dashboard", label: "خارطة الطريق", group: "الاستراتيجية والتنفيذ", team: true },
  { href: "/roadmap", label: "المشاريع والمبادرات", group: "الاستراتيجية والتنفيذ", team: true },

  { href: "/reports", label: "التقارير", group: "", team: true },
  { href: "/tasks", label: "مهامي", group: "", separatorBefore: true },

  // مساحات العمل (data governance / shared workspaces) -- untouched by P1,
  // this IA package only restructures the cybersecurity workspace above.
  { href: "/data-governance", label: "إدارة البيانات والحوكمة", group: "مساحات العمل", data: true },
  { href: "/data-governance/requests", label: "طلبات إدارة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/assets", label: "سجل أصول البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/controls", label: "ضوابط NDMO", group: "مساحات العمل", data: true },
  { href: "/shared-controls", label: "الكتالوج الموحد", group: "الامتثال", team: true, data: true },
  { href: "/data-governance/quality", label: "جودة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/privacy", label: "الخصوصية وسجل المعالجة", group: "مساحات العمل", data: true },
  { href: "/data-governance/sharing", label: "مشاركة البيانات", group: "مساحات العمل", data: true },
  { href: "/data-governance/reports", label: "تقارير حوكمة البيانات", group: "مساحات العمل", data: true },

  // الإدارة والإعدادات
  { href: "/users", label: "إدارة المستخدمين", group: "الإدارة والإعدادات", admin: true },
  { href: "/feedback", label: "نتائج الاختبارات", group: "الإدارة والإعدادات", admin: true },
  { href: "/audit", label: "سجل النشاط والتغييرات", group: "الإدارة والإعدادات", team: true },
];
const roleLabels: Record<UserRole, string> = { admin: "مدير النظام", cybersecurity_team: "مدير الامتثال والمراجعة", data_governance_team: "فريق إدارة البيانات", control_owner: "مالك الضابط", nca_external_auditor: "مراجع خارجي — NCA" };
type SearchResult = { id:number; control_code:string; title_ar:string };

function NavIcon({ href }: { href: string }) {
  const paths: Record<string, string> = {
    "/": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    "/controls": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/tasks": "M5 4h14v17H5z M9 3h6v3H9z M8 13l3 3 5-6",
    "/roadmap": "M4 18V6 M4 18h16 M8 15v-3 M12 15V8 M16 15v-5 M4 6h16 M17 3l3 3-3 3",
    "/roadmap/dashboard": "M4 18V6 M4 18h16 M8 15v-3 M12 15V8 M16 15v-5 M4 6h16 M17 3l3 3-3 3",
    "/roadmap/analysis": "M4 18V6 M4 18h16 M8 15v-3 M12 15V8 M16 15v-5 M4 6h16 M17 3l3 3-3 3",
    "/alerts": "M12 3l9 16H3L12 3z M12 9v4 M12 17h.01",
    "/evidence": "M3 6h7l2 3h9v11H3z M3 6V4h7l2 2h7v3",
    "/review": "M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z M8 12l3 3 5-6",
    "/audit": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/audit-schedule": "M7 3v3 M17 3v3 M4 8h16v12H4z M4 11h16 M8 15h3",
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
    "/data-governance/controls": "M5 3h14v18H5z M8 7h8 M8 12h8 M8 17h5",
    "/shared-controls": "M5 5h6v6H5z M13 13h6v6h-6z M11 8h2 M12 8v5 M12 13h1",
    "/data-governance/quality": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7",
    "/data-governance/privacy": "M12 3l8 4v5c0 5-3.4 8-8 10-4.6-2-8-5-8-10V7z M9 12l2 2 4-4",
    "/data-governance/sharing": "M4 5h16v14H4z M8 9h8 M8 13h5 M16 3v4 M8 3v4",
    "/data-governance/reports": "M4 19V5 M4 19h16 M8 16v-4 M12 16V8 M16 16v-7",
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[href]}/></svg>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (["/login", "/activate", "/workspace"].includes(pathname)) return children;
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

  const workspace = pathname === "/shared-controls" ? "shared" : pathname.startsWith("/data-governance") ? "data" : "cyber";
  const workspaceLabel = workspace === "data" ? "حوكمة البيانات" : workspace === "shared" ? "مركز المواءمة" : "الأمن السيبراني";
  const permittedItems = account ? navigation.filter(item => account.role === "data_governance_team" ? Boolean(item.data) : account.role === "nca_external_auditor" ? Boolean(item.auditor) : (!item.admin || account.role === "admin") && (!item.team || account.role === "admin" || account.role === "cybersecurity_team") && (!item.data || account.role === "admin")) : [];
  const items = permittedItems.filter(item => workspace === "shared" ? item.href === "/shared-controls" : workspace === "data" ? Boolean(item.data) && item.href !== "/shared-controls" : !item.data && item.href !== "/shared-controls");
  const current = navigation.find(item => item.href !== "/" && (pathname === item.href || pathname.startsWith(item.href + "/")))?.label || (pathname === "/change-password" ? "تغيير كلمة المرور" : "الرئيسية");
  const controlId = /^\/controls\/(\d+)/.exec(pathname)?.[1];
  const leaf = pathname.endsWith("/assign") ? "تكليف المالك" : pathname.endsWith("/evidence/new") ? "رفع دليل" : controlId ? "تفاصيل الضابط" : current;
  const linkFor = (item:typeof navigation[number]) => <Link key={item.href} href={item.href} className="cgp-nav-link" title={navCollapsed?item.label:undefined} aria-current={(item.href === "/" ? pathname === "/" : item.href === "/roadmap" ? pathname === "/roadmap" : pathname === item.href || pathname.startsWith(item.href + "/")) ? "page" : undefined}><NavIcon href={item.href}/><span>{item.label}</span></Link>;
  const links = items.map(linkFor);
  // Blocks preserve array order: adjacent items sharing a `group` (or, inside
  // a group, a `subgroup`) become one visual block. This is what lets the new
  // IA interleave standalone links (التقارير, مهامي) between domain groups
  // instead of forcing every ungrouped item to the very top.
  function blocksBy<T extends { group?: string }>(list: T[]): { key: string; items: T[] }[] {
    const blocks: { key: string; items: T[] }[] = [];
    for (const item of list) {
      const key = item.group || "";
      const last = blocks[blocks.length - 1];
      if (last && last.key === key && key !== "") last.items.push(item);
      else blocks.push({ key, items: [item] });
    }
    return blocks;
  }
  const topBlocks = blocksBy(items);
  const activeItem = navigation.find(item => item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/"));
  const activeGroup = activeItem?.group ?? "";
  const navigationResults = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return normalized ? items.filter(item => item.label.toLowerCase().includes(normalized)).slice(0, 5) : [];
  }, [items, searchQuery]);
  useEffect(() => {
    const query = searchQuery.trim();
    // Cybersecurity controls have their own catalog. Keep search results within the current workspace.
    if (workspace !== "cyber" || query.length < 2) { setControlResults([]); setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      // Strip PostgREST filter separators (`,()`) and ILIKE wildcard characters (`%_`)
      // so a raw search string can't widen the match beyond the typed text.
      const escaped = query.replace(/[,%()_]/g, " ");
      const { data } = await supabase.from("controls").select("id,control_code,title_ar,frameworks!inner(is_active)").eq("frameworks.is_active",true).or(`control_code.ilike.%${escaped}%,title_ar.ilike.%${escaped}%`).order("control_code").limit(8);
      setControlResults((data ?? []) as SearchResult[]);
      setSearching(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchQuery, workspace]);
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
      <Link href="/" className="cgp-brand" aria-label="CGP — الصفحة الرئيسية"><span className="cgp-brand-mark">CGP</span><span>منصة الحوكمة السيبرانية<small>منصة موحدة للالتزام والمخاطر</small></span></Link>
      <div className="cgp-topbar-context" aria-label="موقعك الحالي"><span>{workspaceLabel}</span><i aria-hidden="true">/</i><strong>{leaf}</strong></div>
      <div className="cgp-topbar-tools">
        <button type="button" className="cgp-global-search" onClick={()=>setSearchOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">⌕</span><span>بحث</span><kbd>⌘ K</kbd></button>
        {workspace==="cyber"&&<Link href="/alerts" className="cgp-icon-button" aria-label="التنبيهات" title="التنبيهات"><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l9 16H3L12 3z M12 9v4 M12 17h.01"/></svg></Link>}
        <details className="cgp-account-menu cgp-help-menu"><summary aria-label="المساعدة" title="المساعدة"><span className="cgp-icon-button" aria-hidden="true">؟</span></summary><div className="cgp-account-panel"><p>للمساعدة أو الدعم، تواصل مع مسؤول النظام في جهتك.</p></div></details>
        <details className="cgp-account-menu"><summary aria-label="فتح قائمة الحساب"><span className="cgp-account-avatar" aria-hidden="true">{account?.name?.trim().slice(0, 1) || "ح"}</span><span className="cgp-account"><b>{account?.name || "حسابي"}</b><small>{account ? roleLabels[account.role] : "جاري التحقق من الحساب"}</small></span></summary><div className="cgp-account-panel"><p>{account ? roleLabels[account.role] : "جاري التحقق من الحساب"}</p><button type="button" onClick={signOut} disabled={signingOut} className="cgp-signout">{signingOut ? "جاري الخروج…" : "تسجيل الخروج"}</button></div></details>
      </div>
    </header>
    {searchOpen && <div className="cgp-search-backdrop" role="presentation" onMouseDown={()=>setSearchOpen(false)}>
      <section className="cgp-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title" onMouseDown={event=>event.stopPropagation()}>
        <div className="cgp-search-title"><h2 id="global-search-title">بحث سريع</h2><button type="button" onClick={()=>setSearchOpen(false)} aria-label="إغلاق البحث">×</button></div>
        <label className="cgp-search-input"><span aria-hidden="true">⌕</span><input autoFocus value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder={workspace === "cyber" ? "ابحث باسم الصفحة أو رقم الضابط أو اسمه" : "ابحث باسم صفحة في مساحة العمل"} /></label>
        {searching && <p className="cgp-search-hint" role="status">جاري البحث…</p>}
        {!searching && searchQuery.trim().length < 2 && <p className="cgp-search-hint">{workspace === "cyber" ? "اكتب حرفين على الأقل للبحث في الضوابط، أو اختر صفحة من القائمة." : "اكتب اسم الصفحة للوصول السريع داخل مساحة العمل الحالية."}</p>}
        {navigationResults.length > 0 && <div className="cgp-search-section"><h3>الصفحات</h3>{navigationResults.map(item=><Link key={item.href} href={item.href} onClick={()=>setSearchOpen(false)}><span>{item.label}</span><small>{item.group}</small></Link>)}</div>}
        {controlResults.length > 0 && <div className="cgp-search-section"><h3>الضوابط</h3>{controlResults.map(item=><Link key={item.id} href={`/controls/${item.id}`} onClick={()=>setSearchOpen(false)}><b dir="ltr">{item.control_code}</b><span>{item.title_ar}</span></Link>)}</div>}
        {!searching && searchQuery.trim().length >= 2 && !navigationResults.length && !controlResults.length && <p className="cgp-search-hint">لا توجد نتائج مطابقة ضمن صلاحياتك.</p>}
      </section>
    </div>}
    <div className="cgp-workspace-grid">
      <aside className="cgp-navigation"><div className="cgp-nav-head"><p className="cgp-nav-caption">{workspaceLabel}</p><button type="button" onClick={()=>setNavCollapsed(v=>!v)} aria-label={navCollapsed?"توسيع القائمة":"طي القائمة"} aria-expanded={!navCollapsed}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 18l6-6-6-6"/></svg></button></div><nav aria-label="التنقل الرئيسي">{topBlocks.map((block,index)=>{
        if(!block.key) return <span key={`u-${index}`}>{block.items.map(item=><span key={item.href}>{item.separatorBefore&&<hr className="cgp-nav-separator"/>}{linkFor(item)}</span>)}</span>;
        return <details className="cgp-nav-group" key={block.key} open={block.key===activeGroup}><summary><span>{block.key}</span></summary>{block.items.map(linkFor)}</details>;
      })}</nav><Link href="/change-password" className="cgp-nav-link cgp-account-link" aria-current={pathname === "/change-password" ? "page" : undefined}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-8H4v8a2 2 0 0 0 2 2zm1-10V8a5 5 0 0 1 10 0v3"/></svg><span>إعدادات كلمة المرور</span></Link><p className="cgp-scope">{workspace === "data" ? "سجلات وضوابط وطلبات إدارة البيانات ضمن صلاحيات حسابك." : workspace === "shared" ? "مواءمة معتمدة بين الأطر دون خلط مساحات العمل." : account?.role === "control_owner" ? "تعرض المنصة الضوابط المكلف بها فقط." : "متابعة الأمن السيبراني ضمن صلاحيات حسابك."}</p></aside>
      <div className="cgp-page-column">
        <details key={pathname} className="cgp-mobile-navigation" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>القائمة <span>{current}</span></summary><nav aria-label="التنقل على الجوال">{links}<Link className="cgp-nav-link" href="/change-password">إعدادات كلمة المرور</Link></nav></details>
        <nav className="cgp-breadcrumb" aria-label="مسار الصفحة"><Link href="/">الرئيسية</Link>{pathname !== "/" && <>{activeGroup&&<><span aria-hidden="true">/</span><span>{activeGroup}</span></>}<span aria-hidden="true">/</span>{controlId ? <><Link href="/controls">الأطر والضوابط</Link><span aria-hidden="true">/</span>{leaf !== "تفاصيل الضابط" && <><Link href={`/controls/${controlId}`}>تفاصيل الضابط</Link><span aria-hidden="true">/</span></>}</> : null}<span aria-current="page">{leaf}</span></>}</nav>
        {error && <p role="alert" className="cgp-shell-error">{error}</p>}
        <div id="cgp-content" tabIndex={-1} className="cgp-route">{children}</div>
        <FeedbackWidget pagePath={pathname} visible={Boolean(account)} />
      </div>
    </div>
  </div>;
}

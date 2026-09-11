"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import "./workspaces.css";

type Workspace = { href:string; title:string; english:string; description:string; roleLabel:string; metrics:{label:string;value:string}[]; tone:"cyber"|"data" };

export default function WorkspacesPreviewPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    let active = true;
    requireProfile().then(({ profile }) => active && setRole(profile.role)).catch(() => router.replace("/login"));
    return () => { active = false; };
  }, [router]);

  if (!role) return <main className="workspace-launcher"><p>جاري تحميل مساحات العمل…</p></main>;

  const allSpaces:Workspace[] = [
    { href:"/", title:"الأمن السيبراني", english:"Cybersecurity Governance", description:"إدارة الضوابط والمخاطر والثغرات والأدلة والتقارير الأمنية.", roleLabel:"مساحة فريق الأمن السيبراني", tone:"cyber", metrics:[{label:"الضوابط",value:"108"},{label:"مهام مفتوحة",value:"0"},{label:"مخاطر حرجة",value:"0"}] },
    { href:"/data-governance", title:"إدارة البيانات والحوكمة", english:"Data Governance", description:"حوكمة البيانات الوطنية، الخصوصية، المشاركة، الجودة، والسياسات.", roleLabel:"مساحة فريق إدارة البيانات", tone:"data", metrics:[{label:"مجالات NDMO",value:"15"},{label:"سياسات",value:"7"},{label:"طلبات مفتوحة",value:"0"}] },
  ];
  const spaces = allSpaces.filter(space => role === "admin" || (role === "cybersecurity_team" && space.tone === "cyber") || (role === "data_governance_team" && space.tone === "data") || (role === "control_owner" && space.tone === "cyber"));

  return <main className="workspace-launcher" dir="rtl">
    <header className="launcher-top">
      <Link href="/" className="launcher-brand"><b>CGP</b><span>منصة الحوكمة المؤسسية<small>Enterprise Governance Platform</small></span></Link>
      <span className="launcher-role">{role === "admin" ? "مدير النظام" : role === "cybersecurity_team" ? "فريق الأمن السيبراني" : role === "data_governance_team" ? "فريق إدارة البيانات" : "مالك الضابط"}</span>
    </header>
    <section className="launcher-intro">
      <span>مساحات العمل</span>
      <h1>اختر مساحة العمل المناسبة لك</h1>
      <p>تظهر لك المساحات التي تسمح بها صلاحيات حسابك فقط.</p>
    </section>
    <section className="workspace-cards" aria-label="مساحات العمل المتاحة">
      {spaces.map(space => <Link key={space.href} href={space.href} className={"workspace-card "+space.tone}>
        <div className="workspace-card-top"><span className="workspace-icon">{space.tone === "cyber" ? "⌁" : "▦"}</span><span className="workspace-access">{space.roleLabel}</span></div>
        <div><h2>{space.title}</h2><small>{space.english}</small><p>{space.description}</p></div>
        <div className="workspace-metrics">{space.metrics.map(metric => <span key={metric.label}><b>{metric.value}</b>{metric.label}</span>)}</div>
        <div className="workspace-open">فتح المساحة <b>←</b></div>
      </Link>)}
    </section>
    <footer className="launcher-footer">يمكنك التبديل بين المساحات المتاحة من القائمة الجانبية في أي وقت.</footer>
  </main>;
}

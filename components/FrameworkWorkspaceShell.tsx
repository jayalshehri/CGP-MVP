"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { assessmentHrefFor } from "@/lib/compliance-frameworks";
import "@/app/compliance/[code]/workspace.css";

export type FrameworkSection = "overview" | "controls" | "assessment" | "evidence" | "findings";

const sections: { key: FrameworkSection; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "controls", label: "الضوابط" },
  { key: "assessment", label: "التقييم" },
  { key: "evidence", label: "الأدلة" },
  { key: "findings", label: "الملاحظات والإجراءات" },
];

export default function FrameworkWorkspaceShell({
  code,
  name,
  version,
  activeSection,
  role,
  children,
}: {
  code: string;
  name: string;
  version: string;
  activeSection: FrameworkSection;
  role: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspaceHref = `/compliance/${encodeURIComponent(code)}`;
  const sectionHref = (section: FrameworkSection) => {
    if (section === activeSection) return `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
    if (section === "assessment") return assessmentHrefFor(code) ?? `${workspaceHref}?tab=assessment`;
    return section === "overview" ? workspaceHref : `${workspaceHref}?tab=${section}`;
  };

  return <div className="framework-workspace-shell" dir="rtl">
    <header className="workspace-header">
      <div><span className="workspace-kicker" dir="ltr">{code} · {version}</span><h1>{name}</h1></div>
      <Link className="workflow-button" href="/compliance">مركز الامتثال ←</Link>
    </header>
    <nav className="workspace-tabs" aria-label={`أقسام مساحة ${code}`}>
      {sections.filter(section =>
        (section.key !== "assessment" || role !== "data_governance_team") &&
        (section.key !== "findings" || role !== "data_governance_team")
      ).map(section => <Link key={section.key} href={sectionHref(section.key)}
        aria-current={activeSection === section.key ? "page" : undefined}
        className={activeSection === section.key ? "active" : undefined}>
        {section.label}
      </Link>)}
    </nav>
    {children}
  </div>;
}

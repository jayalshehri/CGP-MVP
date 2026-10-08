import Link from "next/link";
import type { ReactNode } from "react";
import { executionYearLabels, mappingCompletenessLabels, statusLabels, type MappingCompleteness, type ProjectStatus } from "@/lib/project-portfolio";

// Shared building blocks for the roadmap management area: one header density,
// one summary strip, one filter bar, one set of badges across the three views.
const views = [
  { href: "/roadmap", label: "سجل المشاريع السيبرانية" },
  { href: "/roadmap/analysis", label: "تحليل المحفظة السيبرانية" },
  { href: "/roadmap/dashboard", label: "خارطة طريق المشاريع" },
] as const;

export function RoadmapTabs({ active }: { active: typeof views[number]["href"] }) {
  return <nav className="roadmap-view-tabs" aria-label="إدارة محفظة الأمن السيبراني">
    {views.map((view) => <Link key={view.href} className={view.href === active ? "active" : undefined} aria-current={view.href === active ? "page" : undefined} href={view.href}>{view.label}</Link>)}
  </nav>;
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="rm-header"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="rm-header-actions">{actions}</div>}</header>;
}

export type SummaryItem = { label: string; value: string | number; href?: string; tone?: "attention" };
export function SummaryStrip({ label, items }: { label: string; items: SummaryItem[] }) {
  return <dl className="rm-summary" aria-label={label}>
    {items.map((item) => <div key={item.label} className={item.tone ? `is-${item.tone}` : undefined}>
      <dt>{item.label}</dt>
      <dd>{item.href ? <Link href={item.href}><bdi>{item.value}</bdi></Link> : <bdi>{item.value}</bdi>}</dd>
    </div>)}
  </dl>;
}

export function FilterBar({ label, children, count }: { label: string; children: ReactNode; count?: ReactNode }) {
  return <section className="rm-filters" aria-label={label}>{children}{count !== undefined && <output className="rm-filter-count">{count}</output>}</section>;
}

export function FilterSelect({ label, value, onChange, options, allLabel = "الكل" }: { label: string; value: string; onChange: (value: string) => void; options: Record<string, string>; allLabel?: string | null }) {
  return <label className="rm-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    {allLabel !== null && <option value="all">{allLabel}</option>}
    {Object.entries(options).map(([option, text]) => <option key={option} value={option}>{text}</option>)}
  </select></label>;
}

/** Priority and its execution year as one fact (the year is derived from the priority). */
export const priorityYearOptions: Record<string, string> = { P1: `P1 · ${executionYearLabels[1]}`, P2: `P2 · ${executionYearLabels[2]}`, P3: `P3 · ${executionYearLabels[3]}` };
export function PriorityBadge({ priority }: { priority: string | null }) {
  if (priority !== "P1" && priority !== "P2" && priority !== "P3") return <span className="rm-muted">غير مصنّفة</span>;
  const year = executionYearLabels[Number(priority[1]) as 1 | 2 | 3];
  return <span className={`rm-priority ${priority}`}><bdi>{priority}</bdi><small>{year}</small></span>;
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`rm-status ${status}`}>{statusLabels[status as ProjectStatus] ?? status}</span>;
}

export const mappingShortLabels: Record<MappingCompleteness, string> = {
  verified: "مكتمل التحقق", partially_mapped: "ربط جزئي", mapping_pending: "بانتظار المراجعة", source_error: "خطأ مصدر",
};
export function MappingBadge({ completeness, exact, references }: { completeness: string | null; exact?: number; references?: number }) {
  const key = (completeness ?? "mapping_pending") as MappingCompleteness;
  return <span className={`rm-mapping ${key}`} title={mappingCompletenessLabels[key]}>{mappingShortLabels[key] ?? key}{references ? <bdi className="rm-mapping-count">{`${exact ?? 0}/${references}`}</bdi> : null}</span>;
}

export function ArchivedBadge() {
  return <span className="rm-archived">مؤرشف</span>;
}

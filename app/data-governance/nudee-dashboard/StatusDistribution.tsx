import Link from "next/link";
import { workLink, type WorkItem } from "./officeWork";
import styles from "./daily.module.css";

const statuses = [
  { view: "unassigned", label: "لم يُسند", color: "#88969e" },
  { view: "assigned", label: "بانتظار رفع الدليل", color: "#3975a5" },
  { view: "submitted", label: "بانتظار المراجعة", color: "#c69a32" },
  { view: "changes_requested", label: "معاد للتعديل", color: "#c6663d" },
  { view: "approved", label: "معتمد", color: "#23775f" },
];
const number = new Intl.NumberFormat("ar-SA");
const percent = new Intl.NumberFormat("ar-SA", { style: "percent", maximumFractionDigits: 1 });

// Draw two arcs so that a single status can occupy the entire circle.
function arc(start: number, end: number) {
  function point(fraction: number) {
    const angle = fraction * 2 * Math.PI;
    return [60 + 47 * Math.sin(angle), 60 - 47 * Math.cos(angle)].join(" ");
  }
  return `M ${point(start)} A 47 47 0 0 1 ${point((start + end) / 2)} A 47 47 0 0 1 ${point(end)}`;
}

export default function StatusDistribution({ items }: { items: WorkItem[] }) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const view = item.task?.status || "unassigned";
    counts.set(view, (counts.get(view) ?? 0) + 1);
  }
  const total = items.length;
  let position = 0;
  const segments = [];
  for (const status of statuses) {
    const count = counts.get(status.view) ?? 0;
    const start = position;
    position += count;
    const share = total ? count / total : 0;
    segments.push({ ...status, count, arc: count ? arc(start / total, position / total) : "",
      percentage: share > 0 && share < 0.001 ? "أقل من " + percent.format(0.001) : percent.format(share),
      href: workLink({view:status.view}) });
  }
  if (position !== total) return <p role="status">تعذّر توزيع جميع المتطلبات على الحالات المعروفة. <Link href={workLink({view:"all"})}>فتح سجل المتطلبات</Link></p>;
  if (!total) return <p>لا توجد متطلبات مسجّلة لعرض توزيعها.</p>;
  return <div className={styles.distribution}>
    <div className={styles.ring}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        {segments.filter(s => s.count > 0).map(s =>
          <Link key={s.view} href={s.href} tabIndex={-1} prefetch={false}>
            <title>{s.label} · {number.format(s.count)} · {s.percentage}</title>
            <path d={s.arc} fill="none" stroke={s.color} strokeWidth="15"/>
          </Link>)}
      </svg>
      <div className={styles.ringTotal}><strong>{number.format(total)}</strong><span>إجمالي المتطلبات</span></div>
    </div>
    <ul className={styles.legend}>{segments.map(s =>
      <li key={s.view}><Link href={s.href} prefetch={false}>
        <i aria-hidden="true" style={{backgroundColor:s.color}}/>
        <span>{s.label}</span><b>{number.format(s.count)}</b><small>{s.percentage}</small>
      </Link></li>)}</ul>
  </div>;
}

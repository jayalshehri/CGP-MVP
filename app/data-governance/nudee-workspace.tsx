import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./nudee-workspace.module.css";

export const formatCount = new Intl.NumberFormat("ar-SA");

export function NudeeHeading({ title, description, children }: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.heading}>
      <span className={styles.eyebrow}>مكتب إدارة البيانات</span>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </header>
  );
}

export function NudeeNavigation({ current }: { current: "evidence" | "dashboard" }) {
  return (
    <nav className={styles.navigation} aria-label="صفحات مؤشر نُضيء">
      <Link href="/data-governance/nudee" aria-current={current === "evidence" ? "page" : undefined}>
        التكليفات والأدلة
      </Link>
      <Link href="/data-governance/nudee-dashboard" aria-current={current === "dashboard" ? "page" : undefined}>
        لوحة المؤشر
      </Link>
    </nav>
  );
}

export function NudeeMetric({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong><bdi>{typeof value === "number" ? formatCount.format(value) : value}</bdi></strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

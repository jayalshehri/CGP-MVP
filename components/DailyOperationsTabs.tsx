import Link from "next/link";
import styles from "./DailyOperationsTabs.module.css";

export default function DailyOperationsTabs({ current }: { current: "tasks" | "alerts" }) {
  return (
    <nav className={styles.tabs} aria-label="أقسام المتابعة اليومية">
      <Link href="/tasks" aria-current={current === "tasks" ? "page" : undefined}>التكليفات</Link>
      <Link href="/alerts" aria-current={current === "alerts" ? "page" : undefined}>التنبيهات</Link>
    </nav>
  );
}

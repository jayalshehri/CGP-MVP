"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NudeeHeading, NudeeMetric } from "./nudee-workspace";
import styles from "./nudee-workspace.module.css";

type NudeeSummary = { requirements:number|null; assigned:number|null; submitted:number|null; approved:number|null };

export default function DataGovernancePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<NudeeSummary | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await requireProfile(["admin", "data_governance_team"]);
        // Independent exact HEAD counts avoid the default row limit and
        // do not download potentially thousands of assignments to the browser.
        const [requirements, assigned, submitted, approved] = await Promise.all([
          supabase.from("nudee_requirements").select("id", { count: "exact", head: true }),
          supabase.from("nudee_assignments").select("id", { count: "exact", head: true }),
          supabase.from("nudee_assignments").select("id", { count: "exact", head: true }).eq("status", "submitted"),
          supabase.from("nudee_assignments").select("id", { count: "exact", head: true }).eq("status", "approved"),
        ]);
        const queryError = [requirements, assigned, submitted, approved].find(result => result.error)?.error;
        if (queryError) throw queryError;
        if (active) {
          setSummary({
            requirements: requirements.count,
            assigned: assigned.count,
            submitted: submitted.count,
            approved: approved.count,
          });
        }
      } catch (e) {
        if (!active) return;
        const message = e instanceof Error ? e.message : "تعذر تحميل بيانات نُضيء";
        if (message.includes("تسجيل الدخول")) router.replace("/login");
        else setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  return (
    <main className={styles.workspace} dir="rtl">
      <NudeeHeading title="مؤشر نُضيء" description="إدارة متطلبات المؤشر الوطني للبيانات ومتابعة الامتثال والإنجاز." />
      <section className={styles.homeOptions} aria-label="مسارات العمل">
        <article className={`${styles.panel} ${styles.homeCard}`}>
          <h2>التكليفات والأدلة</h2>
          <p className={styles.description}>أسند المتطلبات إلى مالكي الأدلة، وتابع الرفع والمراجعة والاعتماد.</p>
          <Link className={`${styles.button} ${styles.primary}`} href="/data-governance/nudee">إدارة المتطلبات والأدلة</Link>
        </article>
        <article className={`${styles.panel} ${styles.homeCard}`}>
          <h2>لوحة مؤشر نُضيء</h2>
          <p className={styles.description}>راجع الامتثال حسب المجال ومستوى النضج، وتابع المراحل والإنجاز الأسبوعي.</p>
          <Link className={styles.button} href="/data-governance/nudee-dashboard">فتح لوحة المؤشر</Link>
        </article>
      </section>
      {error && <p role="alert" className={`${styles.message} ${styles.error}`}>{error}</p>}
      {loading && <p role="status" className={styles.message}>جاري تحميل بيانات المؤشر…</p>}
      {!loading && !error && summary && (
        <section className={styles.summary} aria-labelledby="nudee-summary">
          <h2 id="nudee-summary">ملخص التكليفات والأدلة</h2>
          <div className={styles.metrics}>
            <NudeeMetric label="إجمالي المتطلبات" value={summary.requirements ?? "—"} />
            <NudeeMetric label="التكليفات المسجلة" value={summary.assigned ?? "—"} />
            <NudeeMetric label="بانتظار المراجعة" value={summary.submitted ?? "—"} />
            <NudeeMetric label="الأدلة المعتمدة" value={summary.approved ?? "—"} />
          </div>
        </section>
      )}
    </main>
  );
}

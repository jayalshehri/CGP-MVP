"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading } from "@/components/WorkflowUI";
import "./data-governance.css";

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

  const display = (value:number|null|undefined) => value == null ? "—" : new Intl.NumberFormat("ar-SA").format(value);

  return <main className="dg-page" dir="rtl">
    <div className="dg-eyebrow">مكتب إدارة البيانات · المرحلة الحالية</div>
    <WorkflowHeading title="مؤشر نُضيء" description="إدارة متطلبات المؤشر وتكليف مالكي الأدلة ومراجعتها وقياس التقدم من مساحة عمل واحدة." />
    <section className="dg-hero" aria-label="بدء العمل على مؤشر نُضيء">
      <div>
        <span>المؤشر الوطني للبيانات</span>
        <h2>متطلبات المؤشر والأدلة والداشبورد في مكان واحد</h2>
        <p>اختر إدارة المتطلبات لتنفيذ التكليفات والمراجعات، أو افتح لوحة المؤشر لمتابعة النتائج.</p>
      </div>
      <div className="dg-hero-actions">
        <Link href="/data-governance/nudee">إدارة المتطلبات والأدلة</Link>
        <Link href="/data-governance/nudee-dashboard">فتح داشبورد نُضيء</Link>
      </div>
    </section>
    {error && <div role="alert" className="dg-loading">{error}</div>}
    {loading && <p role="status" className="dg-loading">جاري تحميل بيانات المؤشر…</p>}
    {!loading && !error && summary && <section className="dg-metrics" aria-label="ملخص حالة نُضيء">
      <article><span>إجمالي المتطلبات</span><strong>{display(summary.requirements)}</strong><small>المتطلبات المستوردة</small></article>
      <article><span>التكليفات</span><strong>{display(summary.assigned)}</strong><small>التكليفات المسجلة</small></article>
      <article><span>بانتظار المراجعة</span><strong>{display(summary.submitted)}</strong><small>أدلة مقدمة تنتظر قرار المكتب</small></article>
      <article><span>معتمد</span><strong>{display(summary.approved)}</strong><small>التكليفات التي اعتمد دليلها</small></article>
    </section>}
    <section className="dg-section" aria-label="مسارات العمل الحالية">
      <header><div><span>ابدأ هنا</span><h2>وظيفتان واضحتان</h2><p>بقية وحدات إدارة البيانات محفوظة للتوسع اللاحق، وغير معروضة في هذه المرحلة.</p></div></header>
      <div className="dg-framework-grid">
        <article><h3>التكليفات والأدلة</h3><p>إسناد المتطلب، رفع الدليل، المراجعة، إعادة التعديل والاعتماد.</p><Link href="/data-governance/nudee">فتح التكليفات</Link></article>
        <article><h3>داشبورد نُضيء</h3><p>مؤشرات الامتثال ومستويات النضج والمجالات والجدول الزمني.</p><Link href="/data-governance/nudee-dashboard">فتح الداشبورد</Link></article>
      </div>
    </section>
  </main>;
}

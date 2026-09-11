"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";
type Metrics = {
  assets: number;
  quality: number;
  privacy: number;
  sharing: number;
  controls: number;
};
export default function DataGovernanceReports() {
  const r = useRouter();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        await requireProfile(["admin", "data_governance_team"]);
        const results = await Promise.all(
          [
            "data_assets",
            "data_quality_assessments",
            "privacy_processing_activities",
            "data_sharing_requests",
            "data_governance_controls",
          ].map((table) =>
            supabase.from(table).select("*", { count: "exact", head: true }),
          ),
        );
        if (results.some((x) => x.error)) throw new Error("تعذر تحميل التقرير");
        setM({
          assets: results[0].count || 0,
          quality: results[1].count || 0,
          privacy: results[2].count || 0,
          sharing: results[3].count || 0,
          controls: results[4].count || 0,
        });
      } catch {
        setError("تعذر تحميل مؤشرات حوكمة البيانات.");
      }
    })();
  }, [r]);
  return (
    <main className="dg-page" dir="rtl">
      <div className="workflow-heading">
        <div>
          <span>التقارير</span>
          <h1>لوحة مؤشرات حوكمة البيانات</h1>
          <p>قراءة تشغيلية لسجل الأصول والجودة والخصوصية والمشاركة والضوابط.</p>
        </div>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !m ? (
        <p className="dg-loading">جاري تحميل المؤشرات…</p>
      ) : (
        <>
          <section className="dg-metrics dg-report-metrics">
            <article>
              <span>أصول البيانات</span>
              <strong>{m.assets}</strong>
              <small>أصول مسجلة</small>
            </article>
            <article>
              <span>تقييمات الجودة</span>
              <strong>{m.quality}</strong>
              <small>تقييمات موثقة</small>
            </article>
            <article>
              <span>أنشطة المعالجة</span>
              <strong>{m.privacy}</strong>
              <small>سجل الخصوصية</small>
            </article>
            <article>
              <span>طلبات المشاركة</span>
              <strong>{m.sharing}</strong>
              <small>طلبات مسجلة</small>
            </article>
          </section>
          <section className="dg-section">
            <header>
              <div>
                <span>الالتزام</span>
                <h2>الضوابط الوطنية</h2>
                <p>
                  يعرض السجل عدد الضوابط التي أدخلت من المصدر الرسمي، ثم ترتبط
                  بالأصول والطلبات والأدلة.
                </p>
              </div>
              <strong className="dg-control-count">{m.controls}</strong>
            </header>
            <div className="dg-action-grid">
              <Link href="/data-governance/assets">إدارة أصول البيانات</Link>
              <Link href="/data-governance/quality">فتح تقييمات الجودة</Link>
              <Link href="/data-governance/privacy">فتح سجل المعالجة</Link>
              <Link href="/data-governance/sharing">فتح طلبات المشاركة</Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

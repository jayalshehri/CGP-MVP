"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading } from "@/components/WorkflowUI";
import "./data-governance.css";

const policies = [
  "سياسة تصنيف البيانات",
  "سياسة حماية البيانات الشخصية",
  "سياسة مشاركة البيانات",
  "سياسة حرية المعلومات",
  "سياسة البيانات المفتوحة",
  "سياسة حماية بيانات الأطفال ومن في حكمهم",
  "قواعد نقل البيانات الشخصية خارج المملكة",
];

export default function DataGovernancePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [metrics, setMetrics] = useState<{ requests: number | null; assets: number | null } | null>(null);

  useEffect(() => {
    let active = true;
    requireProfile(["admin", "data_governance_team"])
      .then(async () => {
        if (!active) return;
        setReady(true);
        try {
          const [requests, assets] = await Promise.all([
            supabase.from("data_governance_requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "steward_review", "governance_review", "returned"]),
            supabase.from("data_assets").select("id", { count: "exact", head: true }),
          ]);
          if (active) setMetrics({
            requests: requests.error ? null : requests.count,
            assets: assets.error ? null : assets.count,
          });
        } catch {
          if (active) setMetrics({ requests: null, assets: null });
        }
      })
      .catch((error: Error) => {
        if (error.message.includes("تسجيل الدخول")) router.replace("/login");
        else if (active) setAccessError(error.message || "تعذر التحقق من صلاحيات الحساب.");
      });
    return () => { active = false; };
  }, [router]);

  if (accessError) return <main className="dg-page"><div role="alert" className="dg-loading"><h1>تعذر فتح مكتب إدارة البيانات</h1><p>{accessError}</p><p>تأكد من أن دور حسابك في قاعدة البيانات هو مدير النظام أو فريق إدارة البيانات، ثم أعد تسجيل الدخول.</p></div></main>;
  if (!ready) return <main className="dg-page"><p className="dg-loading" role="status">جاري فتح مساحة إدارة البيانات والحوكمة…</p></main>;

  const metricText = (value: number | null | undefined) => !metrics ? "…" : value == null ? "غير متاح" : new Intl.NumberFormat("ar-SA").format(value);

  return <main className="dg-page">
    <div className="dg-eyebrow">مساحة عمل مستقلة</div>
    <WorkflowHeading
      title="إدارة البيانات والحوكمة"
      description="متابعة المتطلبات والأدلة والطلبات وسجلات إدارة البيانات الوطنية ضمن صلاحيات مكتب إدارة البيانات."
    />

    <section className="dg-hero" aria-label="متابعة برنامج حوكمة البيانات">
      <div>
        <span>برنامج حوكمة البيانات الوطنية</span>
        <h2>تابع متطلبات نُضيء وأدلتها من مساحة عمل واحدة.</h2>
        <p>أسند المتطلبات، راجع الأدلة، وتابع نتائج المؤشر وسجلات إدارة البيانات.</p>
      </div>
      <div className="dg-hero-actions">
        <Link href="/data-governance/nudee">فتح متطلبات نُضيء</Link>
        <Link href="/data-governance/nudee-dashboard">لوحة المؤشر</Link>
        <a href="#framework">استعراض الإطار</a>
      </div>
    </section>

    <section className="dg-metrics" aria-label="ملخص حوكمة البيانات">
      <article><span>الإطار التنظيمي</span><strong>NDMO</strong><small><Link href="/data-governance/controls">فتح سجل الضوابط</Link></small></article>
      <article><span>سياسات الحوكمة</span><strong>7</strong><small>وثائق مرجعية</small></article>
      <article><span>طلبات قيد الإجراء</span><strong role="status">{metricText(metrics?.requests)}</strong><small>{!metrics ? "جاري قراءة السجل…" : metrics.requests == null ? "تعذرت قراءة العدد. " : "تشمل الطلبات المعادة للاستكمال. "}<Link href="/data-governance/requests">فتح الطلبات</Link></small></article>
      <article><span>أصول بيانات مسجلة</span><strong role="status">{metricText(metrics?.assets)}</strong><small>{!metrics ? "جاري قراءة السجل…" : metrics.assets == null ? "تعذرت قراءة العدد. " : "وفق السجلات المتاحة لحسابك. "}<Link href="/data-governance/assets">فتح الأصول</Link></small></article>
    </section>

    <section id="framework" className="dg-section">
      <header>
        <div><span>الإطار</span><h2>ضوابط إدارة البيانات الوطنية</h2><p>نظرة تعريفية على مجالات إدارة البيانات. تتوفر السجلات والتقييمات من القوائم المختصة.</p></div>
        <span className="dg-status">نظرة تعريفية</span>
      </header>
      <div className="dg-framework-grid">
        <article><b>01</b><h3>حوكمة البيانات</h3><p>الأدوار، اللجنة، السياسات، وقياس الالتزام.</p></article>
        <article><b>02</b><h3>إدارة البيانات</h3><p>الجودة، الفهرس، التخزين، النمذجة والبيانات الرئيسية.</p></article>
        <article><b>03</b><h3>إتاحة البيانات</h3><p>المشاركة، البيانات المفتوحة، وحرية المعلومات.</p></article>
        <article><b>04</b><h3>الحماية والخصوصية</h3><p>التصنيف، حماية البيانات الشخصية، والربط مع ECC.</p></article>
      </div>
    </section>

    <section id="workflow" className="dg-section dg-workflow">
      <header>
        <div><span>سير العمل</span><h2>دورة عمل مستقلة لإدارة البيانات</h2><p>المسؤولية تنتقل بوضوح بين ملاك البيانات وفريق الحوكمة.</p></div>
      </header>
      <ol>
        <li><b>1</b><div><strong>مالك البيانات</strong><span>يسجل الأصل أو الطلب ويحدد الغرض والتصنيف.</span></div></li>
        <li><b>2</b><div><strong>أمين البيانات</strong><span>يراجع الجودة والوصف ومصدر البيانات.</span></div></li>
        <li><b>3</b><div><strong>فريق الحوكمة</strong><span>يتحقق من السياسة والمتطلبات التنظيمية.</span></div></li>
        <li><b>4</b><div><strong>مدير إدارة البيانات</strong><span>يعتمد الطلب أو يعيده مع الملاحظات.</span></div></li>
      </ol>
    </section>

    <section className="dg-section">
      <header><div><span>مكتبة السياسات</span><h2>السياسات الوطنية المرجعية</h2><p>قائمة تعريفية بالسياسات المرجعية، ولا تعبّر عن حالة اعتماد سياسات الجهة.</p></div></header>
      <div className="dg-policy-list">{policies.map((policy, index) => <article key={policy}><b>{String(index + 1).padStart(2, "0")}</b><span>{policy}</span><small>مرجع تنظيمي</small></article>)}</div>
    </section>

    <section className="dg-next">
      <div><span>الطلبات والسجلات</span><h2>تابع طلبات إدارة البيانات والإجراءات المطلوبة.</h2><p>تتوفر سجلات الأصول والجودة والخصوصية ومشاركة البيانات من قائمة مساحة العمل.</p></div>
      <Link href="/data-governance/requests">فتح طلبات إدارة البيانات</Link>
    </section>
  </main>;
}

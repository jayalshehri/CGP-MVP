"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
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

  useEffect(() => {
    let active = true;
    requireProfile(["admin", "data_governance_team"])
      .then(() => active && setReady(true))
      .catch((error: Error) => {
        if (error.message.includes("تسجيل الدخول")) router.replace("/login");
        else router.replace("/");
      });
    return () => { active = false; };
  }, [router]);

  if (!ready) return <main className="dg-page"><p className="dg-loading">جاري فتح مساحة إدارة البيانات والحوكمة…</p></main>;

  return <main className="dg-page">
    <div className="dg-eyebrow">مساحة عمل مستقلة</div>
    <WorkflowHeading
      title="إدارة البيانات والحوكمة"
      description="متابعة ضوابط وسياسات إدارة البيانات الوطنية، بعيداً عن سير عمل الأمن السيبراني."
    />

    <section className="dg-hero" aria-label="بدء برنامج حوكمة البيانات">
      <div>
        <span>برنامج حوكمة البيانات الوطنية</span>
        <h2>ابدأ من الهيكل، ثم حوّل المتطلبات إلى عمل قابل للمتابعة.</h2>
        <p>سيكون لكل طلب مالك بيانات وأمين بيانات ومراجع واعتماد مستقل.</p>
      </div>
      <div className="dg-hero-actions">
        <a href="#framework">استعراض الإطار</a>
        <a href="#workflow">سير العمل</a>
      </div>
    </section>

    <section className="dg-metrics" aria-label="ملخص حوكمة البيانات">
      <article><span>الإطار التنظيمي</span><strong>NDMO</strong><small>جاهز للإعداد</small></article>
      <article><span>سياسات الحوكمة</span><strong>7</strong><small>وثائق مرجعية</small></article>
      <article><span>طلبات بانتظار المعالجة</span><strong>0</strong><small>لا توجد طلبات حالياً</small></article>
      <article><span>أصول بيانات مسجلة</span><strong>0</strong><small>تبدأ بعد اعتماد النموذج</small></article>
    </section>

    <section id="framework" className="dg-section">
      <header>
        <div><span>الإطار</span><h2>ضوابط إدارة البيانات الوطنية</h2><p>سيُبنى الإطار تدريجياً ضمن المجالات المعتمدة، مع عدم تكرار ضوابط الأمن السيبراني.</p></div>
        <span className="dg-status">مسودة تأسيسية</span>
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
      <header><div><span>مكتبة السياسات</span><h2>السياسات الوطنية المرجعية</h2><p>تُضاف هنا كمرجع تشريعي؛ ثم ترتبط بالضوابط والطلبات عند تنفيذها.</p></div></header>
      <div className="dg-policy-list">{policies.map((policy, index) => <article key={policy}><b>{String(index + 1).padStart(2, "0")}</b><span>{policy}</span><small>مرجع تنظيمي</small></article>)}</div>
    </section>

    <section className="dg-next">
      <div><span>الخطوة التالية</span><h2>إضافة ضوابط NDMO الفعلية وتعيين مسؤوليها.</h2><p>بعد اعتماد الهيكل سننشئ سجل أصول البيانات وطلبات المشاركة وسجل جودة البيانات.</p></div>
      <Link href="/assets">فتح سجل الأصول التقنية</Link>
    </section>
  </main>;
}

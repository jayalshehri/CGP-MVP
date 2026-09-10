"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import { frameworkOf, isApplicable, isImplemented, isVerified, percentage as percent } from "@/lib/compliance";

type Control = { id: number; domain_ar: string; implementation_status: string; evidence_status: string; verification_status: string; due_date: string | null; frameworks: unknown };

export default function ExecutivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [controls, setControls] = useState<Control[]>([]);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const [sort, setSort] = useState("priority");
  const [framework, setFramework] = useState("all");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await requireProfile(["admin", "cybersecurity_team"]);
        const controlResult = await supabase.from("controls").select("id,domain_ar,implementation_status,evidence_status,verification_status,due_date,frameworks!inner(code,name_ar)");
        if (controlResult.error) throw new Error("تعذر تحديث البيانات. حاول مرة أخرى.");
        if (active) { setControls((controlResult.data ?? []) as Control[]); setUpdated(new Date()); setError(""); }
      } catch (loadError) {
        if (!active) return;
        const message = loadError instanceof Error ? loadError.message : "";
        if (message.includes("تسجيل الدخول")) { router.replace("/login"); return; }
        if (message.includes("الصلاحية") || message.includes("غير نشط")) { router.replace("/"); return; }
        setError("تعذر تحميل الملخص التنفيذي. تحقق من الاتصال وأعد المحاولة.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [router, revision]);

  const frameworks = useMemo(() => [...new Map(controls.map(c => { const f = frameworkOf(c.frameworks); return [f.code, f]; })).values()].sort((a,b)=>a.code.localeCompare(b.code)), [controls]);
  const scopedControls = useMemo(() => controls.filter(c => framework === "all" || frameworkOf(c.frameworks).code === framework), [controls, framework]);
  const summary = useMemo(() => {
    const today = (updated ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    const domains = new Map<string, { name: string; total: number; done: number; verified: number; overdue: number }>();
    let done = 0, checked = 0, overdue = 0, inProgress = 0;
    for (const c of scopedControls) {
      if (!isApplicable(c.implementation_status)) continue;
      const complete = isImplemented(c.implementation_status); const checkedControl = isVerified(c.verification_status); const late = Boolean(c.due_date && c.due_date < today && !complete);
      if (complete) done++; else if (c.implementation_status === "in_progress") inProgress++; if (checkedControl) checked++; if (late) overdue++;
      const name = c.domain_ar || "غير مصنف"; const domain = domains.get(name) ?? { name, total: 0, done: 0, verified: 0, overdue: 0 };
      domain.total++; domain.done += Number(complete); domain.verified += Number(checkedControl); domain.overdue += Number(late); domains.set(name, domain);
    }
    const total=[...domains.values()].reduce((sum,d)=>sum+d.total,0);
    return { total, done, checked, overdue, inProgress, remaining: total - done - inProgress, domains: [...domains.values()] };
  }, [scopedControls, updated]);
  const domains = [...summary.domains].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "ar") : b.overdue - a.overdue || a.done / a.total - b.done / b.total);
  const refresh = () => { setLoading(true); setRevision(value => value + 1); };
  const compliance = percent(summary.done, summary.total); const verification = percent(summary.checked, summary.total);
  const pending = scopedControls.filter(c=>["pending_review","under_review"].includes((c.evidence_status||"").toLowerCase())).length;

  return <main dir="rtl" className="exec-page" aria-busy={loading}>
    <header className="exec-heading">
      <div><span className="exec-eyebrow">ملخص الإدارة</span><h1>اللوحة التنفيذية</h1><p>صورة واضحة للتنفيذ والتحقق، والأولويات التي تحتاج قرارًا.</p></div>
      <div className="exec-tools cgp-print-action"><button onClick={refresh} disabled={loading} aria-label="تحديث بيانات اللوحة">↻ <span>{loading ? "جاري التحديث…" : "تحديث"}</span></button><details className="exec-more"><summary aria-label="إجراءات إضافية">•••</summary><button onClick={() => window.print()} disabled={!updated || loading || Boolean(error)}>طباعة الملخص</button></details></div>
    </header>
    <div className="exec-dateline"><label className="exec-sort">نطاق الإطار<select value={framework} onChange={event=>setFramework(event.target.value)}><option value="all">جميع الأطر</option>{frameworks.map(item=><option key={item.code} value={item.code}>{item.code} — {item.name_ar}</option>)}</select></label><span>{updated ? `آخر تحديث: ${updated.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}` : "جاري جلب البيانات"}</span></div>
    {error ? <section className="exec-panel exec-empty" role="alert"><h2>تعذر عرض البيانات</h2><p>{error}</p><button onClick={refresh}>إعادة المحاولة</button></section> : loading ? <section className="exec-panel exec-empty" role="status">جاري إعداد الملخص التنفيذي…</section> : summary.total === 0 ? <section className="exec-panel exec-empty"><h2>يبدأ الملخص بإضافة الضوابط</h2><p>ستظهر نسب التنفيذ والتحقق والأولويات عند توفر بيانات ضمن نطاقك.</p><Link href="/controls">فتح الضوابط ←</Link></section> : <>
      <section className="exec-overview" aria-label="المؤشرات الرئيسية"><div className="exec-spotlight"><span className="exec-eyebrow">نسبة التنفيذ</span><div className="exec-score">{compliance}<span>%</span></div><p><strong>{summary.done}</strong> من أصل <strong>{summary.total}</strong> ضابط منطبق ومطبق كليًا</p><Meter value={compliance} label="نسبة التنفيذ"/><div className="exec-spotlight-footer">لا تدخل الضوابط المصنفة «لا ينطبق» في مقام نسبة الالتزام.</div></div><div className="exec-metrics"><Metric label="نسبة التحقق" value={`${verification}%`} note={`${summary.checked} من ${summary.total} ضابط تم التحقق منها`} href={`/controls${framework!=="all"?`?framework=${framework}`:""}`}/><Metric label="ضوابط متأخرة" value={summary.overdue} note={summary.overdue ? "تجاوزت موعدها ولم يكتمل تنفيذها" : "لا توجد متأخرات حاليًا"} href={`/tasks?filter=overdue${framework!=="all"?`&framework=${framework}`:""}`} tone={summary.overdue ? "danger" : "neutral"}/><Metric label="أدلة تنتظر القرار" value={pending} note="الإرسالات الحالية بانتظار المراجعة" href="/review" tone={pending ? "warning" : "neutral"}/></div></section>
      <section className="exec-panel exec-priorities"><div><span className="exec-eyebrow">ما الذي يحتاج متابعة؟</span><h2>أولويات الإدارة</h2></div><div className="exec-priority-list"><Link href="/tasks?filter=overdue"><span className={`exec-count ${summary.overdue ? "exec-danger" : ""}`}>{summary.overdue}</span><span><strong>{summary.overdue ? "متابعة المتأخرات مع الملاك" : "المواعيد تحت المتابعة"}</strong><small>{summary.overdue ? "راجع التكليفات وحدد الخطوة التالية لكل ضابط." : "لا توجد ضوابط غير مكتملة تجاوزت موعدها."}</small></span><span aria-hidden="true">←</span></Link><Link href="/review"><span className={`exec-count ${pending ? "exec-warning" : ""}`}>{pending}</span><span><strong>{pending ? "اتخاذ قرار بشأن الأدلة" : "قائمة المراجعة خالية"}</strong><small>{pending ? "افتح الأدلة المعلقة للقبول أو الإرجاع مع الملاحظات." : "لا توجد إرسالات حالية تنتظر المراجعة."}</small></span><span aria-hidden="true">←</span></Link></div></section>
      <section className="exec-panel exec-report-bridge"><div><span className="exec-eyebrow">التحليل والتقارير</span><h2>القرار هنا، والتحليل في التقارير</h2><p>استخدم هذه اللوحة لتحديد ما يحتاج تدخلاً. تعرض التقارير المقارنات حسب الإطار والمجال والرسوم التفصيلية.</p></div><Link className="exec-text-link" href="/reports">فتح تقارير الالتزام ←</Link></section>
    </>}
  </main>;
}
function Meter({value,label,blue=false}:{value:number;label:string;blue?:boolean}) { return <progress className={blue ? "exec-meter blue" : "exec-meter"} value={value} max={100} aria-label={label}>{value}%</progress>; }
function Metric({label,value,note,href,tone="neutral"}:{label:string;value:string|number;note:string;href:string;tone?:string}) { return <Link className={`exec-metric exec-${tone}`} href={href}><span>{label}</span><strong>{value}</strong><small>{note}</small><span className="exec-metric-arrow">فتح التفاصيل ←</span></Link>; }

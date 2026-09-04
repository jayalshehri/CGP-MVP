"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Control = { id: number; domain_ar: string; implementation_status: string; evidence_status: string; verification_status: string; due_date: string | null };
const implemented = (value: string) => ["implemented", "compliant"].includes(value);
const verified = (value: string) => ["verified", "approved"].includes(value);
const percent = (part: number, total: number) => total ? Math.round(part / total * 100) : 0;

export default function ExecutivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [controls, setControls] = useState<Control[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [revision, setRevision] = useState(0);
  const [sort, setSort] = useState("priority");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) { router.replace("/login"); return; }
        const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("user_id", session.session.user.id).maybeSingle();
        if (!profile?.is_active || !["admin", "cybersecurity_team"].includes(profile.role)) { router.replace("/"); return; }
        const [controlResult, evidenceResult] = await Promise.all([
          supabase.from("controls").select("id,domain_ar,implementation_status,evidence_status,verification_status,due_date"),
          supabase.from("evidence").select("id", { count: "exact", head: true }).eq("is_current", true).in("status", ["pending_review", "under_review"]),
        ]);
        if (controlResult.error || evidenceResult.error) throw new Error("تعذر تحديث البيانات. حاول مرة أخرى.");
        if (active) { setControls(controlResult.data ?? []); setPending(evidenceResult.count ?? 0); setUpdated(new Date()); setError(""); }
      } catch { if (active) setError("تعذر تحميل الملخص التنفيذي. تحقق من الاتصال وأعد المحاولة."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [router, revision]);

  const summary = useMemo(() => {
    const today = (updated ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    const domains = new Map<string, { name: string; total: number; done: number; verified: number; overdue: number }>();
    let done = 0, checked = 0, overdue = 0, inProgress = 0;
    for (const c of controls) {
      const complete = implemented(c.implementation_status);
      const checkedControl = verified(c.verification_status);
      const late = Boolean(c.due_date && c.due_date < today && !complete);
      if (complete) done++;
      else if (c.implementation_status === "in_progress") inProgress++;
      if (checkedControl) checked++;
      if (late) overdue++;
      const name = c.domain_ar || "غير مصنف";
      const domain = domains.get(name) ?? { name, total: 0, done: 0, verified: 0, overdue: 0 };
      domain.total++; domain.done += Number(complete); domain.verified += Number(checkedControl); domain.overdue += Number(late);
      domains.set(name, domain);
    }
    return { total: controls.length, done, checked, overdue, inProgress, remaining: controls.length - done - inProgress, domains: [...domains.values()] };
  }, [controls, updated]);
  const domains = [...summary.domains].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "ar") : b.overdue - a.overdue || a.done / a.total - b.done / b.total);
  const refresh = () => { setLoading(true); setRevision(value => value + 1); };
  const compliance = percent(summary.done, summary.total);
  const verification = percent(summary.checked, summary.total);

  return <main dir="rtl" className="exec-page" aria-busy={loading}>
    <header className="exec-heading">
      <div><span className="exec-eyebrow">ملخص الإدارة</span><h1>اللوحة التنفيذية</h1><p>صورة واضحة للتنفيذ والتحقق، والأولويات التي تحتاج قرارًا.</p></div>
      <div className="exec-tools cgp-print-action"><button onClick={refresh} disabled={loading}>{loading ? "جاري التحديث…" : "تحديث البيانات"}</button><button onClick={() => window.print()} disabled={!updated || loading || Boolean(error)}>طباعة الملخص</button></div>
    </header>
    <div className="exec-dateline"><span>جميع الضوابط ضمن صلاحياتك</span><span>{updated ? `آخر تحديث: ${updated.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}` : "جاري جلب البيانات"}</span></div>
    {error ? <section className="exec-panel exec-empty" role="alert"><h2>تعذر عرض البيانات</h2><p>{error}</p><button onClick={refresh}>إعادة المحاولة</button></section> : loading ? <section className="exec-panel exec-empty" role="status">جاري إعداد الملخص التنفيذي…</section> : summary.total === 0 ? <section className="exec-panel exec-empty"><h2>يبدأ الملخص بإضافة الضوابط</h2><p>ستظهر نسب التنفيذ والتحقق والأولويات عند توفر بيانات ضمن نطاقك.</p><Link href="/controls">فتح الضوابط ←</Link></section> : <>
      <section className="exec-overview" aria-label="المؤشرات الرئيسية">
        <div className="exec-spotlight"><span className="exec-eyebrow">نسبة التنفيذ</span><div className="exec-score">{compliance}<span>%</span></div><p><strong>{summary.done}</strong> من أصل <strong>{summary.total}</strong> ضابط مطبق</p><Meter value={compliance} label="نسبة التنفيذ"/><div className="exec-spotlight-footer">التنفيذ يعكس حالة الضابط؛ التحقق خطوة مستقلة لاعتماد النتيجة.</div></div>
        <div className="exec-metrics"><Metric label="نسبة التحقق" value={`${verification}%`} note={`${summary.checked} من ${summary.total} ضابط تم التحقق منها`} href="/controls"/><Metric label="ضوابط متأخرة" value={summary.overdue} note={summary.overdue ? "تجاوزت موعدها ولم يكتمل تنفيذها" : "لا توجد متأخرات حاليًا"} href="/tasks?filter=overdue" tone={summary.overdue ? "danger" : "neutral"}/><Metric label="أدلة تنتظر القرار" value={pending} note="الإرسالات الحالية بانتظار المراجعة" href="/review" tone={pending ? "warning" : "neutral"}/></div>
      </section>
      <section className="exec-panel exec-priorities"><div><span className="exec-eyebrow">ما الذي يحتاج متابعة؟</span><h2>أولويات الإدارة</h2></div><div className="exec-priority-list"><Link href="/tasks?filter=overdue"><span className={`exec-count ${summary.overdue ? "exec-danger" : ""}`}>{summary.overdue}</span><span><strong>{summary.overdue ? "متابعة المتأخرات مع الملاك" : "المواعيد تحت المتابعة"}</strong><small>{summary.overdue ? "راجع التكليفات وحدد الخطوة التالية لكل ضابط." : "لا توجد ضوابط غير مكتملة تجاوزت موعدها."}</small></span><span aria-hidden="true">←</span></Link><Link href="/review"><span className={`exec-count ${pending ? "exec-warning" : ""}`}>{pending}</span><span><strong>{pending ? "اتخاذ قرار بشأن الأدلة" : "قائمة المراجعة خالية"}</strong><small>{pending ? "افتح الأدلة المعلقة للقبول أو الإرجاع مع الملاحظات." : "لا توجد إرسالات حالية تنتظر المراجعة."}</small></span><span aria-hidden="true">←</span></Link></div></section>
      <div className="exec-detail-grid">
        <section className="exec-panel"><div className="exec-section-heading"><div><h2>التقدم حسب المجال</h2><p>مقارنة التنفيذ بالتحقق داخل كل مجال.</p></div><label className="exec-sort">ترتيب المجالات<select value={sort} onChange={event => setSort(event.target.value)}><option value="priority">المتأخرات ثم الأقل تنفيذًا</option><option value="name">اسم المجال</option></select></label></div><div className="exec-legend"><span><i className="exec-dot teal"/>التنفيذ</span><span><i className="exec-dot blue"/>التحقق</span></div><div>{domains.map(domain => <article key={domain.name} className="exec-domain"><div className="exec-domain-title"><h3>{domain.name}</h3><span>{domain.total} ضابط</span>{domain.overdue > 0 && <span className="exec-late">{domain.overdue} متأخر</span>}</div><div className="exec-bar-row"><span>التنفيذ</span><Meter value={percent(domain.done, domain.total)} label={`تنفيذ ${domain.name}`}/><b>{percent(domain.done, domain.total)}%</b></div><div className="exec-bar-row"><span>التحقق</span><Meter value={percent(domain.verified, domain.total)} label={`تحقق ${domain.name}`} blue/><b>{percent(domain.verified, domain.total)}%</b></div></article>)}</div></section>
        <section className="exec-panel exec-distribution"><h2>توزيع حالة التنفيذ</h2><p>من أصل {summary.total} ضابط في النطاق الحالي</p><div className="exec-stack" aria-hidden="true"><span style={{flex:summary.done,background:"#0f756d"}}/><span style={{flex:summary.inProgress,background:"#bb8424"}}/><span style={{flex:summary.remaining,background:"#bac6ce"}}/></div>{[{label:"مطبق",count:summary.done,color:"teal"},{label:"قيد التنفيذ",count:summary.inProgress,color:"amber"},{label:"حالات أخرى / لم يبدأ",count:summary.remaining,color:"gray"}].map(item => <div className="exec-distribution-row" key={item.label}><span><i className={`exec-dot ${item.color}`}/>{item.label}</span><strong>{item.count}</strong></div>)}<Link className="exec-text-link" href="/controls">استعراض الضوابط ←</Link><div className="exec-definition"><h3>كيف تُقرأ الأرقام؟</h3><p>النسب محسوبة من جميع الضوابط الظاهرة لحسابك. المتأخرات تعتمد على موعد الاستحقاق بتوقيت الرياض، والأدلة المعلقة تشمل الإرسال الحالي فقط.</p></div></section>
      </div>
    </>}
  </main>;
}
function Meter({value,label,blue=false}:{value:number;label:string;blue?:boolean}) { return <progress className={blue ? "exec-meter blue" : "exec-meter"} value={value} max={100} aria-label={label}>{value}%</progress>; }
function Metric({label,value,note,href,tone="neutral"}:{label:string;value:string|number;note:string;href:string;tone?:string}) { return <Link className={`exec-metric exec-${tone}`} href={href}><span>{label}</span><strong>{value}</strong><small>{note}</small><span className="exec-metric-arrow" aria-hidden="true">←</span></Link>; }

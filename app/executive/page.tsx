"use client";

import Link from "next/link";
import "./executive.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";

type Control = { id: number; domain_ar: string; implementation_status: string; evidence_status: string; verification_status: string; due_date: string | null; control_owner_id: string | null };
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
        await requireProfile(["admin", "cybersecurity_team"]);
        const [controlResult, evidenceResult] = await Promise.all([
          supabase.from("controls").select("id,domain_ar,implementation_status,evidence_status,verification_status,due_date,control_owner_id"),
          supabase.from("evidence").select("id", { count: "exact", head: true }).eq("is_current", true).in("status", ["pending_review", "under_review"]),
        ]);
        if (controlResult.error || evidenceResult.error) throw new Error("تعذر تحديث البيانات. حاول مرة أخرى.");
        if (active) { setControls(controlResult.data ?? []); setPending(evidenceResult.count ?? 0); setUpdated(new Date()); setError(""); }
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

  const summary = useMemo(() => {
    const today = (updated ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    const domains = new Map<string, { name: string; total: number; done: number; verified: number; overdue: number }>();
    let done = 0, checked = 0, overdue = 0, inProgress = 0, unassigned = 0;
    for (const c of controls) {
      if (c.control_owner_id === null) unassigned++;
      const complete = implemented(c.implementation_status); const checkedControl = verified(c.verification_status); const late = Boolean(c.due_date && c.due_date < today && !complete);
      if (complete) done++; else if (c.implementation_status === "in_progress") inProgress++; if (checkedControl) checked++; if (late) overdue++;
      const name = c.domain_ar || "غير مصنف"; const domain = domains.get(name) ?? { name, total: 0, done: 0, verified: 0, overdue: 0 };
      domain.total++; domain.done += Number(complete); domain.verified += Number(checkedControl); domain.overdue += Number(late); domains.set(name, domain);
    }
    return { total: controls.length, unassigned, done, checked, overdue, inProgress, remaining: controls.length - done - inProgress, domains: [...domains.values()] };
  }, [controls, updated]);
  const domains = [...summary.domains].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "ar") : b.overdue - a.overdue || a.done / a.total - b.done / b.total);
  const refresh = () => { setLoading(true); setRevision(value => value + 1); };
  const compliance = percent(summary.done, summary.total); const verification = percent(summary.checked, summary.total);

  return <main dir="rtl" className="exec-page" aria-busy={loading}>
    <header className="exec-heading">
      <div><span className="exec-eyebrow">ملخص الإدارة</span><h1>اللوحة التنفيذية</h1><p>صورة واضحة للتنفيذ والتحقق، والأولويات التي تحتاج قرارًا.</p></div>
      <div className="exec-tools cgp-print-action"><button onClick={refresh} disabled={loading} aria-label="تحديث بيانات اللوحة">↻ <span>{loading ? "جاري التحديث…" : "تحديث"}</span></button><details className="exec-more"><summary aria-label="إجراءات إضافية">•••</summary><button onClick={() => window.print()} disabled={!updated || loading || Boolean(error)}>طباعة الملخص</button></details></div>
    </header>
    <div className="exec-dateline"><span>جميع الضوابط ضمن صلاحياتك</span><span>{updated ? `آخر تحديث: ${updated.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}` : "جاري جلب البيانات"}</span></div>
    {error ? <section className="exec-panel exec-empty" role="alert"><h2>تعذر عرض البيانات</h2><p>{error}</p><button onClick={refresh}>إعادة المحاولة</button></section> : loading ? <section className="exec-panel exec-empty" role="status">جاري إعداد الملخص التنفيذي…</section> : summary.total === 0 ? <section className="exec-panel exec-empty"><h2>يبدأ الملخص بإضافة الضوابط</h2><p>ستظهر نسب التنفيذ والتحقق والأولويات عند توفر بيانات ضمن نطاقك.</p><Link href="/controls">فتح الضوابط ←</Link></section> : <>
      <section className="exec-overview" aria-label="المؤشرات الرئيسية"><div className="exec-spotlight"><span className="exec-eyebrow">نسبة التنفيذ</span><div className="exec-score">{compliance}<span>%</span></div><p><strong>{summary.done}</strong> من أصل <strong>{summary.total}</strong> ضابط مطبق</p><Meter value={compliance} label="نسبة التنفيذ"/><div className="exec-spotlight-footer">التنفيذ يعكس حالة الضابط؛ التحقق خطوة مستقلة لاعتماد النتيجة.</div></div><div className="exec-metrics"><Metric label="نسبة التحقق" value={`${verification}%`} note={`${summary.checked} من ${summary.total} ضابط تم التحقق منها`} href="/controls"/><Metric label="ضوابط متأخرة" value={summary.overdue} note={summary.overdue ? "تجاوزت موعدها ولم يكتمل تنفيذها" : "لا توجد متأخرات حاليًا"} href="/tasks?filter=overdue" tone={summary.overdue ? "danger" : "neutral"}/><Metric label="أدلة تنتظر القرار" value={pending} note="الإرسالات الحالية بانتظار المراجعة" href="/review" tone={pending ? "warning" : "neutral"}/></div></section>
      <section className="exec-panel exec-priorities"><div><span className="exec-eyebrow">المتابعة والإجراءات</span><h2>يحتاج انتباهك</h2></div><div className="exec-priority-list"><Link href="/controls?assignment=unassigned"><span className={`exec-count ${summary.unassigned ? "exec-warning" : ""}`}>{summary.unassigned}</span><span><strong>ضوابط غير مسندة</strong><small>{summary.unassigned ? "تحتاج تعيين مالك مسؤول عن التنفيذ." : "جميع الضوابط مسندة إلى ملاك."}</small></span><span aria-hidden="true">←</span></Link><Link href="/tasks?filter=overdue"><span className={`exec-count ${summary.overdue ? "exec-danger" : ""}`}>{summary.overdue}</span><span><strong>{summary.overdue ? "متابعة المتأخرات مع الملاك" : "المواعيد تحت المتابعة"}</strong><small>{summary.overdue ? "راجع التكليفات وحدد الخطوة التالية لكل ضابط." : "لا توجد ضوابط غير مكتملة تجاوزت موعدها."}</small></span><span aria-hidden="true">←</span></Link><Link href="/review"><span className={`exec-count ${pending ? "exec-warning" : ""}`}>{pending}</span><span><strong>{pending ? "اتخاذ قرار بشأن الأدلة" : "قائمة المراجعة خالية"}</strong><small>{pending ? "افتح الأدلة المعلقة للقبول أو الإرجاع مع الملاحظات." : "لا توجد إرسالات حالية تنتظر المراجعة."}</small></span><span aria-hidden="true">←</span></Link></div></section>
      <div className="exec-detail-grid"><section className="exec-panel"><div className="exec-section-heading"><div><h2>التقدم حسب المجال</h2><p>مقارنة التنفيذ بالتحقق داخل كل مجال.</p></div><label className="exec-sort">ترتيب المجالات<select value={sort} onChange={event => setSort(event.target.value)}><option value="priority">المتأخرات ثم الأقل تنفيذًا</option><option value="name">اسم المجال</option></select></label></div><div className="exec-legend"><span><i className="exec-dot teal"/>التنفيذ</span><span><i className="exec-dot blue"/>التحقق</span></div><div>{domains.map(domain => <article key={domain.name} className="exec-domain"><div className="exec-domain-title"><h3>{domain.name}</h3><span>{domain.total} ضابط</span>{domain.overdue > 0 && <span className="exec-late">{domain.overdue} متأخر</span>}</div><div className="exec-bar-row"><span>التنفيذ</span><Meter value={percent(domain.done, domain.total)} label={`تنفيذ ${domain.name}`}/><b>{percent(domain.done, domain.total)}%</b></div><div className="exec-bar-row"><span>التحقق</span><Meter value={percent(domain.verified, domain.total)} label={`تحقق ${domain.name}`} blue/><b>{percent(domain.verified, domain.total)}%</b></div></article>)}</div></section>
      <section className="exec-panel exec-distribution"><h2>توزيع حالة التنفيذ</h2><p>من أصل {summary.total} ضابط في النطاق الحالي</p><DistributionChart total={summary.total} done={summary.done} inProgress={summary.inProgress} remaining={summary.remaining}/><Link className="exec-text-link" href="/controls">استعراض الضوابط ←</Link><div className="exec-definition"><h3>كيف تُقرأ الأرقام؟</h3><p>النسب محسوبة من جميع الضوابط الظاهرة لحسابك. المتأخرات تعتمد على موعد الاستحقاق بتوقيت الرياض، والأدلة المعلقة تشمل الإرسال الحالي فقط.</p></div></section></div>
    </>}
  </main>;
}
function Meter({value,label,blue=false}:{value:number;label:string;blue?:boolean}) { return <progress className={blue ? "exec-meter blue" : "exec-meter"} value={value} max={100} aria-label={label}>{value}%</progress>; }
function Metric({label,value,note,href,tone="neutral"}:{label:string;value:string|number;note:string;href:string;tone?:string}) { return <Link className={`exec-metric exec-${tone}`} href={href}><span>{label}</span><strong>{value}</strong><small>{note}</small><span className="exec-metric-arrow">فتح التفاصيل ←</span></Link>; }

function DistributionChart({total,done,inProgress,remaining}:{total:number;done:number;inProgress:number;remaining:number}) {
  const segments = [
    {label:"مطبق",count:done,color:"#0f756d",status:"implemented",start:0},
    {label:"قيد التنفيذ",count:inProgress,color:"#bb8424",status:"in_progress",start:done},
    {label:"حالات أخرى / لم يبدأ",count:remaining,color:"#bac6ce",status:"remaining",start:done+inProgress},
  ];
  return <>
    <div className="exec-donut">
      <svg viewBox="0 0 200 200" aria-label="توزيع الضوابط حسب حالة التنفيذ">
        <circle cx="100" cy="100" r="76" fill="none" stroke="#edf2f4" strokeWidth="22"/>
        {segments.filter(item=>item.count>0).map(item=><a key={item.status} href={`/controls?status=${item.status}`} aria-label={`${item.label}: ${item.count} ضابط، عرض التفاصيل`}>
          <title>{`${item.label}: ${item.count} ضابط (${percent(item.count,total)}%)`}</title>
          <circle cx="100" cy="100" r="76" fill="none" stroke={item.color} strokeWidth="22" pathLength="100" strokeDasharray={`${item.count/total*100} 100`} strokeDashoffset={-item.start/total*100} transform="rotate(-90 100 100)"/>
        </a>)}
      </svg>
      <div className="exec-donut-center"><strong>{total}</strong><span>إجمالي الضوابط</span></div>
    </div>
    <p className="exec-chart-hint">اختر حالة لاستعراض ضوابطها</p>
    <div className="exec-chart-legend">{segments.map(item=><Link href={`/controls?status=${item.status}`} key={item.status} className="exec-chart-row"><span><i style={{background:item.color}} aria-hidden="true"/>{item.label}</span><span><strong>{item.count}</strong><small>{percent(item.count,total)}%</small><b aria-hidden="true">←</b></span></Link>)}</div>
  </>;
}

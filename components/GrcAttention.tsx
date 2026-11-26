"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type EvidenceRequest, type ReviewCycle, requestLabels, todayRiyadh, formatGrcDate } from "@/lib/grc";

export default function GrcAttention({ controlId, compact = false, variant = "default" }: {
  controlId?: number;
  compact?: boolean;
  variant?: "default" | "summary";
}) {
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [atLimit, setAtLimit] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        let r = supabase.from("evidence_requests").select("*").in("status", ["open", "submitted", "changes_requested", "rejected"]).order("due_date").limit(100);
        let c = supabase.from("control_review_cycles").select("*").eq("status", "open").order("due_date").limit(100);
        if (controlId) { r = r.eq("control_id", controlId); c = c.eq("control_id", controlId); }
        const [rr, cc, active] = await Promise.all([
          r, c, supabase.from("controls").select("id,frameworks!inner(is_active)").eq("frameworks.is_active", true),
        ]);
        if (!live) return;
        setError(rr.error?.message || cc.error?.message || active.error?.message || "");
        const activeIds = new Set((active.data ?? []).map(row => row.id));
        setRequests((rr.data ?? []).filter(row => activeIds.has(row.control_id)));
        setCycles((cc.data ?? []).filter(row => activeIds.has(row.control_id)));
        setAtLimit((rr.data ?? []).length >= 100);
      } catch {
        if (live) setError("تعذر الاتصال بخدمة الأدلة.");
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [controlId]);

  const today = todayRiyadh();
  const overdueCycles = cycles.some(c => c.due_date < today);
  const requestList = requests.slice(0, compact ? 5 : 100).map(r => {
    const overdue = r.due_date < today;
    const links = <>
      <Link className="workflow-button" href={`/controls/${r.control_id}`}>فتح الضابط</Link>
      {["open", "changes_requested", "rejected"].includes(r.status) && <Link className="workflow-button" href={`/controls/${r.control_id}/evidence/new?request=${r.id}`}>تقديم الدليل</Link>}
    </>;
    return <div className={variant === "summary" ? "evidence-request-item" : "control-evidence-item"} key={r.id}>
      <b>طلب #{r.id} · {r.requirement}</b>
      <p>{requestLabels[r.status]} · {formatGrcDate(r.due_date)} {overdue && <span className="grc-overdue-badge">متأخر</span>}</p>
      {variant === "summary" ? <div className="evidence-request-actions">{links}</div> : links}
    </div>;
  });

  if (variant === "summary") return <section className="evidence-requests" aria-label="طلبات الأدلة">
    <div className="evidence-requests-line">
      {loading ? <span role="status">جاري التحقق من طلبات الأدلة…</span>
      : error ? <span role="alert">تعذر تحميل ملخص الطلبات.</span>
      : requests.length ? <details>
        <summary>طلبات الأدلة المفتوحة <strong>{requests.length}</strong>{atLimit && <small>ضمن أول 100 طلب</small>}</summary>
        <div className="evidence-requests-list">{requestList}</div>
      </details>
      : <span>طلبات الأدلة <span className="evidence-requests-empty">{atLimit ? "لا توجد طلبات في النتائج المعروضة." : "لا توجد طلبات مفتوحة"}</span></span>}
      {!loading && !error && overdueCycles && <Link className="evidence-overdue-link" href="/audit-schedule">دورات مراجعة متأخرة ←</Link>}
    </div>
  </section>;

  if (error) return <p role="alert">تعذر تحميل تنبيهات المراجعة: {error}</p>;
  return <section className="workflow-card">
    <h2>طلبات الأدلة والمراجعات المطلوبة</h2>
    <p>تنبيهات داخل المنصة محسوبة من المواعيد الحالية ضمن صلاحياتك. يعرض أول 100 طلب حسب الموعد.</p>
    {overdueCycles && <p className="grc-warning">توجد دورات مراجعة متأخرة. <Link href="/audit-schedule">فتح جدول المراجعات</Link></p>}
    {!requests.length ? <p>لا توجد طلبات مفتوحة ضمن نطاقك.</p> : requestList}
    {compact && requests.length > 5 && <Link href="/evidence">عرض بقية طلبات الأدلة ←</Link>}
  </section>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Feedback = { id: number; created_at: string; created_by: string; category: string; message: string; page_path: string; control_id: number | null; priority: string; status: string };
const categoryLabels: Record<string, string> = { suggestion: "اقتراح", bug: "خطأ أو مشكلة", question: "استفسار" };
const statusLabels: Record<string, string> = { new: "جديدة", reviewing: "قيد المراجعة", resolved: "تمت المعالجة" };

export default function FeedbackPage() {
  const router = useRouter();
  const [items, setItems] = useState<Feedback[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const visibleItems = useMemo(() => items.filter((item) =>
    (statusFilter === "all" || item.status === statusFilter) &&
    (categoryFilter === "all" || item.category === categoryFilter)
  ), [items, statusFilter, categoryFilter]);

  async function load() {
    try {
      await requireProfile(["admin"]);
      const { data, error: loadError } = await supabase.from("feedback").select("id,created_at,created_by,category,message,page_path,control_id,priority,status").order("created_at", { ascending: false });
      if (loadError) throw loadError;
      const feedback = (data ?? []) as Feedback[];
      setItems(feedback);
      const ids = [...new Set(feedback.map((item) => item.created_by))];
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("user_id,display_name").in("user_id", ids);
        setNames(Object.fromEntries((profiles ?? []).map((profile) => [profile.user_id, profile.display_name || "حساب المستخدم"])));
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "تعذر تحميل الملاحظات.";
      if (message.includes("تسجيل الدخول")) router.replace("/login"); else if (message.includes("الصلاحية")) router.replace("/"); else setError(message);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
    // load only needs to run once when the admin page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(id: number, status: string) {
    const { error: updateError } = await supabase.from("feedback").update({ status }).eq("id", id);
    if (updateError) { setError("تعذر تحديث حالة الملاحظة."); return; }
    setItems((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  }

  return <main className="workflow-page">
    <header className="workflow-heading"><div><span>مرحلة التحقق</span><h1>صندوق نتائج الاختبارات</h1><p>سجل مركزي لنتائج اختبار المنصة، والمشكلات، والمقترحات، وما تم اتخاذه بشأنها.</p></div><button type="button" className="workflow-button" onClick={() => { setLoading(true); load(); }}>تحديث</button></header>
    {error && <p className="cgp-shell-error" role="alert">{error}</p>}
    <div className="workflow-metrics"><div className="workflow-metric"><span>إجمالي النتائج</span><strong>{items.length}</strong></div><div className="workflow-metric"><span>جديدة</span><strong>{items.filter(item => item.status === "new").length}</strong></div><div className="workflow-metric"><span>قيد المراجعة</span><strong>{items.filter(item => item.status === "reviewing").length}</strong></div><div className="workflow-metric"><span>تمت المعالجة</span><strong>{items.filter(item => item.status === "resolved").length}</strong></div></div>
    <div className="workflow-filter workflow-filter-grid"><div><label className="cgp-field-label" htmlFor="result-status">حالة النتيجة</label><select id="result-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">جميع الحالات</option><option value="new">جديدة</option><option value="reviewing">قيد المراجعة</option><option value="resolved">تمت المعالجة</option></select></div><div><label className="cgp-field-label" htmlFor="result-category">نوع النتيجة</label><select id="result-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">جميع الأنواع</option><option value="bug">خطأ أو مشكلة</option><option value="suggestion">اقتراح</option><option value="question">استفسار</option></select></div></div>
    {loading ? <div className="workflow-empty">جاري تحميل النتائج…</div> : items.length === 0 ? <div className="workflow-empty">صندوق النتائج فارغ. ستظهر هنا نتائج المختبرين عند إرسالها من زر «ملاحظات الاختبار».</div> : visibleItems.length === 0 ? <div className="workflow-empty">لا توجد نتائج مطابقة للتصفية الحالية.</div> : <div className="cgp-feedback-list">
      {visibleItems.map((item) => <article key={item.id} className="cgp-feedback-card">
        <div className="cgp-feedback-card-top"><div><span className="cgp-feedback-card-type">{categoryLabels[item.category] ?? item.category}</span><h2>{names[item.created_by] ?? "حساب المستخدم"}</h2></div><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}</time></div>
        <p className="cgp-feedback-card-message">{item.message}</p>
        <div className="cgp-feedback-card-meta"><span>الصفحة: <code dir="ltr">{item.page_path}</code></span>{item.control_id && <span>الضابط: {item.control_id}</span>}<span>الأولوية: {item.priority === "high" ? "عالية" : item.priority === "low" ? "منخفضة" : "عادية"}</span></div>
        <div className="cgp-feedback-card-actions"><label htmlFor={`feedback-status-${item.id}`}>الحالة</label><select id={`feedback-status-${item.id}`} value={item.status} onChange={(event) => updateStatus(item.id, event.target.value)}><option value="new">{statusLabels.new}</option><option value="reviewing">{statusLabels.reviewing}</option><option value="resolved">{statusLabels.resolved}</option></select></div>
      </article>)}
    </div>}
  </main>;
}

"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";

type Request = {
  id: number; request_code: string; request_type: string; title_ar: string;
  business_owner: string; data_steward: string | null; status: string;
  review_comment: string | null; last_action_at: string | null; created_at: string;
};
type RequestEvent = { id: number; request_id: number; from_status: string | null; to_status: string; event_type: string; comment: string | null; created_at: string };

const types: Record<string, string> = {
  data_sharing: "مشاركة بيانات", data_classification: "تصنيف بيانات", data_quality: "جودة بيانات",
  personal_data: "حماية بيانات شخصية", open_data: "بيانات مفتوحة", information_access: "طلب معلومات"
};
const statuses: Record<string, string> = {
  draft: "مسودة", submitted: "مقدم", steward_review: "مراجعة أمين البيانات", governance_review: "مراجعة الحوكمة",
  approved: "معتمد", returned: "معاد للاستكمال", rejected: "مرفوض"
};
const eventLabels: Record<string, string> = {
  submitted: "تم تقديم الطلب", steward_review_started: "بدأت مراجعة أمين البيانات", governance_review_started: "أحيل إلى فريق الحوكمة",
  approved: "تم الاعتماد", returned_for_completion: "أعيد للاستكمال", rejected: "تم الرفض", resubmitted: "أعيد تقديم الطلب"
};
const actions: Record<string, { label: string; target: string; tone?: "danger" | "secondary" }[]> = {
  submitted: [{ label: "بدء مراجعة أمين البيانات", target: "steward_review" }],
  steward_review: [{ label: "إحالة إلى الحوكمة", target: "governance_review" }, { label: "إعادة للاستكمال", target: "returned", tone: "secondary" }],
  governance_review: [{ label: "اعتماد الطلب", target: "approved" }, { label: "إعادة للاستكمال", target: "returned", tone: "secondary" }, { label: "رفض الطلب", target: "rejected", tone: "danger" }],
  returned: [{ label: "إعادة تقديم الطلب", target: "submitted" }]
};

export default function DataRequestsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Request[]>([]);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [comment, setComment] = useState<Record<number, string>>({});
  const [processing, setProcessing] = useState<number | null>(null);
  const [form, setForm] = useState({ request_type: "data_sharing", title_ar: "", description: "", business_owner: "", data_steward: "" });

  async function load() {
    const [requestsResult, eventsResult] = await Promise.all([
      supabase.from("data_governance_requests").select("id,request_code,request_type,title_ar,business_owner,data_steward,status,review_comment,last_action_at,created_at").order("created_at", { ascending: false }),
      supabase.from("data_governance_request_events").select("id,request_id,from_status,to_status,event_type,comment,created_at").order("created_at", { ascending: false })
    ]);
    if (requestsResult.error) throw requestsResult.error;
    if (eventsResult.error) throw eventsResult.error;
    setRows((requestsResult.data ?? []) as Request[]);
    setEvents((eventsResult.data ?? []) as RequestEvent[]);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try { await requireProfile(["admin", "data_governance_team"]); if (active) await load(); }
      catch (e) { router.replace(e instanceof Error && e.message.includes("تسجيل الدخول") ? "/login" : "/"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    const { error: insertError } = await supabase.from("data_governance_requests").insert({ request_code: "DG-" + Date.now(), ...form, status: "submitted" });
    if (insertError) { setError("تعذر حفظ الطلب. تأكد من الحقول ثم أعد المحاولة."); setSaving(false); return; }
    setForm({ request_type: "data_sharing", title_ar: "", description: "", business_owner: "", data_steward: "" });
    setShow(false); await load(); setSaving(false);
  }

  async function transition(requestId: number, target: string) {
    setProcessing(requestId); setError("");
    const { error: transitionError } = await supabase.rpc("transition_data_governance_request", { p_request_id: requestId, p_target_status: target, p_comment: comment[requestId]?.trim() || null });
    if (transitionError) setError(transitionError.message.includes("منشئ الطلب") ? transitionError.message : "تعذر تنفيذ الاعتماد. أعد المحاولة أو تحقق من صلاحيتك.");
    else { setComment((current) => ({ ...current, [requestId]: "" })); await load(); }
    setProcessing(null);
  }

  return <main className="dg-page" dir="rtl">
    <div className="workflow-heading"><div><span>سير عمل مضبوط</span><h1>طلبات إدارة البيانات</h1><p>كل انتقال موثق زمنياً. يعتمد القرار النهائي مراجع مستقل عن منشئ الطلب.</p></div><button className="workflow-button workflow-primary" onClick={() => setShow(v => !v)}>+ طلب جديد</button></div>
    <section className="workflow-steps" aria-label="مراحل اعتماد الطلب"><span>1. مقدم</span><span>2. أمين البيانات</span><span>3. فريق الحوكمة</span><span>4. اعتماد أو إعادة</span></section>
    {show && <form className="asset-form" onSubmit={submit}><header><h2>تسجيل طلب إدارة بيانات</h2><button type="button" onClick={() => setShow(false)} aria-label="إغلاق">×</button></header><div className="asset-fields"><label>نوع الطلب<select value={form.request_type} onChange={e => setForm({ ...form, request_type: e.target.value })}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>مالك البيانات<input required value={form.business_owner} onChange={e => setForm({ ...form, business_owner: e.target.value })} /></label><label>أمين البيانات<input value={form.data_steward} onChange={e => setForm({ ...form, data_steward: e.target.value })} /></label><label className="wide">عنوان الطلب<input required minLength={3} value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} /></label><label className="wide">الوصف<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label></div><footer><button disabled={saving} className="workflow-button workflow-primary">{saving ? "جاري الحفظ…" : "إرسال للمراجعة"}</button></footer></form>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <section className="assets-table-wrap"><table className="assets-table"><thead><tr><th>الطلب</th><th>النوع</th><th>مالك البيانات</th><th>الحالة</th><th aria-label="إجراءات" /></tr></thead><tbody>{loading ? <tr><td colSpan={5}>جاري التحميل…</td></tr> : rows.length ? rows.map(row => <Fragment key={row.id}><tr><td><strong>{row.title_ar}</strong><small dir="ltr">{row.request_code}</small></td><td>{types[row.request_type]}</td><td>{row.business_owner}</td><td><span className={`workflow-status status-${row.status}`}>{statuses[row.status]}</span></td><td><button className="workflow-link" onClick={() => setExpanded(expanded === row.id ? null : row.id)} aria-expanded={expanded === row.id}>{expanded === row.id ? "إخفاء" : "فتح الاعتماد"}</button></td></tr>{expanded === row.id && <tr key={`${row.id}-details`} className="workflow-row"><td colSpan={5}><div className="workflow-detail"><div><h3>سجل الاعتماد</h3><ol className="workflow-history">{events.filter(event => event.request_id === row.id).map(event => <li key={event.id}><b>{eventLabels[event.event_type] ?? event.event_type}</b><span>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</span>{event.comment && <p>{event.comment}</p>}</li>)}{!events.some(event => event.request_id === row.id) && <li>لا توجد أحداث مسجلة بعد.</li>}</ol></div>{actions[row.status]?.length ? <div className="workflow-action-panel"><h3>إجراء المرحلة الحالية</h3><label>ملاحظة للمراجع أو لصاحب الطلب<textarea rows={3} maxLength={2000} value={comment[row.id] ?? ""} onChange={e => setComment(current => ({ ...current, [row.id]: e.target.value }))} /></label><div>{actions[row.status].map(action => <button key={action.target} disabled={processing === row.id} className={`workflow-button ${action.tone === "danger" ? "workflow-danger" : action.tone === "secondary" ? "workflow-secondary" : "workflow-primary"}`} onClick={() => transition(row.id, action.target)}>{processing === row.id ? "جاري التنفيذ…" : action.label}</button>)}</div></div> : <div className="workflow-complete"><h3>{row.status === "approved" ? "اكتمل الاعتماد" : "انتهى مسار الطلب"}</h3><p>{row.review_comment || "لا توجد إجراءات إضافية مطلوبة."}</p></div>}</div></td></tr>}</Fragment>) : <tr><td colSpan={5}>لا توجد طلبات حالياً. ابدأ بتسجيل أول طلب.</td></tr>}</tbody></table></section>
  </main>;
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type FeedbackWidgetProps = { pagePath: string; visible: boolean };
const categories = [["suggestion", "اقتراح"], ["bug", "خطأ أو مشكلة"], ["question", "استفسار"]] as const;

export default function FeedbackWidget({ pagePath, visible }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("suggestion");
  const [priority, setPriority] = useState("normal");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const controlId = useMemo(() => /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);
  if (!visible) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage) { setError("اكتب الملاحظة قبل الإرسال."); setState("error"); return; }
    setState("saving"); setError("");
    const connectionError = "تعذر الاتصال بالخدمة. تحقق من اتصالك وحاول مرة أخرى.";
    function fail(message: string) {
      setError(message);
      setState("error");
    }

    try {
      if (navigator.onLine === false) {
        fail(connectionError);
        return;
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (isAuthRetryableFetchError(authError)) {
        fail(connectionError);
        return;
      }
      if (isAuthSessionMissingError(authError) || authError?.status === 401 || (!authError && !auth.user)) {
        fail("انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.");
        return;
      }
      if (authError || !auth.user) {
        fail("تعذر التحقق من جلسة الدخول. حاول مرة أخرى.");
        return;
      }
      const { error: insertError, status } = await supabase.from("feedback").insert({
        created_by: auth.user.id, category, priority, message: cleanMessage,
        page_path: pagePath, control_id: controlId ? Number(controlId) : null,
      });
      if (insertError) {
        fail(status === 0 ? connectionError : "تعذر حفظ الملاحظة. حاول مرة أخرى.");
        return;
      }
      setMessage("");
      setState("success");
    } catch {
      fail(connectionError);
    }
  }

  return <>
    <button type="button" className="cgp-feedback-trigger" onClick={() => { setOpen(true); setState("idle"); setError(""); }} aria-haspopup="dialog"><span aria-hidden="true">✦</span> ملاحظات الاختبار</button>
    {open && <div className="cgp-feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="cgp-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" dir="rtl">
        <div className="cgp-feedback-header"><div><span className="cgp-feedback-eyebrow">تحسين المنصة</span><h2 id="feedback-title">أرسل ملاحظتك</h2></div><button type="button" className="cgp-feedback-close" onClick={() => setOpen(false)} aria-label="إغلاق">×</button></div>
        <p className="cgp-feedback-context">سيتم تسجيل الصفحة الحالية تلقائيًا{controlId ? ` والضابط رقم ${controlId}` : ""} حتى يسهل تتبع الملاحظة.</p>
        {state === "success" ? <div className="cgp-feedback-success" role="status"><strong>تم حفظ الملاحظة</strong><span>شكرًا لمساهمتك في اختبار CGP.</span><button type="button" onClick={() => setOpen(false)}>إغلاق</button></div> : <form onSubmit={submit}>
          <label className="cgp-field-label" htmlFor="feedback-category">نوع الملاحظة</label><select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <label className="cgp-field-label" htmlFor="feedback-priority">الأولوية</label><select id="feedback-priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">عالية</option></select>
          <label className="cgp-field-label" htmlFor="feedback-message">التعليق أو المقترح</label><textarea id="feedback-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} rows={5} placeholder="اكتب ما لاحظته أثناء الاختبار…" required />
          {state === "error" && <p className="cgp-feedback-error" role="alert">{error}</p>}
          <div className="cgp-feedback-actions"><button type="button" className="cgp-feedback-secondary" onClick={() => setOpen(false)}>إلغاء</button><button type="submit" className="cgp-feedback-submit" disabled={state === "saving"}>{state === "saving" ? "جاري الحفظ…" : "إرسال الملاحظة"}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}

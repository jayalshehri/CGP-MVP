"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import "./audit-schedule.css";

type Frequency = "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
type Control = {
  id: number; control_code: string; title_ar: string; domain_ar: string; audit_frequency: Frequency | null;
  last_audit_date: string | null; next_audit_date: string | null; implementation_status: string;
  frameworks: { code: string; name_ar: string } | null;
};

const frequencyLabels: Record<Frequency, string> = { monthly: "شهري", quarterly: "ربع سنوي", semiannual: "نصف سنوي", annual: "سنوي", custom: "مخصص" };
const dateFormatter = new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" });
const isoToday = () => new Date().toISOString().slice(0, 10);
const addDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const cadenceDate = (last: string, frequency: Frequency) => {
  const date = new Date(`${last}T12:00:00`);
  const months: Record<Frequency, number> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12, custom: 0 };
  if (!months[frequency]) return "";
  date.setMonth(date.getMonth() + months[frequency]);
  return date.toISOString().slice(0, 10);
};
function scheduleState(value: string | null) {
  if (!value) return "unscheduled" as const;
  if (value < isoToday()) return "overdue" as const;
  if (value <= addDays(30)) return "upcoming" as const;
  return "scheduled" as const;
}
const stateLabels = { overdue: "متأخر", upcoming: "خلال 30 يوماً", scheduled: "مجدول", unscheduled: "غير مجدول" };

export default function AuditSchedulePage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [feedback, setFeedback] = useState("");
  const [framework, setFramework] = useState("all"), [frequencyFilter, setFrequencyFilter] = useState("all"), [stateFilter, setStateFilter] = useState("open");
  const [editing, setEditing] = useState<Control | null>(null), [frequency, setFrequency] = useState<Frequency>("annual"), [lastDate, setLastDate] = useState(""), [nextDate, setNextDate] = useState(""), [saving, setSaving] = useState(false);
  const canManage = role === "admin" || role === "cybersecurity_team";

  useEffect(() => { let active = true; (async () => { try {
    const { user, profile } = await requireProfile();
    let query = supabase.from("controls").select("id,control_code,title_ar,domain_ar,audit_frequency,last_audit_date,next_audit_date,implementation_status,frameworks(code,name_ar)").order("next_audit_date", { ascending: true, nullsFirst: true });
    if (profile.role === "control_owner") query = query.eq("control_owner_id", user.id);
    const { data, error } = await query;
    if (error) throw error;
    if (active) { setRole(profile.role); setControls((data ?? []).map(row => ({ ...row, frameworks: Array.isArray(row.frameworks) ? row.frameworks[0] ?? null : row.frameworks })) as unknown as Control[]); }
  } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل جدول التدقيق."); }
  finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, []);

  const frameworks = useMemo(() => [...new Map(controls.filter(c => c.frameworks).map(c => [c.frameworks!.code, c.frameworks!])).values()], [controls]);
  const filtered = useMemo(() => controls.filter(control => {
    const state = scheduleState(control.next_audit_date);
    return (framework === "all" || control.frameworks?.code === framework)
      && (frequencyFilter === "all" || (control.audit_frequency ?? "annual") === frequencyFilter)
      && (stateFilter === "all" || stateFilter === "open" ? ["overdue", "upcoming", "unscheduled"].includes(state) : state === stateFilter);
  }), [controls, framework, frequencyFilter, stateFilter]);
  const counts = useMemo(() => ({ overdue: controls.filter(c => scheduleState(c.next_audit_date) === "overdue").length, upcoming: controls.filter(c => scheduleState(c.next_audit_date) === "upcoming").length, unscheduled: controls.filter(c => scheduleState(c.next_audit_date) === "unscheduled").length }), [controls]);
  function startEdit(control: Control) { setEditing(control); setFrequency(control.audit_frequency ?? "annual"); setLastDate(control.last_audit_date ?? ""); setNextDate(control.next_audit_date ?? ""); setFeedback(""); }
  function updateFrequency(value: Frequency) { setFrequency(value); if (lastDate && value !== "custom") setNextDate(cadenceDate(lastDate, value)); }
  function updateLastDate(value: string) { setLastDate(value); if (value && frequency !== "custom") setNextDate(cadenceDate(value, frequency)); }
  async function saveSchedule() {
    if (!editing || saving) return;
    setSaving(true); setFeedback("");
    const { data, error } = await supabase.from("controls").update({ audit_frequency: frequency, last_audit_date: lastDate || null, next_audit_date: nextDate || null }).eq("id", editing.id).select("audit_frequency,last_audit_date,next_audit_date").single();
    if (error || !data) setFeedback("تعذر حفظ جدول التدقيق. حاول مرة أخرى.");
    else { setControls(previous => previous.map(control => control.id === editing.id ? { ...control, ...data } : control)); setEditing(null); setFeedback("تم حفظ جدول التدقيق الدوري."); }
    setSaving(false);
  }

  if (loading) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل جدول التدقيق الدوري…</main>;
  return <main className="workflow-page audit-schedule-page" dir="rtl">
    <WorkflowHeading title="جدول التدقيق الدوري" description="متابعة مركزية لمواعيد تدقيق الضوابط وفق سياسة التكرار المعتمدة في الجهة." />
    {error && <p className="cgp-shell-error" role="alert">{error}</p>}
    <section className="audit-policy-note"><div><b>سياسة الجدولة</b><p>اضبط التكرار والتواريخ من هذا الجدول. يُحسب الموعد التالي تلقائياً عند اختيار تكرار قياسي، ويمكن تحديده يدوياً للحالات المخصصة.</p></div><span>{canManage ? "تحديث مركزي متاح" : "عرض المواعيد المسندة لك"}</span></section>
    <div className="workflow-metrics"><WorkflowMetric label="متأخر" value={counts.overdue} tone="danger" /><WorkflowMetric label="خلال 30 يوماً" value={counts.upcoming} tone="warning" /><WorkflowMetric label="غير مجدول" value={counts.unscheduled} /><WorkflowMetric label="إجمالي الضوابط" value={controls.length} /></div>
    <section className="audit-filter-bar" aria-label="تصفية جدول التدقيق">
      <label>الإطار<select value={framework} onChange={event => setFramework(event.target.value)}><option value="all">جميع الأطر</option>{frameworks.map(item => <option key={item.code} value={item.code}>{item.code} — {item.name_ar}</option>)}</select></label>
      <label>التكرار<select value={frequencyFilter} onChange={event => setFrequencyFilter(event.target.value)}><option value="all">كل التكرارات</option>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>حالة الموعد<select value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="open">تحتاج متابعة</option><option value="all">كل الحالات</option><option value="overdue">متأخر</option><option value="upcoming">خلال 30 يوماً</option><option value="scheduled">مجدول</option><option value="unscheduled">غير مجدول</option></select></label>
    </section>
    {feedback && <p className="audit-feedback" role="status">{feedback}</p>}
    <section className="audit-table-wrap"><table className="audit-table"><thead><tr><th>الضابط</th><th>الإطار</th><th>التكرار</th><th>آخر تدقيق</th><th>التدقيق القادم</th><th>الحالة</th><th></th></tr></thead><tbody>{filtered.map(control => { const state = scheduleState(control.next_audit_date); return <tr key={control.id}><td><strong dir="ltr">{control.control_code}</strong><span>{control.title_ar}</span></td><td dir="ltr">{control.frameworks?.code ?? "—"}</td><td>{frequencyLabels[control.audit_frequency ?? "annual"]}</td><td>{control.last_audit_date ? dateFormatter.format(new Date(`${control.last_audit_date}T12:00:00`)) : "—"}</td><td className={state === "overdue" ? "audit-overdue" : ""}>{control.next_audit_date ? dateFormatter.format(new Date(`${control.next_audit_date}T12:00:00`)) : "غير محدد"}</td><td><span className={`audit-state ${state}`}>{stateLabels[state]}</span></td><td><div className="audit-actions"><Link href={`/controls/${control.id}`}>فتح</Link>{canManage && <button onClick={() => startEdit(control)}>تحديث</button>}</div></td></tr>; })}</tbody></table>{!filtered.length && <p className="workflow-empty">لا توجد ضوابط مطابقة للتصفية الحالية.</p>}</section>
    {editing && <section className="audit-editor" aria-labelledby="audit-editor-title"><header><div><span dir="ltr">{editing.control_code}</span><h2 id="audit-editor-title">تحديث جدول التدقيق</h2><p>{editing.title_ar}</p></div><button onClick={() => setEditing(null)} aria-label="إغلاق">×</button></header><div className="audit-editor-fields"><label>التكرار<select value={frequency} onChange={event => updateFrequency(event.target.value as Frequency)}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>آخر تدقيق<input type="date" value={lastDate} onChange={event => updateLastDate(event.target.value)} /></label><label>التدقيق القادم<input type="date" value={nextDate} onChange={event => setNextDate(event.target.value)} /></label></div><footer><button className="audit-save" disabled={saving} onClick={saveSchedule}>{saving ? "جاري الحفظ…" : "حفظ الجدول"}</button><button className="audit-cancel" disabled={saving} onClick={() => setEditing(null)}>إلغاء</button></footer></section>}
  </main>;
}

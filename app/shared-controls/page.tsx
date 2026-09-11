"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const statusLabel: Record<string, string> = { validated: "موثق", pending: "بانتظار التحقق", rejected: "مرفوض" };
type SharedControl = { id: number; shared_control_code: string; title_ar: string; source_reference: string | null };
type Mapping = { id: number; shared_control_id: number; framework_code: string; control_code: string; control_title_ar: string; relationship_type: string; validation_status: string; source_reference: string | null };
type DataControl = { id: number; control_code: string; title_ar: string };

export default function SharedControlsPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [shared, setShared] = useState<SharedControl[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [ndmoControls, setNdmoControls] = useState<DataControl[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ shared_control_id: "", data_control_id: "", relationship_type: "partial", source_reference: "" });

  async function load(active = true) {
    const { profile } = await requireProfile(["admin", "cybersecurity_team", "data_governance_team"]);
    const results = await Promise.all([
      supabase.from("shared_controls").select("id,shared_control_code,title_ar,source_reference").order("shared_control_code"),
      supabase.from("shared_control_framework_mappings").select("id,shared_control_id,framework_code,control_code,control_title_ar,relationship_type,validation_status,source_reference").order("framework_code")
    ]);
    if (results[0].error || results[1].error) throw results[0].error || results[1].error;
    if (!active) return;
    setRole(profile.role);
    setShared((results[0].data ?? []) as SharedControl[]);
    setMappings((results[1].data ?? []) as Mapping[]);
    if (profile.role === "admin" || profile.role === "data_governance_team") {
      const { data, error: dataError } = await supabase.from("data_governance_controls").select("id,control_code,title_ar").order("control_code");
      if (dataError) throw dataError;
      if (active) setNdmoControls((data ?? []) as DataControl[]);
    }
  }

  useEffect(() => { let active = true; load(active).catch(async (cause) => { if (active) { setError(cause instanceof Error ? cause.message : "تعذر تحميل الكتالوج"); const { data } = await supabase.auth.getSession(); if (!data.session) router.replace("/login"); } }).finally(() => active && setLoading(false)); return () => { active = false; }; }, [router]);

  const visible = useMemo(() => shared.filter(item => `${item.shared_control_code} ${item.title_ar}`.toLowerCase().includes(query.toLowerCase())), [query, shared]);
  const count = (id: number) => mappings.filter(item => item.shared_control_id === id).length;

  async function addNdmoMapping(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const selected = ndmoControls.find(item => item.id === Number(form.data_control_id));
    if (!selected) { setError("اختر ضابط NDMO."); setSaving(false); return; }
    const { error: insertError } = await supabase.from("shared_control_framework_mappings").insert({
      shared_control_id: Number(form.shared_control_id), data_governance_control_id: selected.id, framework_code: "NDMO", control_code: selected.control_code, control_title_ar: selected.title_ar,
      relationship_type: form.relationship_type, validation_status: "pending", source_reference: form.source_reference.trim() || "ربط مرشح يحتاج التحقق"
    });
    if (insertError) { setError("تعذر حفظ المواءمة. تأكد من أنها غير مضافة مسبقًا."); setSaving(false); return; }
    setForm({ shared_control_id: "", data_control_id: "", relationship_type: "partial", source_reference: "" }); setShow(false); await load(); setSaving(false);
  }

  if (loading) return <main dir="rtl" className="cgp-page-body" style={pageStyle}>جاري تحميل الكتالوج الموحد…</main>;
  return <main dir="rtl" className="cgp-page-body" style={pageStyle}>
    <header style={{ marginBottom: 22 }}><p style={eyebrow}>الالتزام المشترك</p><h1 style={{ fontSize: 31, margin: "7px 0" }}>كتالوج الضوابط الموحد</h1><p style={intro}>يمنع تكرار الضابط بين الأطر. المواءمات الموثقة تظهر هنا، وأي ربط جديد يظل مرشحًا حتى يعتمد قبل استخدامه في التقارير أو مشاركة الأدلة.</p></header>
    <section style={metricGrid}><article style={metric}><small>ضوابط موحدة</small><strong>{shared.length}</strong></article><article style={metric}><small>مواءمات موثقة</small><strong>{mappings.filter(item => item.validation_status === "validated").length}</strong></article><article style={metric}><small>مواءمات بانتظار التحقق</small><strong>{mappings.filter(item => item.validation_status === "pending").length}</strong></article></section>
    <section style={toolbar}><input aria-label="بحث في الكتالوج" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث برقم الضابط الموحد أو عنوانه" style={searchInput}/>{(role === "admin" || role === "data_governance_team") && <button onClick={() => setShow(value => !value)} style={primary}>{show ? "إغلاق" : "+ ربط ضابط NDMO"}</button>}</section>
    {show && <form onSubmit={addNdmoMapping} style={formStyle}><h2 style={{ marginTop: 0, fontSize: 17 }}>إضافة مواءمة NDMO مرشحة</h2><p style={hint}>لن تؤثر هذه المواءمة على الأدلة أو النسب حتى يراجعها مدير النظام ويعتمدها.</p><label style={label}>الضابط الموحد<select required value={form.shared_control_id} onChange={event => setForm({ ...form, shared_control_id: event.target.value })} style={input}>{shared.map(item => <option key={item.id} value={item.id}>{item.shared_control_code} — {item.title_ar}</option>)}</select></label><label style={label}>ضابط NDMO<select required value={form.data_control_id} onChange={event => setForm({ ...form, data_control_id: event.target.value })} style={input}><option value="">اختر الضابط</option>{ndmoControls.map(item => <option key={item.id} value={item.id}>{item.control_code} — {item.title_ar}</option>)}</select></label><label style={label}>نوع العلاقة<select value={form.relationship_type} onChange={event => setForm({ ...form, relationship_type: event.target.value })} style={input}><option value="equivalent">متكافئ</option><option value="partial">تداخل جزئي</option></select></label><label style={label}>مرجع أو سبب الربط<input value={form.source_reference} onChange={event => setForm({ ...form, source_reference: event.target.value })} placeholder="مثال: مراجعة نص الضابطين" style={input}/></label><button disabled={saving} style={primary}>{saving ? "جاري الحفظ…" : "إرسال للتحقق"}</button></form>}
    {error && <p role="alert" style={{ color: "#b42318", fontWeight: 700 }}>{error}</p>}
    <section style={tableWrap}><table style={table}><thead><tr style={{ background: "#f5f8f8" }}><th style={cell}>الضابط الموحد</th><th style={cell}>الأطر المرتبطة</th><th style={cell}>حالة المواءمة</th><th style={cell}>عرض</th></tr></thead><tbody>{visible.map(item => { const items = mappings.filter(mapping => mapping.shared_control_id === item.id); return <tr key={item.id}><td style={cell}><b dir="ltr">{item.shared_control_code}</b><br/><span>{item.title_ar}</span></td><td style={cell}>{items.length ? items.map(mapping => <div key={mapping.id}><b dir="ltr">{mapping.framework_code} · {mapping.control_code}</b><small style={{ display: "block", color: "#64748b" }}>{mapping.control_title_ar}</small></div>) : "لا توجد مواءمات بعد"}</td><td style={cell}>{items.length ? items.map(mapping => <span key={mapping.id} style={badge(mapping.validation_status)}>{statusLabel[mapping.validation_status]}</span>) : "—"}</td><td style={cell}><Link href="/mappings">خريطة الأمن ←</Link></td></tr>; })}</tbody></table>{!visible.length && <p style={{ padding: 18 }}>لا توجد نتائج.</p>}</section>
  </main>;
}
const pageStyle = { maxWidth: 1320, margin: "0 auto", padding: "36px 28px 60px" };
const eyebrow = { color: "#0f766e", fontWeight: 800, margin: 0 };
const intro = { maxWidth: 880, color: "#586875", lineHeight: 1.8 };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "18px 0" };
const metric = { padding: 17, border: "1px solid #dbe8e7", borderRadius: 12, background: "#fff", display: "grid", gap: 7 };
const toolbar = { display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", margin: "18px 0" };
const searchInput = { width: "100%", padding: 12, border: "1px solid #ccd6dc", borderRadius: 9, fontFamily: "inherit" };
const primary = { border: 0, borderRadius: 9, padding: "11px 14px", background: "#0f766e", color: "#fff", fontFamily: "inherit", fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" as const };
const formStyle = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 13, padding: 20, margin: "16px 0", border: "1px solid #bde0d8", borderRadius: 13, background: "#f8fdfc" };
const label = { display: "grid", gap: 7, color: "#405668", fontWeight: 800, fontSize: 12 };
const input = { padding: 10, border: "1px solid #cddbe2", borderRadius: 8, background: "#fff", fontFamily: "inherit" };
const hint = { gridColumn: "1 / -1", margin: 0, color: "#64748b", fontSize: 12 };
const tableWrap = { overflow: "auto", border: "1px solid #e2e7eb", borderRadius: 13, background: "#fff" };
const table = { width: "100%", borderCollapse: "collapse" as const, minWidth: 800 };
const cell = { padding: "14px 16px", borderBottom: "1px solid #edf0f2", verticalAlign: "top" as const, textAlign: "right" as const, fontSize: 12 };
const badge = (status: string) => ({ display: "inline-flex", margin: "0 0 6px 6px", padding: "5px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: status === "validated" ? "#087d58" : status === "pending" ? "#9a6700" : "#b42318", background: status === "validated" ? "#e4f8ef" : status === "pending" ? "#fff3d6" : "#fee9e7" });

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile, type UserRole } from "@/lib/auth";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";

type Profile = {
  user_id: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Framework = { id: number; code: string; name_ar: string };
type AuditorScope = {
  id: number;
  auditor_id: string;
  framework_id: number;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
  frameworks: Framework | Framework[] | null;
};

const roleLabels: Record<UserRole, string> = {
  admin: "مدير النظام",
  cybersecurity_team: "مدير الامتثال والمراجعة",
  data_governance_team: "فريق إدارة البيانات والحوكمة",
  control_owner: "مالك الضابط",
  nca_external_auditor: "مراجع خارجي — NCA",
};

export default function UsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("control_owner");
  const [activationLink, setActivationLink] = useState("");
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [auditorScopes, setAuditorScopes] = useState<AuditorScope[]>([]);
  const [scopeAuditorId, setScopeAuditorId] = useState("");
  const [scopeFrameworkId, setScopeFrameworkId] = useState("");
  const [scopeEndDate, setScopeEndDate] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() + 90); return date.toISOString().slice(0, 10);
  });

  async function loadProfiles() {
    const [{ data, error: loadError }, { data: frameworkData, error: frameworkError }, { data: scopeData, error: scopeError }] = await Promise.all([
      supabase.from("profiles").select("user_id,display_name,role,is_active,created_at,updated_at").order("created_at", { ascending: true }),
      supabase.from("frameworks").select("id,code,name_ar").eq("is_active", true).order("id"),
      supabase.from("external_auditor_framework_scopes").select("id,auditor_id,framework_id,starts_on,ends_on,is_active,frameworks(id,code,name_ar)").order("ends_on"),
    ]);
    if (loadError || frameworkError) { setError("تعذر تحميل المستخدمين أو الأطر."); return; }
    setProfiles((data ?? []) as Profile[]);
    setFrameworks((frameworkData ?? []) as Framework[]);
    if (scopeError && !scopeError.message.includes("external_auditor_framework_scopes")) { setError("تعذر تحميل نطاقات المراجعة."); }
    setAuditorScopes((scopeData ?? []) as AuditorScope[]);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { user } = await requireProfile(["admin"]);
        if (!mounted) return;
        setCurrentUserId(user.id);
        await loadProfiles();
      } catch (authError) {
        if (!mounted) return;
        const message = authError instanceof Error ? authError.message : "";
        router.replace(message.includes("تسجيل الدخول") ? "/login" : "/");
        return;
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? profiles.filter((profile) => [profile.display_name ?? "", roleLabels[profile.role]].join(" ").toLowerCase().includes(q)) : profiles;
  }, [profiles, search]);

  async function updateProfile(id: string, patch: Partial<Pick<Profile, "role" | "is_active">>) {
    setError(""); setSuccess("");
    if (id === currentUserId && (patch.is_active === false || (patch.role && patch.role !== "admin"))) {
      setError("لا يمكن لمدير النظام إيقاف حسابه أو إزالة صلاحية مدير النظام من نفسه."); return;
    }
    setSavingId(id);
    const { error: updateError } = await supabase.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", id);
    if (updateError) { setError("تعذر حفظ التغيير."); setSavingId(null); return; }
    setProfiles((current) => current.map((profile) => profile.user_id === id ? { ...profile, ...patch } : profile));
    setSuccess("تم حفظ التغيير."); setSavingId(null);
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setActivationLink(""); setInviteLoading(true);
    const { error: inviteError } = await supabase.functions.invoke("admin-invite-user", { body: { email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole } });
    if (inviteError) { setError("تعذر إرسال الدعوة. إذا كان المستخدم موجودًا استخدم إعادة رابط التفعيل."); setInviteLoading(false); return; }
    setSuccess(`تم إرسال دعوة إلى ${inviteEmail.trim()}.`); setInviteName(""); setInviteEmail(""); setShowInvite(false); await loadProfiles(); setInviteLoading(false);
  }

  async function resend(id: string) {
    setSavingId(id); setError(""); setSuccess(""); setActivationLink("");
    const { data, error: resendError } = await supabase.functions.invoke("admin-resend-invite", { body: { user_id: id } });
    if (resendError || !data?.action_link) { setError("تعذر إنشاء رابط التفعيل. قد يكون الحساب مفعلاً بالفعل."); setSavingId(null); return; }
    setActivationLink(data.action_link); setSuccess("تم إنشاء رابط تفعيل جديد. افتحه أو انسخه وأرسله للمستخدم."); setSavingId(null);
  }

  async function addAuditorScope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (!scopeAuditorId || !scopeFrameworkId || !scopeEndDate) { setError("اختر المراجع والإطار وتاريخ انتهاء الصلاحية."); return; }
    setInviteLoading(true);
    const { error: scopeError } = await supabase.from("external_auditor_framework_scopes").upsert({
      auditor_id: scopeAuditorId,
      framework_id: Number(scopeFrameworkId),
      starts_on: new Date().toISOString().slice(0, 10),
      ends_on: scopeEndDate,
      is_active: true,
      created_by: currentUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "auditor_id,framework_id" });
    if (scopeError) setError("تعذر حفظ نطاق التدقيق. تأكد من تطبيق تحديث قاعدة البيانات.");
    else { setSuccess("تم منح المراجع الخارجي صلاحية الاطلاع على الإطار ضمن المدة المحددة."); await loadProfiles(); }
    setInviteLoading(false);
  }

  async function removeAuditorScope(id: number) {
    setSavingId(`scope-${id}`); setError("");
    const { error: scopeError } = await supabase.from("external_auditor_framework_scopes").delete().eq("id", id);
    if (scopeError) setError("تعذر إلغاء نطاق التدقيق.");
    else { setSuccess("تم إلغاء نطاق التدقيق."); await loadProfiles(); }
    setSavingId(null);
  }

  if (loading) return <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial", background: "#f5f7f9" }}>جاري تحميل إدارة المستخدمين...</main>;

  return <main dir="rtl" className="workflow-page"><section>
    <WorkflowHeading title="إدارة المستخدمين" description="دعوة المستخدمين وإدارة أدوارهم وحالة تفعيل حساباتهم." action={<button onClick={() => setShowInvite((value) => !value)} className="workflow-button workflow-primary">+ إضافة مستخدم</button>}/>
    <div className="workflow-metrics user-metrics"><WorkflowMetric label="إجمالي المستخدمين" value={profiles.length}/><WorkflowMetric label="الحسابات النشطة" value={profiles.filter(p=>p.is_active).length} tone="success"/><WorkflowMetric label="مديرو الامتثال والمراجعة" value={profiles.filter(p=>p.role==="cybersecurity_team").length}/><WorkflowMetric label="مالكو الضوابط" value={profiles.filter(p=>p.role==="control_owner").length}/><WorkflowMetric label="مراجعو NCA الخارجيون" value={profiles.filter(p=>p.role==="nca_external_auditor").length}/></div>
    <div className="workflow-filter"><label className="cgp-field-label" htmlFor="user-search">البحث في المستخدمين</label><input id="user-search" aria-label="البحث عن مستخدم" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو الدور" style={inputStyle}/></div>
    {showInvite && <form onSubmit={inviteUser} style={{ background: "white", padding: 20, borderRadius: 14, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}><input aria-label="اسم المستخدم الجديد" required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="الاسم" style={inputStyle}/><input aria-label="البريد الإلكتروني للمستخدم الجديد" dir="ltr" required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="البريد" style={inputStyle}/><select aria-label="دور المستخدم الجديد" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as UserRole)} style={inputStyle}><option value="control_owner">مالك الضابط</option><option value="cybersecurity_team">مدير الامتثال والمراجعة</option><option value="nca_external_auditor">مراجع خارجي — NCA</option><option value="admin">مدير النظام</option></select><button disabled={inviteLoading} style={primary}>{inviteLoading ? "جاري الإرسال..." : "إرسال الدعوة"}</button></form>}
    {error && <div role="alert" style={err}>{error}</div>}{success && <div role="status" style={ok}>{success}</div>}{activationLink && <div style={{ ...ok, overflowWrap: "anywhere" }}><a href={activationLink} target="_blank" rel="noreferrer" style={{ fontWeight: 800, color: "var(--cgp-teal-dark)" }}>فتح رابط التفعيل الجديد</a><div style={{ fontSize: 12, marginTop: 8 }}>يمكنك فتح الرابط مباشرة على جهاز المستخدم.</div></div>}
    <div style={{ background: "white", borderRadius: 14, overflow: "hidden" }}><div className="cgp-table-scroll" role="region" aria-label="جدول المستخدمين" tabIndex={0}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={th}>المستخدم</th><th style={th}>الدور</th><th style={th}>الحالة</th><th style={th}>التفعيل</th></tr></thead><tbody>{filteredProfiles.map((profile) => { const isSelf = profile.user_id === currentUserId; return <tr key={profile.user_id} style={{ borderTop: "1px solid #edf0f2" }}><td style={td}><b>{profile.display_name || "بدون اسم"}{isSelf ? " (أنت)" : ""}</b><div style={{ fontSize: 12, color: "#586875" }}>{profile.user_id.slice(0, 8)}…</div></td><td style={td}><select aria-label={`دور ${profile.display_name || "المستخدم"}`} value={profile.role} disabled={savingId === profile.user_id || isSelf} onChange={(event) => updateProfile(profile.user_id, { role: event.target.value as UserRole })} style={inputStyle}><option value="admin">مدير النظام</option><option value="cybersecurity_team">مدير الامتثال والمراجعة</option><option value="control_owner">مالك الضابط</option><option value="nca_external_auditor">مراجع خارجي — NCA</option></select></td><td style={td}><button disabled={savingId === profile.user_id || isSelf} onClick={() => updateProfile(profile.user_id, { is_active: !profile.is_active })}>{profile.is_active ? "نشط" : "موقوف"}</button></td><td style={td}><button disabled={savingId === profile.user_id} onClick={() => resend(profile.user_id)} style={secondary}>إعادة رابط التفعيل</button></td></tr>; })}</tbody></table></div></div>
    {profiles.some(profile => profile.role === "nca_external_auditor") && <section style={{ background: "white", borderRadius: 14, padding: 20, marginTop: 20, border: "1px solid #dce5e8" }} aria-labelledby="auditor-scope-title"><h2 id="auditor-scope-title" style={{ marginTop: 0 }}>نطاقات المراجعين الخارجيين — NCA</h2><p style={{ color: "#586875" }}>لا يرى المراجع الخارجي أي ضابط أو دليل قبل منحه إطاراً وتاريخ انتهاء لصلاحيته.</p><form onSubmit={addAuditorScope} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 16 }}><label>المراجع<select value={scopeAuditorId} onChange={event => setScopeAuditorId(event.target.value)} required style={inputStyle}><option value="">اختر المراجع</option>{profiles.filter(profile => profile.role === "nca_external_auditor" && profile.is_active).map(profile => <option key={profile.user_id} value={profile.user_id}>{profile.display_name || profile.user_id}</option>)}</select></label><label>الإطار<select value={scopeFrameworkId} onChange={event => setScopeFrameworkId(event.target.value)} required style={inputStyle}><option value="">اختر الإطار</option>{frameworks.map(framework => <option key={framework.id} value={framework.id}>{framework.code} — {framework.name_ar}</option>)}</select></label><label>ينتهي في<input type="date" value={scopeEndDate} min={new Date().toISOString().slice(0, 10)} onChange={event => setScopeEndDate(event.target.value)} required style={inputStyle}/></label><button disabled={inviteLoading} style={primary}>{inviteLoading ? "جاري الحفظ..." : "منح نطاق التدقيق"}</button></form><div style={{ marginTop: 18 }}>{auditorScopes.length === 0 ? <p style={{ color: "#586875" }}>لا توجد نطاقات تدقيق ممنوحة بعد.</p> : auditorScopes.map(scope => { const framework = Array.isArray(scope.frameworks) ? scope.frameworks[0] : scope.frameworks; const auditor = profiles.find(profile => profile.user_id === scope.auditor_id); return <div key={scope.id} style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: "1px solid #edf0f2" }}><span><b>{auditor?.display_name || "مراجع خارجي"}</b> · <span dir="ltr">{framework?.code || "—"}</span> — ينتهي {scope.ends_on}</span><button onClick={() => removeAuditorScope(scope.id)} disabled={savingId === `scope-${scope.id}`} style={secondary}>إلغاء النطاق</button></div>; })}</div></section>}
  </section></main>;
}

const th = { textAlign: "right" as const, padding: "15px 18px" };
const td = { padding: "16px 18px" };
const inputStyle = { border: "1px solid #ccd6dc", borderRadius: 9, padding: "10px 12px", marginLeft: 8, background: "white" };
const primary = { border: 0, borderRadius: 9, padding: "11px 15px", background: "var(--cgp-teal)", color: "white", fontWeight: 800, cursor: "pointer" };
const secondary = { border: "1px solid var(--cgp-teal)", borderRadius: 9, padding: "9px 12px", background: "white", color: "var(--cgp-teal)", fontWeight: 800, cursor: "pointer" };
const err = { padding: 12, background: "#fff2f0", color: "#9d2e24", borderRadius: 9, marginBottom: 15 };
const ok = { padding: 12, background: "#edf8f5", color: "var(--cgp-teal-dark)", borderRadius: 9, marginBottom: 15 };

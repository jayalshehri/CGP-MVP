"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UserRole = "admin" | "cybersecurity_team" | "control_owner";
type Profile = {
  user_id: string;
  display_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const roleLabels: Record<UserRole, string> = {
  admin: "مدير النظام",
  cybersecurity_team: "فريق الأمن السيبراني",
  control_owner: "مالك الضابط",
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

  async function loadProfiles() {
    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("user_id,display_name,role,is_active,created_at,updated_at")
      .order("created_at", { ascending: true });

    if (loadError) {
      setError("تعذر تحميل المستخدمين.");
      return;
    }
    setProfiles((data ?? []) as Profile[]);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace("/login");
      if (!mounted) return;
      setCurrentUserId(data.session.user.id);

      const { data: me } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("user_id", data.session.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (!me || me.role !== "admin" || me.is_active === false) return router.replace("/");
      await loadProfiles();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? profiles.filter((profile) =>
          [profile.display_name ?? "", roleLabels[profile.role]].join(" ").toLowerCase().includes(q),
        )
      : profiles;
  }, [profiles, search]);

  async function updateProfile(id: string, patch: Partial<Pick<Profile, "role" | "is_active">>) {
    setError("");
    setSuccess("");

    if (id === currentUserId && (patch.is_active === false || (patch.role && patch.role !== "admin"))) {
      setError("لا يمكن لمدير النظام إيقاف حسابه أو إزالة صلاحية مدير النظام من نفسه.");
      return;
    }

    setSavingId(id);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", id);

    if (updateError) {
      setError("تعذر حفظ التغيير.");
      setSavingId(null);
      return;
    }

    setProfiles((current) => current.map((profile) => (profile.user_id === id ? { ...profile, ...patch } : profile)));
    setSuccess("تم حفظ التغيير.");
    setSavingId(null);
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setActivationLink("");
    setInviteLoading(true);

    const { error: inviteError } = await supabase.functions.invoke("admin-invite-user", {
      body: { email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole },
    });

    if (inviteError) {
      setError("تعذر إرسال الدعوة. إذا كان المستخدم موجودًا استخدم إعادة رابط التفعيل.");
      setInviteLoading(false);
      return;
    }

    setSuccess(`تم إرسال دعوة إلى ${inviteEmail.trim()}.`);
    setInviteName("");
    setInviteEmail("");
    setShowInvite(false);
    await loadProfiles();
    setInviteLoading(false);
  }

  async function resend(id: string) {
    setSavingId(id);
    setError("");
    setSuccess("");
    setActivationLink("");

    const { data, error: resendError } = await supabase.functions.invoke("admin-resend-invite", {
      body: { user_id: id },
    });

    if (resendError || !data?.action_link) {
      setError("تعذر إنشاء رابط التفعيل. قد يكون الحساب مفعلاً بالفعل.");
      setSavingId(null);
      return;
    }

    setActivationLink(data.action_link);
    setSuccess("تم إنشاء رابط تفعيل جديد. افتحه أو انسخه وأرسله للمستخدم.");
    setSavingId(null);
  }

  if (loading) {
    return (
      <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial", background: "#f5f7f9" }}>
        جاري تحميل إدارة المستخدمين...
      </main>
    );
  }

  return (
    <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7f9", color: "#0b1f33", fontFamily: "Arial" }}>
      <section className="cgp-page-body" style={{ padding: 40, maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <h1>إدارة المستخدمين</h1>
            <p style={{ color: "#71808e" }}>دعوة المستخدمين وإدارة الأدوار والتفعيل.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, minWidth: 0 }}>
            <input aria-label="البحث عن مستخدم" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو الدور" style={inputStyle} />
            <button onClick={() => setShowInvite((value) => !value)} style={primary}>+ إضافة مستخدم</button>
          </div>
        </div>

        {showInvite && (
          <form onSubmit={inviteUser} style={{ background: "white", padding: 20, borderRadius: 14, marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input aria-label="اسم المستخدم الجديد" required value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="الاسم" style={inputStyle} />
            <input aria-label="البريد الإلكتروني للمستخدم الجديد" dir="ltr" required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="البريد" style={inputStyle} />
            <select aria-label="دور المستخدم الجديد" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as UserRole)} style={inputStyle}>
              <option value="control_owner">مالك الضابط</option>
              <option value="cybersecurity_team">فريق الأمن السيبراني</option>
              <option value="admin">مدير النظام</option>
            </select>
            <button disabled={inviteLoading} style={primary}>{inviteLoading ? "جاري الإرسال..." : "إرسال الدعوة"}</button>
          </form>
        )}

        {error && <div role="alert" style={err}>{error}</div>}
        {success && <div role="status" style={ok}>{success}</div>}
        {activationLink && (
          <div style={{ ...ok, overflowWrap: "anywhere" }}>
            <a href={activationLink} target="_blank" rel="noreferrer" style={{ fontWeight: 800, color: "#0f6f67" }}>فتح رابط التفعيل الجديد</a>
            <div style={{ fontSize: 12, marginTop: 8 }}>يمكنك فتح الرابط مباشرة على جهاز المستخدم.</div>
          </div>
        )}

        <div style={{ background: "white", borderRadius: 14, overflow: "hidden" }}>
          <div className="cgp-table-scroll" role="region" aria-label="جدول المستخدمين" tabIndex={0}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr><th style={th}>المستخدم</th><th style={th}>الدور</th><th style={th}>الحالة</th><th style={th}>التفعيل</th></tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => {
                  const isSelf = profile.user_id === currentUserId;
                  return (
                    <tr key={profile.user_id} style={{ borderTop: "1px solid #edf0f2" }}>
                      <td style={td}>
                        <b>{profile.display_name || "بدون اسم"}{isSelf ? " (أنت)" : ""}</b>
                        <div style={{ fontSize: 12, color: "#586875" }}>{profile.user_id.slice(0, 8)}…</div>
                      </td>
                      <td style={td}>
                        <select
                          aria-label={`دور ${profile.display_name || "المستخدم"}`}
                          value={profile.role}
                          disabled={savingId === profile.user_id || isSelf}
                          onChange={(event) => updateProfile(profile.user_id, { role: event.target.value as UserRole })}
                          style={inputStyle}
                        >
                          <option value="admin">مدير النظام</option>
                          <option value="cybersecurity_team">فريق الأمن السيبراني</option>
                          <option value="control_owner">مالك الضابط</option>
                        </select>
                      </td>
                      <td style={td}>
                        <button disabled={savingId === profile.user_id || isSelf} onClick={() => updateProfile(profile.user_id, { is_active: !profile.is_active })}>
                          {profile.is_active ? "نشط" : "موقوف"}
                        </button>
                      </td>
                      <td style={td}>
                        <button disabled={savingId === profile.user_id} onClick={() => resend(profile.user_id)} style={secondary}>إعادة رابط التفعيل</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

const th = { textAlign: "right" as const, padding: "15px 18px" };
const td = { padding: "16px 18px" };
const inputStyle = { border: "1px solid #ccd6dc", borderRadius: 9, padding: "10px 12px", marginLeft: 8, background: "white" };
const primary = { border: 0, borderRadius: 9, padding: "11px 15px", background: "#0f756d", color: "white", fontWeight: 800, cursor: "pointer" };
const secondary = { border: "1px solid #0f756d", borderRadius: 9, padding: "9px 12px", background: "white", color: "#0f756d", fontWeight: 800, cursor: "pointer" };
const err = { padding: 12, background: "#fff2f0", color: "#9d2e24", borderRadius: 9, marginBottom: 15 };
const ok = { padding: 12, background: "#edf8f5", color: "#0f6f67", borderRadius: 9, marginBottom: 15 };

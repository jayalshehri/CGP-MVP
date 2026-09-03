"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: me } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (!me || me.role !== "admin" || me.is_active === false) {
        router.replace("/");
        return;
      }

      const { data, error: listError } = await supabase
        .from("profiles")
        .select("user_id,display_name,role,is_active,created_at,updated_at")
        .order("created_at", { ascending: true });

      if (!mounted) return;
      if (listError) {
        setError("تعذر تحميل المستخدمين.");
      } else {
        setProfiles((data ?? []) as Profile[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((profile) =>
      [profile.display_name ?? "", roleLabels[profile.role]]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [profiles, search]);

  async function updateProfile(userId: string, patch: Partial<Pick<Profile, "role" | "is_active">>) {
    setSavingId(userId);
    setError("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (updateError) {
      setError("تعذر حفظ التغيير. حاول مرة أخرى.");
      setSavingId(null);
      return;
    }

    setProfiles((current) =>
      current.map((profile) => (profile.user_id === userId ? { ...profile, ...patch } : profile))
    );
    setSavingId(null);
  }

  if (loading) {
    return (
      <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f9", color: "#0b1f33", fontFamily: "Arial, sans-serif" }}>
        جاري تحميل إدارة المستخدمين...
      </main>
    );
  }

  return (
    <main dir="rtl" style={{ minHeight: "100vh", background: "#f5f7f9", color: "#0b1f33", fontFamily: "Arial, sans-serif" }}>
      <header style={{ minHeight: 86, background: "#0b1f33", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 38px" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Cyber Governance Platform</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 5 }}>إدارة المستخدمين والصلاحيات</div>
        </div>
        <Link href="/" style={{ color: "white", textDecoration: "none", border: "1px solid rgba(255,255,255,.22)", borderRadius: 9, padding: "10px 14px" }}>
          العودة للوحة المتابعة
        </Link>
      </header>

      <section style={{ padding: 40, maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32 }}>إدارة المستخدمين</h1>
            <p style={{ margin: "8px 0 0", color: "#71808e" }}>تغيير دور المستخدم وتفعيل أو تعطيل الوصول إلى CGP.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالاسم أو الدور"
            style={{ width: 280, border: "1px solid #ccd6dc", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "white" }}
          />
        </div>

        {error ? <div role="alert" style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 10, background: "#fff2f0", color: "#9d2e24" }}>{error}</div> : null}

        <div style={{ background: "white", border: "1px solid #e2e7eb", borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "#f7f9fa" }}>
              <tr>
                <th style={th}>المستخدم</th>
                <th style={th}>الدور</th>
                <th style={th}>الحالة</th>
                <th style={th}>آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((profile) => (
                <tr key={profile.user_id} style={{ borderTop: "1px solid #edf0f2" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{profile.display_name || "بدون اسم"}</div>
                    <div style={{ color: "#8a98a4", fontSize: 12, marginTop: 4 }}>{profile.user_id.slice(0, 8)}…</div>
                  </td>
                  <td style={td}>
                    <select
                      value={profile.role}
                      disabled={savingId === profile.user_id}
                      onChange={(event) => updateProfile(profile.user_id, { role: event.target.value as UserRole })}
                      style={{ border: "1px solid #ccd6dc", borderRadius: 9, padding: "10px 12px", background: "white", minWidth: 190 }}
                    >
                      <option value="admin">مدير النظام</option>
                      <option value="cybersecurity_team">فريق الأمن السيبراني</option>
                      <option value="control_owner">مالك الضابط</option>
                    </select>
                  </td>
                  <td style={td}>
                    <button
                      type="button"
                      disabled={savingId === profile.user_id}
                      onClick={() => updateProfile(profile.user_id, { is_active: !profile.is_active })}
                      style={{ border: 0, borderRadius: 999, padding: "9px 13px", cursor: "pointer", fontWeight: 700, background: profile.is_active ? "#e8f5f2" : "#f1f2f3", color: profile.is_active ? "#0f6f67" : "#7c8790" }}
                    >
                      {profile.is_active ? "نشط" : "موقوف"}
                    </button>
                  </td>
                  <td style={td}>{new Date(profile.updated_at).toLocaleDateString("ar-SA")}</td>
                </tr>
              ))}
              {filteredProfiles.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 34, textAlign: "center", color: "#8a98a4" }}>لا توجد نتائج.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const th = { textAlign: "right" as const, padding: "15px 18px", fontSize: 13, color: "#65727d" };
const td = { padding: "16px 18px", fontSize: 14, verticalAlign: "middle" as const };

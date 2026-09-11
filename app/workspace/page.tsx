"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile, type UserRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const roleLabels: Record<UserRole, string> = {
  admin: "مدير النظام",
  cybersecurity_team: "فريق الأمن السيبراني",
  data_governance_team: "فريق إدارة البيانات",
  control_owner: "مالك ضابط",
};

type WorkspaceCard = {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  tone: "cyber" | "data";
  permissions: UserRole[];
  items: string[];
};

const workspaces: WorkspaceCard[] = [
  {
    title: "الأمن السيبراني",
    subtitle: "Cybersecurity Governance",
    description: "إدارة الالتزام السيبراني، المخاطر، الثغرات، الأدلة، الأصول والتقييمات التنظيمية.",
    href: "/",
    tone: "cyber",
    permissions: ["admin", "cybersecurity_team", "control_owner"],
    items: ["الضوابط والأدلة", "المخاطر والثغرات", "التقييمات والتقارير"],
  },
  {
    title: "حوكمة البيانات",
    subtitle: "Data Governance",
    description: "إدارة ضوابط NDMO وطلبات البيانات والجودة والخصوصية والمشاركة وأصول البيانات.",
    href: "/data-governance",
    tone: "data",
    permissions: ["admin", "data_governance_team"],
    items: ["ضوابط NDMO", "الجودة والخصوصية", "الطلبات والمشاركة"],
  },
];

export default function WorkspaceSelectPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    requireProfile()
      .then(({ profile }) => {
        if (!active) return;
        setRole(profile.role);
        setName(profile.display_name || "");
      })
      .catch(async () => {
        const { data } = await supabase.auth.getSession();
        if (active && !data.session) router.replace("/login");
        if (active && data.session) setError("تعذر التحقق من صلاحية حسابك.");
      });
    return () => { active = false; };
  }, [router]);

  const available = role ? workspaces.filter((workspace) => workspace.permissions.includes(role)) : [];

  return (
    <main dir="rtl" style={{ minHeight: "100vh", padding: "clamp(24px, 5vw, 76px)", background: "radial-gradient(circle at 88% 6%, #d7fbf6 0, transparent 26%), radial-gradient(circle at 10% 100%, #e4edf7 0, transparent 30%), #f7fafc", color: "#10263f" }}>
      <section style={{ maxWidth: 1220, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, borderBottom: "1px solid #dce5ec", paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 34, letterSpacing: "-1px", color: "#0c2845" }}>CGP</div>
            <div style={{ borderInlineStart: "1px solid #b9c8d4", paddingInlineStart: 16 }}>
              <strong style={{ display: "block", fontSize: 17 }}>منصة الحوكمة الرقمية</strong>
              <small style={{ color: "#60758a" }}>Digital Governance Platform</small>
            </div>
          </div>
          <div style={{ textAlign: "left", color: "#60758a", fontSize: 14 }}>
            {name && <strong style={{ display: "block", color: "#213a54" }}>{name}</strong>}
            {role ? roleLabels[role] : "جاري التحقق من الحساب…"}
          </div>
        </div>

        <div style={{ padding: "clamp(42px, 8vw, 92px) 0 34px", maxWidth: 760 }}>
          <span style={{ color: "#087a72", fontWeight: 800, fontSize: 14 }}>اختر مساحة العمل</span>
          <h1 style={{ margin: "12px 0 16px", fontSize: "clamp(32px, 4vw, 52px)", lineHeight: 1.2, letterSpacing: "-1px" }}>ابدأ من المجال المناسب لعملك</h1>
          <p style={{ margin: 0, color: "#5f7183", fontSize: 18, lineHeight: 1.8 }}>تفصل المنصة بين الحوكمة السيبرانية وحوكمة البيانات. ستظهر لك المعلومات والأدوات المصرح بها في المساحة التي تختارها فقط.</p>
        </div>

        {error && <p role="alert" style={{ background: "#fff1f0", color: "#a42b21", borderRadius: 12, padding: 16 }}>{error}</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 22 }}>
          {available.map((workspace) => (
            <button key={workspace.href} type="button" onClick={() => router.push(workspace.href)} style={{ cursor: "pointer", textAlign: "right", border: "1px solid #d9e3ea", borderTop: workspace.tone === "cyber" ? "5px solid #0d2948" : "5px solid #0f8d82", borderRadius: 20, padding: 30, minHeight: 310, background: "rgba(255,255,255,.93)", boxShadow: "0 12px 34px rgba(26, 54, 79, .08)", color: "#10263f" }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 52, height: 52, borderRadius: 14, background: workspace.tone === "cyber" ? "#e6edf6" : "#def7f2", color: workspace.tone === "cyber" ? "#0c3156" : "#087a72", fontSize: 26 }}>{workspace.tone === "cyber" ? "◈" : "◉"}</span>
              <p style={{ color: "#698095", margin: "22px 0 4px", fontSize: 13, fontWeight: 800 }}>{workspace.subtitle}</p>
              <h2 style={{ margin: "0 0 10px", fontSize: 27 }}>{workspace.title}</h2>
              <p style={{ margin: 0, color: "#5f7183", lineHeight: 1.75, minHeight: 76 }}>{workspace.description}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>{workspace.items.map((item) => <span key={item} style={{ background: "#f0f5f8", color: "#40586e", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{item}</span>)}</div>
              <span style={{ display: "block", marginTop: 25, color: workspace.tone === "cyber" ? "#0c3156" : "#087a72", fontWeight: 900 }}>دخول المساحة ←</span>
            </button>
          ))}
        </div>

        {role && available.length === 1 && <p style={{ marginTop: 24, color: "#60758a" }}>تظهر لك مساحة واحدة لأن صلاحية حسابك مقصورة عليها.</p>}
      </section>
    </main>
  );
}

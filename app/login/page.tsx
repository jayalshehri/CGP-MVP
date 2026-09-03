"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        router.replace("/");
        return;
      }
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("تعذر تسجيل الدخول. تأكد من البريد الإلكتروني وكلمة المرور.");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f4f7f8",
          color: "#0b1f33",
          fontFamily: "Arial, sans-serif",
        }}
      >
        جاري التحقق من الجلسة...
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.05fr) minmax(420px, 0.95fr)",
        background: "#f4f7f8",
        color: "#0b1f33",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          padding: "72px",
          background:
            "linear-gradient(145deg, #071d30 0%, #0b3144 55%, #0f6f67 100%)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "100vh",
        }}
      >
        <div>
          <div style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "0.2px" }}>
            Cyber Governance Platform
          </div>
          <div style={{ marginTop: "9px", fontSize: "15px", opacity: 0.72 }}>
            منصة حوكمة الأمن السيبراني
          </div>
        </div>

        <div style={{ maxWidth: "620px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 12px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.15)",
              fontSize: "13px",
              marginBottom: "22px",
            }}
          >
            CGP · NCA Compliance Workspace
          </div>
          <h1 style={{ margin: 0, fontSize: "46px", lineHeight: 1.25 }}>
            إدارة الالتزام السيبراني
            <br />
            من مكان واحد
          </h1>
          <p
            style={{
              margin: "22px 0 0",
              maxWidth: "560px",
              lineHeight: 1.9,
              fontSize: "17px",
              opacity: 0.82,
            }}
          >
            تابع الضوابط، التكليفات، الأدلة، التقييمات ودورات التحقق ضمن مساحة عمل
            موحدة وآمنة.
          </p>
        </div>

        <div style={{ fontSize: "12px", opacity: 0.55 }}>
          Cyber Governance Platform · 2026
        </div>
      </section>

      <section
        style={{
          minHeight: "100vh",
          padding: "48px",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: "440px" }}>
          <div
            style={{
              background: "white",
              border: "1px solid #e1e7ea",
              borderRadius: "20px",
              boxShadow: "0 18px 60px rgba(11,31,51,0.08)",
              padding: "38px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "28px" }}>تسجيل الدخول</h2>
            <p style={{ color: "#71808e", margin: "10px 0 30px", lineHeight: 1.7 }}>
              استخدم حساب CGP المصرح لك به للدخول إلى المنصة.
            </p>

            <form onSubmit={handleSubmit}>
              <label
                htmlFor="email"
                style={{ display: "block", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}
              >
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #ccd6dc",
                  borderRadius: "10px",
                  padding: "13px 14px",
                  fontSize: "15px",
                  outline: "none",
                  marginBottom: "20px",
                  background: "#fbfcfd",
                }}
              />

              <label
                htmlFor="password"
                style={{ display: "block", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}
              >
                كلمة المرور
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid #ccd6dc",
                  borderRadius: "10px",
                  padding: "13px 14px",
                  fontSize: "15px",
                  outline: "none",
                  background: "#fbfcfd",
                }}
              />

              {error ? (
                <div
                  role="alert"
                  style={{
                    marginTop: "16px",
                    padding: "11px 13px",
                    borderRadius: "9px",
                    background: "#fff2f0",
                    color: "#9d2e24",
                    fontSize: "13px",
                    lineHeight: 1.6,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  border: 0,
                  borderRadius: "10px",
                  background: loading ? "#789c98" : "#0f756d",
                  color: "white",
                  padding: "14px 18px",
                  marginTop: "24px",
                  fontSize: "15px",
                  fontWeight: 800,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "جاري تسجيل الدخول..." : "دخول إلى CGP"}
              </button>
            </form>
          </div>

          <p style={{ textAlign: "center", color: "#8a98a4", fontSize: "12px", marginTop: "18px" }}>
            الدخول متاح للمستخدمين المصرح لهم فقط.
          </p>
        </div>
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import Link from "next/link";
import { GatewayMark, WorkspaceSeal } from "@/components/GatewayIdentity";
import gateway from "@/app/portal.module.css";
import styles from "./workspace-login.module.css";
import { workspaceHome, type WorkspaceName } from "@/lib/workspaces";

export default function WorkspaceLogin({ workspace }: { workspace: WorkspaceName }) {
  const label = workspace === "data" ? "مكتب إدارة البيانات" : "إدارة الأمن السيبراني";
  const [wrongWorkspace, setWrongWorkspace] = useState(false);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) throw sessionError;
      if (data.session) {
        const { profile } = await requireProfile();
        if (!mounted) return;
        const home = workspaceHome(profile.role, workspace);
        if (home) router.replace(home);
        else { setWrongWorkspace(true); setCheckingSession(false); }
        return;
      }
      setCheckingSession(false);
    }).catch(() => {
      if (mounted) {
        setError("تعذر التحقق من صلاحيات الحساب. أعد تسجيل الدخول أو تواصل مع مدير النظام.");
        setCheckingSession(false);
      }
    });
    return () => { mounted = false; };
  }, [router, workspace]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError("تعذر تسجيل الدخول. تأكد من البريد الإلكتروني وكلمة المرور.");
        return;
      }
      const { profile } = await requireProfile();
      const home = workspaceHome(profile.role, workspace);
      if (!home) { setWrongWorkspace(true); return; }
      router.replace(home);
      router.refresh();
    } catch {
      setError("تعذر التحقق من صلاحيات الحساب. أعد المحاولة أو تواصل مع مدير النظام.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setSuccess("");
    const targetEmail = email.trim();
    if (!targetEmail || !targetEmail.includes("@")) {
      setError("أدخل البريد الإلكتروني أولاً ثم اضغط نسيت كلمة المرور.");
      return;
    }
    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/activate`,
    });
    if (resetError) {
      setError("تعذر إرسال رابط استعادة كلمة المرور. حاول مرة أخرى.");
      setResetLoading(false);
      return;
    }
    setSuccess("تم إرسال رابط استعادة كلمة المرور إلى بريدك. افتح أحدث رسالة ثم عيّن كلمة مرور جديدة.");
    setResetLoading(false);
  }

  async function useAnotherAccount() {
    const result = await supabase.auth.signOut();
    if (result.error) {
      setError("تعذر تسجيل الخروج. حاول مرة أخرى.");
      return;
    }
    setWrongWorkspace(false);
    setError("");
    setPassword("");
  }

  return (
    <main className={gateway.portal} dir="rtl">
      <header className={gateway.mast}>
        <GatewayMark />
        <Link className={styles.back} href="/">العودة إلى البوابة <span aria-hidden="true">←</span></Link>
      </header>
      <section className={styles.panel} aria-labelledby="login-title">
        <header className={styles.heading}>
          <WorkspaceSeal workspace={workspace} />
          <h1 id="login-title">{label}</h1>
          <p>تسجيل الدخول</p>
        </header>
        {checkingSession ? <p role="status">جاري التحقق من الجلسة…</p> : wrongWorkspace ? (
          <div className={styles.denied} role="status">
            <p>حسابك غير مخوّل بالدخول إلى هذه المساحة.</p>
            <button type="button" onClick={useAnotherAccount} className={styles.submit}>استخدام حساب آخر</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" dir="ltr" type="email" autoComplete="email" required value={email}
              onChange={event => setEmail(event.target.value)} />
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" dir="ltr" type="password" autoComplete="current-password" required
              minLength={6} value={password} onChange={event => setPassword(event.target.value)} />
            <button type="button" className={styles.forgot} disabled={resetLoading} onClick={handleForgotPassword}>
              {resetLoading ? "جاري إرسال الرابط…" : "نسيت كلمة المرور؟"}
            </button>
            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? "جاري تسجيل الدخول…" : "تسجيل الدخول"}
            </button>
          </form>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}
      </section>
    </main>
  );
}

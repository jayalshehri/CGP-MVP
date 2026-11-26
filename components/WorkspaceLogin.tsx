"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireProfile } from "@/lib/auth";
import Link from "next/link";
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

  if (checkingSession) {
    return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f4f7f8",color:"#0b1f33",fontFamily:"Arial, sans-serif"}}>جاري التحقق من الجلسة...</main>;
  }

  return (
    <main className="cgp-login" dir="rtl" style={{minHeight:"100vh",display:"grid",gridTemplateColumns:"minmax(0, 1.05fr) minmax(420px, 0.95fr)",background:"#f4f7f8",color:"#0b1f33",fontFamily:"Arial, sans-serif"}}>
      <section style={{padding:"72px",background:"linear-gradient(145deg, #071d30 0%, #0b3144 55%, var(--cgp-teal-dark) 100%)",color:"white",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:"100vh"}}>
        <div style={{fontWeight:800}}>CGP</div>
        <div><h1 style={{fontSize:"clamp(30px,4vw,48px)"}}>{label}</h1>
          <p>{workspace === "data" ? "متابعة متطلبات مؤشر نُضيء وأدلتها" : "متابعة الضوابط والمخاطر والالتزام السيبراني"}</p></div>
        <Link href="/">العودة إلى بوابة الحوكمة</Link>
      </section>

      <section style={{minHeight:"100vh",padding:"48px",display:"grid",placeItems:"center"}}>
        <div style={{width:"100%",maxWidth:"440px"}}>
          <div style={{background:"white",border:"1px solid #e1e7ea",borderRadius:"20px",boxShadow:"0 18px 60px rgba(11,31,51,0.08)",padding:"38px"}}>
            <h2 style={{margin:0,fontSize:"28px"}}>الدخول إلى {label}</h2>
            <p style={{color:"#71808e",margin:"10px 0 30px",lineHeight:1.7}}>استخدم حساب CGP المصرح لك به للدخول إلى المنصة.</p>
            {wrongWorkspace ? <div role="status">
              <p>حسابك غير مخوّل بالدخول إلى هذه المساحة.</p>
              <Link href="/">العودة لاختيار مساحة العمل</Link>
              <button type="button" onClick={async () => { const result = await supabase.auth.signOut(); if (!result.error) { setWrongWorkspace(false); setPassword(""); } }}>استخدام حساب آخر</button>
            </div> : <form onSubmit={handleSubmit}>
              <label htmlFor="email" style={{display:"block",fontSize:"14px",fontWeight:700,marginBottom:"8px"}}>البريد الإلكتروني</label>
              <input dir="ltr" id="email" type="email" autoComplete="email" required value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="name@company.com" style={{width:"100%",boxSizing:"border-box",border:"1px solid #ccd6dc",borderRadius:"10px",padding:"13px 14px",fontSize:"15px",marginBottom:"20px",background:"#fbfcfd"}}/>
              <label htmlFor="password" style={{display:"block",fontSize:"14px",fontWeight:700,marginBottom:"8px"}}>كلمة المرور</label>
              <input id="password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="••••••••" style={{width:"100%",boxSizing:"border-box",border:"1px solid #ccd6dc",borderRadius:"10px",padding:"13px 14px",fontSize:"15px",background:"#fbfcfd"}}/>
              <button type="button" onClick={handleForgotPassword} disabled={resetLoading} style={{border:0,background:"transparent",color:"var(--cgp-teal)",fontWeight:700,cursor:"pointer",padding:"12px 0 0",fontSize:"13px"}}>{resetLoading?"جاري إرسال الرابط...":"نسيت كلمة المرور؟"}</button>
              {error?<div role="alert" style={{marginTop:"16px",padding:"11px 13px",borderRadius:"9px",background:"#fff2f0",color:"#9d2e24",fontSize:"13px",lineHeight:1.6}}>{error}</div>:null}
              {success?<div style={{marginTop:"16px",padding:"11px 13px",borderRadius:"9px",background:"#edf8f5",color:"var(--cgp-teal-dark)",fontSize:"13px",lineHeight:1.7}}>{success}</div>:null}
              <button type="submit" disabled={loading} style={{width:"100%",border:0,borderRadius:"10px",background:loading?"#789c98":"var(--cgp-teal)",color:"white",padding:"14px 18px",marginTop:"24px",fontSize:"15px",fontWeight:800,cursor:loading?"not-allowed":"pointer"}}>{loading?"جاري تسجيل الدخول...":"دخول إلى CGP"}</button>
            </form>}
          </div>
          <p style={{textAlign:"center",color:"#475569",fontSize:"12px",marginTop:"18px"}}>الدخول متاح للمستخدمين المصرح لهم فقط.</p>
        </div>
      </section>
    </main>
  );
}

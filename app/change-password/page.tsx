"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setReady(true);
    })();
    return () => { mounted = false; };
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("تعذر تغيير كلمة المرور: " + updateError.message);
      setSaving(false);
      return;
    }
    setMessage("تم تغيير كلمة المرور بنجاح.");
    setSaving(false);
    setTimeout(() => router.replace("/"), 1000);
  }

  if (!ready) {
    return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>جاري التحقق من الجلسة...</main>;
  }

  return (
    <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33",padding:20}}>
      <section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #e2e7eb",borderRadius:18,padding:32,boxShadow:"0 14px 40px rgba(11,31,51,.08)"}}>
        <div style={{fontSize:23,fontWeight:800}}>Cyber Governance Platform</div>
        <div style={{color:"#0f7d73",fontWeight:800,marginTop:7}}>تغيير كلمة المرور</div>
        <p style={{color:"#687581",lineHeight:1.8}}>أنت مسجل الدخول. عيّن كلمة مرور جديدة لحسابك ثم احفظها.</p>
        {error && <div style={{background:"#fff2f0",color:"#9d2e24",padding:12,borderRadius:9,marginBottom:16,lineHeight:1.7}}>{error}</div>}
        {message && <div style={{background:"#e8f5f2",color:"#0f6f67",padding:12,borderRadius:9,marginBottom:16}}>{message}</div>}
        <form onSubmit={submit}>
          <label htmlFor="new-password" style={label}>كلمة المرور الجديدة</label>
          <input disabled={saving} id="new-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={input} autoComplete="new-password" />
          <label htmlFor="confirm-password" style={{...label,marginTop:18}}>تأكيد كلمة المرور</label>
          <input disabled={saving} id="confirm-password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={input} autoComplete="new-password" />
          <button disabled={saving} style={{width:"100%",marginTop:24,border:0,borderRadius:10,padding:13,background:"#0f7d73",color:"white",fontWeight:800,fontSize:15,cursor:"pointer"}}>{saving?"جاري الحفظ...":"حفظ كلمة المرور الجديدة"}</button>
        </form>
        <button type="button" onClick={()=>router.push("/")} style={{width:"100%",marginTop:12,border:0,background:"transparent",color:"#687581",cursor:"pointer"}}>العودة للوحة المتابعة</button>
      </section>
    </main>
  );
}

const label={display:"block",fontSize:14,fontWeight:700,marginBottom:8} as const;
const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #ccd6dc",borderRadius:10,padding:"12px 13px",fontSize:15};

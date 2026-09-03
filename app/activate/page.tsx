"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ActivatePage() {
  const router = useRouter();
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    async function init(){
      const {data}=await supabase.auth.getSession();
      if(data.session){setReady(true);return;}
      // Supabase invite links can return tokens in the URL hash. The browser client consumes them automatically.
      await new Promise(r=>setTimeout(r,700));
      const {data:retry}=await supabase.auth.getSession();
      setReady(Boolean(retry.session));
      if(!retry.session) setError("رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب من مدير النظام إعادة إرسال الدعوة.");
    }
    init();
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>{if(session){setReady(true);setError("");}});
    return ()=>listener.subscription.unsubscribe();
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault(); setError(""); setMessage("");
    if(password.length<8){setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");return;}
    if(password!==confirm){setError("كلمتا المرور غير متطابقتين.");return;}
    setSaving(true);
    const {error:updateError}=await supabase.auth.updateUser({password});
    if(updateError){setError("تعذر تعيين كلمة المرور: "+updateError.message);setSaving(false);return;}
    setMessage("تم تفعيل الحساب وتعيين كلمة المرور بنجاح.");
    setTimeout(()=>router.replace("/"),900);
  }

  return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33",padding:20}}>
    <section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #e2e7eb",borderRadius:18,padding:32,boxShadow:"0 14px 40px rgba(11,31,51,.08)"}}>
      <div style={{fontSize:23,fontWeight:800}}>Cyber Governance Platform</div>
      <div style={{color:"#0f7d73",fontWeight:800,marginTop:7}}>تفعيل حساب CGP</div>
      <p style={{color:"#687581",lineHeight:1.8}}>أنشئ كلمة مرور لحسابك لإكمال التفعيل والدخول إلى المنصة.</p>
      {error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:12,borderRadius:9,marginBottom:16,lineHeight:1.7}}>{error}</div>}
      {message&&<div style={{background:"#e8f5f2",color:"#0f6f67",padding:12,borderRadius:9,marginBottom:16}}>{message}</div>}
      <form onSubmit={submit}>
        <label style={label}>كلمة المرور الجديدة</label><input disabled={!ready||saving} type="password" value={password} onChange={e=>setPassword(e.target.value)} style={input} autoComplete="new-password" />
        <label style={{...label,marginTop:18}}>تأكيد كلمة المرور</label><input disabled={!ready||saving} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={input} autoComplete="new-password" />
        <button disabled={!ready||saving} style={{width:"100%",marginTop:24,border:0,borderRadius:10,padding:13,background:ready?"#0f7d73":"#9aa7ad",color:"white",fontWeight:800,fontSize:15,cursor:ready?"pointer":"not-allowed"}}>{saving?"جاري التفعيل...":"تفعيل الحساب"}</button>
      </form>
      <button type="button" onClick={()=>router.push("/login")} style={{width:"100%",marginTop:12,border:0,background:"transparent",color:"#687581",cursor:"pointer"}}>العودة لتسجيل الدخول</button>
    </section>
  </main>;
}
const label={display:"block",fontSize:14,fontWeight:700,marginBottom:8} as const;
const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #ccd6dc",borderRadius:10,padding:"12px 13px",fontSize:15};

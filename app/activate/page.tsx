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
    let validRecoveryContext = false;
    const hash = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.replace(/^#/,"")) : new URLSearchParams();
    const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const type = hash.get("type") || search.get("type");
    if(type === "recovery" || type === "invite") validRecoveryContext = true;

    const {data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
      if((event === "PASSWORD_RECOVERY" || validRecoveryContext) && session){
        setReady(true);
        setError("");
      }
    });

    (async()=>{
      await new Promise(r=>setTimeout(r,500));
      const {data}=await supabase.auth.getSession();
      if(validRecoveryContext && data.session){
        setReady(true);
      } else if(!validRecoveryContext){
        setReady(false);
        setError("افتح هذه الصفحة فقط من رابط دعوة أو استعادة كلمة مرور صالح. لن يتم تغيير كلمة مرور أي جلسة حالية.");
      } else if(!data.session){
        setError("رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.");
      }
    })();

    return ()=>listener.subscription.unsubscribe();
  },[]);

  async function submit(e:FormEvent){
    e.preventDefault(); setError(""); setMessage("");
    if(!ready){setError("لا يوجد رابط تفعيل أو استعادة صالح.");return;}
    if(password.length<8){setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");return;}
    if(password!==confirm){setError("كلمتا المرور غير متطابقتين.");return;}
    setSaving(true);
    const {error:updateError}=await supabase.auth.updateUser({password});
    if(updateError){setError("تعذر تعيين كلمة المرور: "+updateError.message);setSaving(false);return;}
    setMessage("تم تعيين كلمة المرور بنجاح.");
    setTimeout(()=>router.replace("/login"),900);
  }

  return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33",padding:20}}>
    <section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #e2e7eb",borderRadius:18,padding:32,boxShadow:"0 14px 40px rgba(11,31,51,.08)"}}>
      <div style={{fontSize:23,fontWeight:800}}>Cyber Governance Platform</div>
      <div style={{color:"#0f7d73",fontWeight:800,marginTop:7}}>تفعيل / استعادة حساب CGP</div>
      <p style={{color:"#687581",lineHeight:1.8}}>هذه الصفحة لا تسمح بتغيير كلمة المرور إلا عند فتحها من رابط دعوة أو استعادة صالح.</p>
      {error&&<div style={{background:"#fff2f0",color:"#9d2e24",padding:12,borderRadius:9,marginBottom:16,lineHeight:1.7}}>{error}</div>}
      {message&&<div style={{background:"#e8f5f2",color:"#0f6f67",padding:12,borderRadius:9,marginBottom:16}}>{message}</div>}
      <form onSubmit={submit}>
        <label style={label}>كلمة المرور الجديدة</label><input disabled={!ready||saving} type="password" value={password} onChange={e=>setPassword(e.target.value)} style={input} autoComplete="new-password" />
        <label style={{...label,marginTop:18}}>تأكيد كلمة المرور</label><input disabled={!ready||saving} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={input} autoComplete="new-password" />
        <button disabled={!ready||saving} style={{width:"100%",marginTop:24,border:0,borderRadius:10,padding:13,background:ready?"#0f7d73":"#9aa7ad",color:"white",fontWeight:800,fontSize:15,cursor:ready?"pointer":"not-allowed"}}>{saving?"جاري الحفظ...":"تعيين كلمة المرور"}</button>
      </form>
      <button type="button" onClick={()=>router.push("/login")} style={{width:"100%",marginTop:12,border:0,background:"transparent",color:"#687581",cursor:"pointer"}}>العودة لتسجيل الدخول</button>
    </section>
  </main>;
}
const label={display:"block",fontSize:14,fontWeight:700,marginBottom:8} as const;
const input={width:"100%",boxSizing:"border-box" as const,border:"1px solid #ccd6dc",borderRadius:10,padding:"12px 13px",fontSize:15};

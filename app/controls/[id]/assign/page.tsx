"use client";


import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Owner = { user_id: string; display_name: string | null; role: string; is_active: boolean };
type Control = { id: number; control_code: string; title_ar: string; control_owner_id: string | null; due_date: string | null };

export default function AssignControlPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [control, setControl] = useState<Control | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return router.replace("/login");

      const { data: me } = await supabase.from("profiles").select("role,is_active").eq("user_id", session.user.id).maybeSingle();
      if (!me || me.is_active === false || !["admin", "cybersecurity_team"].includes(me.role)) return router.replace(`/controls/${params.id}`);

      const [{ data: controlData, error: controlError }, { data: ownerData, error: ownerError }] = await Promise.all([
        supabase.from("controls").select("id,control_code,title_ar,control_owner_id,due_date").eq("id", Number(params.id)).single(),
        supabase.from("profiles").select("user_id,display_name,role,is_active").eq("role", "control_owner").eq("is_active", true).order("display_name"),
      ]);

      if (controlError || !controlData) { setError("تعذر تحميل الضابط."); setLoading(false); return; }
      if (ownerError) { setError("تعذر تحميل ملاك الضوابط."); setLoading(false); return; }

      setControl(controlData as Control);
      setOwners((ownerData ?? []) as Owner[]);
      setOwnerId(controlData.control_owner_id ?? "");
      setDueDate(controlData.due_date ?? "");
      setLoading(false);
    }
    load();
  }, [params.id, router]);

  async function save() {
    if (!control || !ownerId) { setError("اختر مالك الضابط أولاً."); return; }
    setSaving(true); setError("");
    const owner = owners.find((item) => item.user_id === ownerId);
    const { error: updateError } = await supabase.from("controls").update({
      control_owner_id: ownerId,
      control_owner: owner?.display_name || "Control Owner",
      due_date: dueDate || null,
    }).eq("id", control.id);
    if (updateError) { setError("تعذر حفظ التكليف: " + updateError.message); setSaving(false); return; }
    router.push(`/controls/${control.id}`);
    router.refresh();
  }

  if (loading) return <main dir="rtl" style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"Arial",background:"#f5f7f9"}}>جاري تحميل التكليف...</main>;

  return <main dir="rtl" style={{minHeight:"100vh",background:"#f5f7f9",fontFamily:"Arial",color:"#0b1f33"}}>

    <section className="cgp-page-body" style={{maxWidth:760,margin:"0 auto",padding:"42px 24px"}}>
      <div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:16,padding:30}}>
        <div style={{color:"#0f7d73",fontWeight:800,marginBottom:8}}>{control?.control_code}</div>
        <h1 style={{margin:"0 0 28px",fontSize:27}}>{control?.title_ar}</h1>
        {error && <div style={{background:"#fff2f0",color:"#9d2e24",padding:12,borderRadius:9,marginBottom:18}}>{error}</div>}
        <label htmlFor="control-owner" style={label}>مالك الضابط</label>
        <select id="control-owner" value={ownerId} onChange={(e)=>setOwnerId(e.target.value)} style={input}>
          <option value="">اختر المستخدم</option>
          {owners.map((owner)=><option key={owner.user_id} value={owner.user_id}>{owner.display_name || owner.user_id.slice(0,8)}</option>)}
        </select>
        {owners.length === 0 && <p style={{color:"#9a5700",fontSize:13}}>لا يوجد Control Owner نشط. أضف مستخدمًا من إدارة المستخدمين أولاً.</p>}
        <label htmlFor="due-date" style={{...label,marginTop:22}}>تاريخ الاستحقاق</label>
        <input id="due-date" type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} style={input}/>
        <button onClick={save} disabled={saving || owners.length===0} style={{marginTop:28,width:"100%",border:0,borderRadius:10,padding:"13px 18px",background:"#0f7d73",color:"white",fontWeight:800,fontSize:15,cursor:"pointer"}}>{saving?"جاري الحفظ...":"حفظ التكليف"}</button>
      </div>
    </section>
  </main>;
}

const label = {display:"block",fontSize:14,fontWeight:700,marginBottom:8} as const;
const input = {width:"100%",boxSizing:"border-box" as const,border:"1px solid #ccd6dc",borderRadius:10,padding:"12px 13px",fontSize:15,background:"white"};

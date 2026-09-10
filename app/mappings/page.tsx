"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Mapping={control_id:number;framework_code:string;control_code:string;control_title:string;relationship_type:string;source_note:string|null};
type Ecc={ecc_id:number;ecc_code:string;ecc_title:string};

export default function MappingsPage(){
 const router=useRouter();const [rows,setRows]=useState<Array<Mapping&Ecc>>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [query,setQuery]=useState("");
 useEffect(()=>{let active=true;(async()=>{try{await requireProfile(["admin","cybersecurity_team"]);const {data:controls,error:controlError}=await supabase.from("controls").select("id,control_code,title_ar,frameworks!inner(code)").eq("frameworks.code","ECC");if(controlError)throw controlError;const all=await Promise.all((controls??[]).map(async control=>{const {data,error}=await supabase.rpc("ecc_control_mappings",{p_ecc_control_id:control.id});if(error)throw error;return (data??[] as Mapping[]).map((item:Mapping)=>({...item,ecc_id:control.id,ecc_code:control.control_code,ecc_title:control.title_ar}));}));if(active)setRows(all.flat() as Array<Mapping&Ecc>);}catch(e){if(active){setError(e instanceof Error?e.message:"تعذر تحميل خريطة المواءمة");const {data}=await supabase.auth.getSession();if(!data.session)router.replace("/login");}}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[router]);
 const visible=rows.filter(row=>`${row.framework_code} ${row.control_code} ${row.control_title} ${row.ecc_title} ${row.ecc_code}`.toLowerCase().includes(query.toLowerCase()));
 if(loading)return <main dir="rtl" className="cgp-page-body" style={{padding:"38px 28px"}}>جاري تحميل خريطة المواءمة…</main>;
 return <main dir="rtl" className="cgp-page-body" style={{maxWidth:1300,margin:"0 auto",padding:"38px 28px 60px"}}><header style={{marginBottom:24}}><p style={{color:"#0f7d73",fontWeight:800,margin:0}}>قياس الالتزام</p><h1 style={{fontSize:32,margin:"8px 0"}}>خريطة مواءمة الضوابط</h1><p style={{color:"#586875",maxWidth:820}}>المواءمات أدناه مبنية على مراجع ECC الصريحة في نصوص أدوات الهيئة. مشاركة الدليل لا تعني اعتمادًا تلقائيًا؛ لكل ضابط قرار مراجعة مستقل.</p></header>{error?<p role="alert" style={{color:"#b42318"}}>{error}</p>:<><input aria-label="بحث في خريطة المواءمة" value={query} onChange={event=>setQuery(event.target.value)} placeholder="ابحث برقم الضابط أو عنوانه أو الإطار" style={{width:"100%",boxSizing:"border-box",padding:13,border:"1px solid #ccd6dc",borderRadius:10,marginBottom:16,fontFamily:"inherit"}}/><div style={{background:"white",border:"1px solid #e2e7eb",borderRadius:14,overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}><thead><tr style={{background:"#f5f8f8",textAlign:"right"}}><th style={cell}>ضابط ECC</th><th style={cell}>الضابط المرتبط</th><th style={cell}>نوع المواءمة</th><th style={cell}>إجراء</th></tr></thead><tbody>{visible.map(row=><tr key={`${row.ecc_id}-${row.control_id}`}><td style={cell}><strong dir="ltr">{row.ecc_code}</strong><br/><small>{row.ecc_title}</small></td><td style={cell}><strong dir="ltr">{row.framework_code} · {row.control_code}</strong><br/><small>{row.control_title}</small></td><td style={cell}>مرجع رسمي صريح</td><td style={cell}><Link href={`/controls/${row.ecc_id}`}>فتح ECC</Link></td></tr>)}</tbody></table>{!visible.length&&<p style={{padding:20}}>لا توجد مواءمات مطابقة.</p>}</div></>}</main>;
}
const cell={padding:"14px 16px",borderBottom:"1px solid #edf0f2",verticalAlign:"top" as const};

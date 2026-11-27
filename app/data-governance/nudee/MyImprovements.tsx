"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {readStrategyRows} from "@/lib/strategy-read";
import {formatRiyadhDate} from "@/lib/dates";

type Action={id:number;description:string;due_date:string;closed_at:string|null};
export default function MyImprovements({userId}:{userId:string}){
 const [rows,setRows]=useState<Action[]>([]),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  readStrategyRows<Action>((a,b)=>supabase.from("nudee_improvements").select("id,description,due_date,closed_at",{count:"exact"}).eq("owner_id",userId).is("closed_at",null).order("due_date").order("id").range(a,b),r=>r.id)
   .then(result=>{if(active){setRows(result.data);setError(result.error);}});
  return ()=>{active=false;};
 },[userId,attempt]);
 if(error)return <p role="alert">تعذر تحميل إجراءات التحسين. <button onClick={()=>setAttempt(n=>n+1)}>إعادة المحاولة</button></p>;
 return rows.length?<details className="nr-reference"><summary>إجراءات التحسين المسندة لي ({rows.length})</summary><ul>{rows.map(r=><li key={r.id}>{r.description} · الاستحقاق {formatRiyadhDate(r.due_date)}</li>)}</ul></details>:null;
}

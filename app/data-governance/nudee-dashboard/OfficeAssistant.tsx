"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { answerOffice, prompts, type Reply } from "./answerOffice";
import type { WorkItem } from "./officeWork";
import styles from "./daily.module.css";

type Turn = { question: string; reply: Reply };
export default function OfficeAssistant({items,today,userId}:{items:WorkItem[];today:string;userId:string}) {
  const [question,setQuestion]=useState("");
  const [turns,setTurns]=useState<Turn[]>([]);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const input=useRef<HTMLInputElement>(null);
  async function ask(value: string, preset=false) {
    const text=value.trim();
    if (!text || pending.current) return;
    pending.current=true;setBusy(true);
    try {
      const previous=preset ? undefined : turns.at(-1)?.reply.scope;
      const reply=await answerOffice(text,previous,items,today,userId);
      setTurns(history=>[...history,{question:text,reply}]);setQuestion("");
    } catch {
      setTurns(history=>[...history,{question:text,reply:{text:"تعذرت قراءة السجل. أعد إرسال السؤال للمحاولة مرة أخرى."}}]);
    } finally { pending.current=false;setBusy(false);input.current?.focus(); }
  }
  function submit(event:FormEvent){event.preventDefault();void ask(question);}
  const latest=turns.at(-1);
  function exchange(turn:Turn) {
    return <div className={styles.exchange}><strong>{turn.question}</strong><p>{turn.reply.text}</p>
      {turn.reply.sources && <div className={styles.sources}>{turn.reply.sources.map(s=><Link key={s.href} href={s.href}>{s.title} ←</Link>)}</div>}</div>;
  }
  return <section className={styles.assistant} aria-labelledby="assistant-title">
    <form onSubmit={submit} className={styles.ask}>
      <label htmlFor="office-question" id="assistant-title"><span aria-hidden="true">✦</span> مساعد المكتب</label>
      <input id="office-question" ref={input} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={320} autoComplete="off" placeholder="اسأل عن أعمال المكتب…"/>
      <button type="submit" disabled={busy||!question.trim()}>إرسال <span aria-hidden="true">←</span></button>
    </form>
    <div className={styles.prompts}>{prompts.map(q=><button type="button" key={q} disabled={busy} onClick={()=>void ask(q,true)}>{q}</button>)}</div>
    {turns.length>1&&<details className={styles.history}><summary>الأسئلة السابقة ({(turns.length-1).toLocaleString("ar-SA")})</summary>{turns.slice(0,-1).map((turn,i)=><div key={i}>{exchange(turn)}</div>)}</details>}
    <div aria-live="polite" aria-busy={busy}>{busy?<p>جارٍ قراءة السجل…</p>:latest&&exchange(latest)}</div>
    {latest&&<button className={styles.reset} disabled={busy} onClick={()=>{setTurns([]);setQuestion("");input.current?.focus();}}>محادثة جديدة</button>}
  </section>;
}

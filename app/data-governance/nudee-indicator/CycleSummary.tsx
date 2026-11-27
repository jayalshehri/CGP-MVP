"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "./indicator.module.css";

type Summary = { title: string; result: { outcome: string; reference: string } | null };

export default function CycleSummary({ revision }: { revision: number }) {
  const [state, setState] = useState<Summary | "loading" | "empty" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const cycle = await supabase.from("nudee_cycles").select("id,title").order("id", { ascending: false }).limit(1);
      if (cycle.error) throw cycle.error;
      const latest = cycle.data?.[0];
      if (!latest) { if (active) setState("empty"); return; }
      const result = await supabase.from("nudee_cycle_events").select("outcome,reference").eq("cycle_id", latest.id)
        .eq("kind", "result").eq("subject", "maturity").order("id", { ascending: false }).limit(1);
      if (result.error) throw result.error;
      if (active) setState({ title: latest.title, result: result.data?.[0] ?? null });
    }
    void load().catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [revision, attempt]);
  return <section className={styles.cycleLine} aria-label="آخر دورة تقييم مسجلة">
    <strong>آخر دورة تقييم مسجلة</strong>
    {state === "loading" ? <span role="status">جارٍ تحميل الدورة…</span>
      : state === "error" ? <span role="alert">تعذر تحميل ملخص الدورة. <button type="button"
        onClick={() => { setState("loading"); setAttempt(n => n+1); }}>إعادة المحاولة</button></span>
      : state === "empty" ? <span>لم تُسجَّل دورة بعد.</span>
      : <><span>{state.title}</span><span>{state.result
        ? <>نتيجة النضج الموثقة · <b>{state.result.outcome}</b> · {state.result.reference}</>
        : "بانتظار توثيق نتيجة النضج الصادرة عن سدايا"}</span></>}
  </section>;
}

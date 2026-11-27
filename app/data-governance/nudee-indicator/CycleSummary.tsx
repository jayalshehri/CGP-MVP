"use client";

import { useEffect, useState } from "react";
import { latestMaturity, type CycleMaturity } from "./latestMaturity";
import styles from "./indicator.module.css";

export default function CycleSummary() {
  const [state, setState] = useState<CycleMaturity | "loading" | "empty" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      const latest = await latestMaturity();
      if (active) setState(latest ?? "empty");
    }
    void load().catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt]);
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

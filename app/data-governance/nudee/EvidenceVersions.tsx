"use client";

import { useEffect, useState } from "react";
import ReviewFilePreview from "@/app/review/file-preview";
import { readStrategyRows } from "@/lib/strategy-read";
import { formatRiyadhDateTime } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

export type Submission = { id: number; assignment_id: number; file_name: string; storage_path: string; submitted_at: string; source_submission_id?: number | null; source_locator?: string | null };
type Decision = { id: number; submission_id: number | null; action: string; notes: string | null; created_at: string };

export default function EvidenceVersions({ files, selected, onSelect, status }: {
  files: Submission[]; selected: Submission; onSelect: (id: number) => void; status: string;
}) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const assignmentId = selected.assignment_id;
  useEffect(() => {
    let active = true;
    async function load() {
      const result = await readStrategyRows<Decision>((from, to) =>
        supabase.from("nudee_audit").select("id,submission_id,action,notes,created_at", { count: "exact" })
          .eq("assignment_id", assignmentId).in("action", ["approved", "changes_requested"])
          .order("id", { ascending: false }).range(from, to), row => row.id);
      if (active) { setDecisions(result.data); setFailed(result.error); }
    }
    void load();
    return () => { active = false; };
  }, [assignmentId, status, attempt]);

  const lastReturn = decisions.find(d => d.action === "changes_requested");
  return <section className="nr-detail-section nr-versions" aria-labelledby="nr-version-title">
    <h3 id="nr-version-title">نسخ الدليل</h3>
    {status === "submitted" && lastReturn?.notes && <p className="nr-return"><strong>سبب الإعادة السابقة</strong><br/>{lastReturn.notes}</p>}
    <div className="nr-version-list" aria-label="اختيار نسخة الدليل">{files.map((file, i) =>
      <button type="button" key={file.id} aria-pressed={selected.id === file.id} className="nr-version" onClick={() => onSelect(file.id)}>
        <strong>النسخة {files.length - i}{i === 0 && " · الأحدث"}</strong>
        <bdi dir="auto">{file.file_name}</bdi>
        <time dateTime={file.submitted_at}>{formatRiyadhDateTime(file.submitted_at)}</time>
      </button>)}</div>
    {selected.source_submission_id && <p>مرجع النسخة #{selected.source_submission_id} · موضع الإثبات: {selected.source_locator}</p>}
    <ReviewFilePreview key={selected.id} bucket="nudee-evidence" path={selected.storage_path} name={selected.file_name}/>
    {failed && <p role="alert">تعذر تحميل سجل القرارات. <button type="button" className="nr-secondary" onClick={() => setAttempt(n => n + 1)}>إعادة المحاولة</button></p>}
    {decisions.length > 0 && <details className="nr-decisions"><summary>سجل قرارات المكتب ({decisions.length})</summary><ol>
      {decisions.map(d => {
        const index = files.findIndex(file => file.id === d.submission_id);
        return <li key={d.id}><strong>{d.action === "approved" ? "اعتماد الدليل" : "إعادة للتعديل"}{index >= 0 && ` · النسخة ${files.length - index}`}</strong>
          <time dateTime={d.created_at}>{formatRiyadhDateTime(d.created_at)}</time>{d.notes && <p>{d.notes}</p>}
        </li>;
      })}</ol></details>}
  </section>;
}

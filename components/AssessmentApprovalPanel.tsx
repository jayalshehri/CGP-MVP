"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Result = { control_id: number; compliance_status: string; expected_compliance_date: string | null };
type Control = { id: number; control_code: string; title_ar: string };

type Props = { results: Result[]; controls: Control[]; onComplete: (message: string) => void };

const statusMap: Record<string, string> = {
  implemented: "implemented",
  partially_implemented: "in_progress",
  not_implemented: "not_started",
  not_applicable: "not_applicable",
};
const labelMap: Record<string, string> = {
  implemented: "مطبق كليًا",
  partially_implemented: "مطبق جزئيًا",
  not_implemented: "غير مطبق",
  not_applicable: "لا ينطبق",
};
const proposedMap: Record<string, string> = {
  implemented: "مطبق",
  partially_implemented: "قيد التنفيذ",
  not_implemented: "لم يبدأ",
  not_applicable: "لا ينطبق",
};

export function AssessmentApprovalPanel({ results, controls, onComplete }: Props) {
  const rows = useMemo(() => results
    .filter((result) => result.compliance_status in statusMap)
    .map((result) => ({ result, control: controls.find((control) => control.id === result.control_id) }))
    .filter((row): row is { result: Result; control: Control } => Boolean(row.control)), [results, controls]);
  const [selected, setSelected] = useState<number[]>(() => rows.map((row) => row.control.id));
  const [approving, setApproving] = useState(false);

  function toggle(id: number) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function approve() {
    if (!selected.length || approving) return;
    const confirmed = window.confirm(`سيتم اعتماد نتائج ${selected.length} ضابط وتحديث حالات تنفيذها. هل تريد المتابعة؟`);
    if (!confirmed) return;
    setApproving(true);
    const selectedRows = rows.filter((row) => selected.includes(row.control.id));
    const responses = await Promise.all(selectedRows.map(({ result, control }) => {
      const update: { implementation_status: string; due_date?: string | null } = { implementation_status: statusMap[result.compliance_status] };
      if (result.expected_compliance_date && ["partially_implemented", "not_implemented"].includes(result.compliance_status)) update.due_date = result.expected_compliance_date;
      return supabase.from("controls").update(update).eq("id", control.id);
    }));
    const failed = responses.filter((response) => response.error).length;
    setApproving(false);
    onComplete(failed ? `تم اعتماد ${selected.length - failed} ضابط، وتعذر تحديث ${failed} ضابط.` : `تم اعتماد نتائج ${selected.length} ضابط وتحديث حالات تنفيذها.`);
  }

  return (
    <section className="assessment-approval" aria-labelledby="assessment-approval-title">
      <div className="assessment-approval-head">
        <div>
          <span>اعتماد النتائج</span>
          <h2 id="assessment-approval-title">اعتماد نتائج التقييم في الضوابط</h2>
          <p>راجع النتائج ثم حدّد الضوابط المراد تحديث حالة تنفيذها فيها.</p>
        </div>
        <div className="assessment-approval-count"><strong>{rows.length}</strong><small>نتيجة جاهزة</small></div>
      </div>
      {!rows.length ? <p className="assessment-approval-empty">لا توجد نتائج محفوظة للاعتماد بعد.</p> : <details className="assessment-approval-review">
        <summary>مراجعة النتائج قبل الاعتماد <b>{selected.length} محدد</b></summary>
        <div className="assessment-approval-table">
          <div className="assessment-approval-row assessment-approval-table-head"><span>تحديد</span><span>الضابط</span><span>نتيجة القياس</span><span>الحالة المقترحة</span></div>
          {rows.map(({ result, control }) => <label className="assessment-approval-row" key={control.id}>
            <input type="checkbox" checked={selected.includes(control.id)} onChange={() => toggle(control.id)} />
            <span><b dir="ltr">{control.control_code}</b><small>{control.title_ar}</small></span>
            <span>{labelMap[result.compliance_status]}</span>
            <span className="assessment-approval-proposed">{proposedMap[result.compliance_status]}</span>
          </label>)}
        </div>
        <div className="assessment-approval-actions">
          <button type="button" className="cgp-primary-button" disabled={!selected.length || approving} onClick={() => void approve()}>{approving ? "جارٍ الاعتماد…" : `اعتماد النتائج المحددة (${selected.length})`}</button>
          <button type="button" className="assessment-approval-clear" onClick={() => setSelected([])}>إلغاء التحديد</button>
        </div>
      </details>}
    </section>
  );
}

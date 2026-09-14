"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type ComplianceStatus = "implemented" | "partially_implemented" | "not_implemented" | "not_applicable";

const statusMap: Record<ComplianceStatus, string> = {
  implemented: "implemented",
  partially_implemented: "in_progress",
  not_implemented: "not_started",
  not_applicable: "not_applicable",
};

const labelMap: Record<ComplianceStatus, string> = {
  implemented: "مطبق كليًا",
  partially_implemented: "مطبق جزئيًا",
  not_implemented: "غير مطبق",
  not_applicable: "لا ينطبق",
};

type Props = {
  controlId: number;
  complianceStatus?: string;
  expectedComplianceDate?: string | null;
  onComplete: (message: string) => void;
};

export function AssessmentControlSync({ controlId, complianceStatus, expectedComplianceDate, onComplete }: Props) {
  const [syncing, setSyncing] = useState(false);
  const status = complianceStatus as ComplianceStatus | undefined;
  if (!status || !(status in statusMap)) return null;
  const validStatus = status as ComplianceStatus;

  async function sync() {
    const confirmed = window.confirm(`سيتم تحديث حالة الضابط إلى «${labelMap[validStatus]}» من نتيجة القياس. هل تريد المتابعة؟`);
    if (!confirmed) return;
    setSyncing(true);
    const update: { implementation_status: string; due_date?: string | null } = { implementation_status: statusMap[validStatus] };
    if (expectedComplianceDate && ["partially_implemented", "not_implemented"].includes(validStatus)) update.due_date = expectedComplianceDate;
    const { error } = await supabase.from("controls").update(update).eq("id", controlId);
    setSyncing(false);
    onComplete(error ? `تعذر تحديث حالة الضابط: ${error.message}` : "تم تحديث حالة الضابط من نتيجة القياس. يبقى تقييم القياس محفوظًا كسجل مستقل.");
  }

  return (
    <button type="button" className="assessment-sync-button" disabled={syncing} onClick={() => void sync()}>
      {syncing ? "جارٍ التحديث…" : "اعتماد في الضابط"}
    </button>
  );
}

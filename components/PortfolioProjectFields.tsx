"use client";

import { durationLabels, emptyPortfolioForm, executionYear, executionYearLabels, ownerLabels, priorityLabels, statusLabels, workTypeLabels, type PortfolioForm } from "@/lib/project-portfolio";

export default function PortfolioProjectFields({ form, onChange, creating }: {
  form: PortfolioForm; onChange: (form: PortfolioForm) => void; creating: boolean;
}) {
  function set<K extends keyof PortfolioForm>(key: K, value: PortfolioForm[K]) {
    onChange({ ...form, [key]: value, ...(key === "executive_owner_code" && value !== "other" ? { executive_owner_other: "" } : {}) });
  }
  return <>
    {/* The project code is chosen at creation only; it is read-only when editing. */}
    <label>رمز المشروع<input required readOnly={!creating} aria-readonly={!creating} dir="ltr" value={form.project_code} onChange={e => { if (creating) set("project_code", e.target.value); }} />{!creating && <small>يُحدَّد الرمز عند الإنشاء ولا يُعدَّل لاحقًا.</small>}</label>
    <label>اسم المشروع<input required value={form.name_ar} onChange={e => set("name_ar", e.target.value)} /></label>
    <label>الأولوية<select required={creating} value={form.portfolio_priority} onChange={e => set("portfolio_priority", e.target.value as PortfolioForm["portfolio_priority"])}>
      <option value="">غير مصنّفة</option>{options(priorityLabels)}
    </select></label>
    <label>سنة التنفيذ<output>{executionYear(form.portfolio_priority) ? executionYearLabels[executionYear(form.portfolio_priority)!] : "تُشتق من الأولوية"}</output></label>
    <label>نوع العمل<select value={form.work_type} onChange={e => set("work_type", e.target.value as PortfolioForm["work_type"])}>
      <option value="">بانتظار التصنيف المعتمد</option>{options(workTypeLabels)}
    </select></label>
    <label>الجهة المالكة<select value={form.executive_owner_code} onChange={e => set("executive_owner_code", e.target.value as PortfolioForm["executive_owner_code"])}>
      <option value="">بانتظار التصنيف المعتمد</option>{options(ownerLabels)}
    </select></label>
    {form.executive_owner_code === "other" && <label>اسم الجهة/المالك التنفيذي<input required value={form.executive_owner_other} onChange={e => set("executive_owner_other", e.target.value)} /></label>}
    <label>قيمة المدة<input type="number" required={creating || Boolean(form.duration_unit)} min="0.000001" step="any" value={form.duration_value} onChange={e => set("duration_value", e.target.value)} /></label>
    <label>وحدة المدة<select required={creating || Boolean(form.duration_value)} value={form.duration_unit} onChange={e => set("duration_unit", e.target.value as PortfolioForm["duration_unit"])}>
      <option value="">غير محددة</option>{options(durationLabels)}
    </select></label>
    <label>الحالة<select disabled={creating} value={creating ? emptyPortfolioForm.status : form.status} onChange={e => set("status", e.target.value as PortfolioForm["status"])}>{options(statusLabels)}</select></label>
    <label>نسبة الإنجاز<input type="number" min="0" max="100" step="any" value={form.progress_percent} onChange={e => set("progress_percent", e.target.value)} /></label>
    <label className="wide">وصف المشروع<textarea rows={3} value={form.description_ar} onChange={e => set("description_ar", e.target.value)} /></label>
  </>;
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

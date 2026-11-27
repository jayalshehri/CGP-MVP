"use client";

import { durationLabels, executionYear, executionYearLabels, priorityLabels, statusLabels, workTypeLabels } from "@/lib/project-portfolio";
import type { ProjectForm } from "@/lib/strategy-project-fields";
import styles from "./PortfolioProjectFields.module.css";

const ownerLabels = { it: "تقنية المعلومات", cybersecurity: "الأمن السيبراني", dmo: "مكتب إدارة البيانات", other: "جهة أخرى" };
const yearLabels = { P1: executionYearLabels[1], P2: executionYearLabels[2], P3: executionYearLabels[3] };
const priorities = Object.fromEntries(Object.keys(priorityLabels).map(key => [key, `${yearLabels[key as keyof typeof yearLabels]} · ${key}`]));

export default function PortfolioProjectFields({ form, onChange, creating }: {
  form: ProjectForm; onChange: (form: ProjectForm) => void; creating: boolean;
}) {
  function set<K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) {
    onChange({ ...form, [key]: value, ...(key === "executive_owner_code" && value !== "other" ? { executive_owner_other: "" } : {}) });
  }
  const year = executionYear(form.portfolio_priority);
  return <>
    <label className="wide">اسم المشروع<input required autoFocus={creating} value={form.name_ar} onChange={e => set("name_ar", e.target.value)} /></label>
    <label>رمز المشروع<input required readOnly={!creating} aria-readonly={!creating} dir="ltr" value={form.project_code} onChange={e => { if (creating) set("project_code", e.target.value); }} />{!creating && <small>يُحدَّد الرمز عند الإنشاء ولا يُعدَّل لاحقًا.</small>}</label>
    <label>الأولوية<select required={creating} value={form.portfolio_priority} onChange={e => set("portfolio_priority", e.target.value as ProjectForm["portfolio_priority"])}>
      <option value="">{creating ? "اختر الأولوية" : "غير مصنّفة"}</option>{options(priorities)}
    </select>{!creating && year && <small>سنة التنفيذ <output>{executionYearLabels[year]}</output></small>}</label>
    <fieldset className={`wide ${styles.duration}`}>
      <legend>مدة المشروع</legend>
      <div className={styles.pair}>
        <label>القيمة<input type="number" required={creating || Boolean(form.duration_unit)} min="0.000001" step="any" value={form.duration_value} onChange={e => set("duration_value", e.target.value)} /></label>
        <label>الوحدة<select required={creating || Boolean(form.duration_value)} value={form.duration_unit} onChange={e => set("duration_unit", e.target.value as ProjectForm["duration_unit"])}>
          <option value="">{creating ? "اختر الوحدة" : "غير محددة"}</option>{options(durationLabels)}
        </select></label>
      </div>
    </fieldset>
    {!creating && <>
      <label>الحالة<select value={form.status} onChange={e => set("status", e.target.value as ProjectForm["status"])}>{options(statusLabels)}</select></label>
      <label>نسبة التقدم<input type="number" min="0" max="100" step="any" value={form.progress_percent} onChange={e => set("progress_percent", e.target.value)} /></label>
    </>}
    <details className={`wide ${styles.optional}`}>
      <summary>{creating ? "تفاصيل اختيارية" : "تفاصيل التخطيط والوصف"}</summary>
      <div className={styles.optionalBody}>
        <label>الجهة المالكة<select value={form.executive_owner_code} onChange={e => set("executive_owner_code", e.target.value as ProjectForm["executive_owner_code"])}>
          <option value="">غير محددة</option>{options(ownerLabels)}
        </select></label>
        <label>نوع العمل<select value={form.work_type} onChange={e => set("work_type", e.target.value as ProjectForm["work_type"])}>
          <option value="">غير محدد</option>{options(workTypeLabels)}
        </select></label>
        {form.executive_owner_code === "other" && <label className="wide">اسم الجهة<input required value={form.executive_owner_other} onChange={e => set("executive_owner_other", e.target.value)} /></label>}
        <label className="wide">النتيجة المستهدفة<textarea rows={2} value={form.target_outcome} onChange={e => set("target_outcome", e.target.value)} /></label>
        <label className="wide">وصف المشروع<textarea rows={2} value={form.description_ar} onChange={e => set("description_ar", e.target.value)} /></label>
      </div>
    </details>
    {creating && <p className={`wide ${styles.note}`}>يبدأ المشروع بحالة «مخطط» وتقدّم <bdi>0%</bdi>.</p>}
  </>;
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

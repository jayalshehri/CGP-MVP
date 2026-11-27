"use client";

import Link from "next/link";
import { projectCount } from "@/lib/arabic-count";
import { durationLabels, mappingCompletenessLabels, ownerLabels, priorityLabels, statusLabels, workTypeLabels } from "@/lib/project-portfolio";
import { archiveQueryValue, portfolioHref, registerState, updateStrategyQuery, updateStrategyQueryFields, type PortfolioOrigin, type StrategyQueryKey } from "@/lib/strategy-navigation";
import styles from "./portfolio-workspace.module.css";

type Params = Pick<URLSearchParams, "get">;
const emptyParams = new URLSearchParams();
const tabs: readonly [PortfolioOrigin, string][] = [["register", "السجل"], ["roadmap", "خارطة الطريق"], ["analysis", "تحليل المحفظة"]];
const scopes = { active: "غير المؤرشفة", archived: "المؤرشفة", all: "كل المشاريع" };
const owners = { ...ownerLabels, it: "تقنية المعلومات", cybersecurity: "الأمن السيبراني", dmo: "مكتب إدارة البيانات", unset: "بلا جهة مالكة" };
const phases = { ...priorityLabels, unset: "بلا أولوية" };
const durationChoices = { ...durationLabels, unset: "بلا مدة" };
const workTypes = { ...workTypeLabels, unset: "بلا تصنيف" };
const withAll = (all: string, options: Record<string, string>) => ({ all, ...options });

export function PortfolioTabs({ current, params }: { current: PortfolioOrigin; params: Params }) {
  return <nav className="roadmap-view-tabs" aria-label="أقسام المشاريع السيبرانية">
    {tabs.map(([origin, title]) => <Link key={origin} href={portfolioHref(origin, params)} className={current === origin ? "active" : undefined} aria-current={current === origin ? "page" : undefined}>{title}</Link>)}
  </nav>;
}

function Select({ label, value, choices, set }: { label: string; value: string; choices: Record<string, string>; set: (value: string) => void }) {
  return <label className={styles.field}><span>{label}</span><select value={value} onChange={event => set(event.target.value)}>
    {Object.entries(choices).map(([key, title]) => <option value={key} key={key}>{title}</option>)}
  </select></label>;
}

export function PortfolioFilters({ current, params, count, total }: { current: PortfolioOrigin; params: Params; count: number | null; total: number }) {
  const state = registerState(params);
  const phaseFromYear = state.execution_year === "all" || state.execution_year === "unset" ? state.execution_year : `P${state.execution_year}`;
  const conflictingPhases = state.priority !== "all" && phaseFromYear !== "all" && state.priority !== phaseFromYear;
  const phase = conflictingPhases ? "conflict" : state.priority === "all" ? phaseFromYear : state.priority;
  const setPhase = (value: string) => updateStrategyQueryFields({ priority: value, execution_year: "" });
  const chips: { key: string; title: string; clear: () => void }[] = [];
  const chip = (key: StrategyQueryKey, value: string, title: string) => {
    if (value && value !== "all") chips.push({ key, title, clear: () => updateStrategyQuery(key, "") });
  };
  if (state.archive !== "active") chip("archive", archiveQueryValue(state.archive), scopes[state.archive]);
  if (state.q.trim()) chip("q", state.q, `بحث: ${state.q.trim()}`);
  chip("owner", state.owner, owners[state.owner as keyof typeof owners] || state.owner);
  chip("status", state.status, statusLabels[state.status as keyof typeof statusLabels] || state.status);
  if (phase !== "all") chips.push({ key: "phase", title: conflictingPhases ? "الأولوية والسنة غير متطابقتين" : phases[phase as keyof typeof phases], clear: () => setPhase("all") });
  chip("work_type", state.work_type, workTypes[state.work_type as keyof typeof workTypes] || state.work_type);
  if (state.duration_unit !== "all") chips.push({ key: "duration_unit", title: durationChoices[state.duration_unit as keyof typeof durationChoices], clear: () => updateStrategyQueryFields({ duration_unit: "", duration_min: "", duration_max: "" }) });
  if (state.duration_min || state.duration_max) chips.push({ key: "duration", title: [state.duration_min && `من ${state.duration_min}`, state.duration_max && `إلى ${state.duration_max}`].filter(Boolean).join(" "), clear: () => updateStrategyQueryFields({ duration_min: "", duration_max: "" }) });
  chip("mapping", state.mapping, mappingCompletenessLabels[state.mapping as keyof typeof mappingCompletenessLabels] || state.mapping);

  const unitSelected = state.duration_unit !== "all" && state.duration_unit !== "unset";
  const select = (label: string, key: StrategyQueryKey, value: string, choices: Record<string, string>) =>
    <Select label={label} value={value} choices={choices} set={next => updateStrategyQuery(key, next)} />;
  return <section className={styles.filters} aria-label="تصفية المشاريع">
    <div className={styles.filterRow}>
      <label className={`${styles.field} ${styles.search}`}><span>بحث</span><input type="search" value={state.q} onChange={event => updateStrategyQuery("q", event.target.value)} placeholder="اسم المشروع أو رمزه" /></label>
      {select("الجهة المالكة", "owner", state.owner, withAll("كل الجهات", owners))}
      {select("الحالة", "status", state.status, withAll("كل الحالات", statusLabels))}
      <Select label="نطاق المحفظة" value={state.archive} choices={scopes} set={next => updateStrategyQuery("archive", archiveQueryValue(next))} />
    </div>
    <details className={styles.more}>
      <summary>فلاتر إضافية</summary>
      <div className={styles.advanced}>
        <Select label="سنة التنفيذ والأولوية" value={phase} choices={withAll("كل السنوات", conflictingPhases ? { ...phases, conflict: "اختيار غير متطابق" } : phases)} set={setPhase} />
        {select("نوع العمل", "work_type", state.work_type, withAll("كل الأنواع", workTypes))}
        {select("اكتمال الربط", "mapping", state.mapping, withAll("كل الحالات", mappingCompletenessLabels))}
        <Select label="وحدة المدة" value={state.duration_unit} choices={withAll("كل الوحدات", durationChoices)} set={next => updateStrategyQueryFields({ duration_unit: next, duration_min: "", duration_max: "" })} />
        {unitSelected && <>
          <label className={styles.field}><span>المدة من</span><input type="number" min={0} step="any" value={state.duration_min} onChange={event => updateStrategyQuery("duration_min", event.target.value)} /></label>
          <label className={styles.field}><span>المدة إلى</span><input type="number" min={0} step="any" value={state.duration_max} onChange={event => updateStrategyQuery("duration_max", event.target.value)} /></label>
        </>}
      </div>
    </details>
    {chips.length > 0 && <div className={styles.chips} aria-label="الفلاتر المطبّقة">
      {chips.map(({ key, title, clear }) => <button type="button" key={key} onClick={clear} aria-label={`إزالة فلتر ${title}`}><bdi>{title}</bdi><span aria-hidden="true">×</span></button>)}
      <Link href={portfolioHref(current, emptyParams)} scroll={false}>مسح الفلاتر</Link>
    </div>}
    <div className={styles.resultsBar}>
      <p role="status">{count === null ? "عدد النتائج غير متاح" : count !== total ? `عرض ${projectCount(count)} من أصل ${total} في هذا النطاق` : projectCount(count)}</p>
    </div>
  </section>;
}

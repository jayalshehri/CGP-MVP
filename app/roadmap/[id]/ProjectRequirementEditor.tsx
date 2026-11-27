"use client";

import { useEffect, useState, type FormEvent } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";
import { requireProfile } from "@/lib/auth";
import { controlFrameworkLabel, controlHeading } from "@/lib/control-presentation";
import { readStrategyRows } from "@/lib/strategy-read";
import { supabase } from "@/lib/supabase";
import styles from "./requirement-editor.module.css";

const coverageLabels = { partial: "جزئية", full: "كاملة", supporting: "داعم فقط" } as const;
type Coverage = keyof typeof coverageLabels;
type Mode = "existing" | "new";
type Requirement = { id: number; title_ar: string; requirement_code: string };
type Framework = { id: number; code: string; version: string };
type Control = { id: number; title_ar: string; control_code: string };
type DraftLink = { control: Control; framework: Framework; coverage: Coverage; reason: string };
const rpcMessages: Record<string, string> = {
  requirement_role: "ما عندك صلاحية إضافة متطلبات للمشروع.",
  requirement_project: "المشروع غير متاح للتعديل أو مؤرشف.",
  requirement_existing: "المتطلب لم يعد متاحًا للربط. افتح النموذج مرة أخرى.",
  requirement_duplicate: "هذا المتطلب مرتبط بالمشروع من قبل.",
  requirement_catalog: "تغيّر إصدار أحد الأطر أو أصبح الضابط غير متاح. افتح النموذج واختره من الكتالوج الحالي.",
  requirement_controls: "راجع الضوابط المختارة ونوع التغطية وسبب الربط لكل ضابط.",
  requirement_input: "راجع اسم المتطلب ونطاقه والتغطية المخططة.",
};

export default function ProjectRequirementEditor({ projectId, linkedIds, onClose, onSaved }: {
  projectId: number; linkedIds: number[]; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>("existing");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [chosenId, setChosenId] = useState("");
  const [frameworkId, setFrameworkId] = useState("");
  const [controlId, setControlId] = useState("");
  const [query, setQuery] = useState("");
  const [controlQuery, setControlQuery] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [coverage, setCoverage] = useState<Coverage>("partial");
  const [links, setLinks] = useState<DraftLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    async function read() {
      try {
        await requireProfile(["admin", "cybersecurity_team"]);
        const [r, f] = await Promise.all([
          readStrategyRows((from, to) => supabase.from("cybersecurity_requirements")
            .select("id,title_ar,requirement_code", { count: "exact" }).eq("status", "active")
            .is("project_scope_id", null).order("requirement_code").order("id").range(from, to), row => row.id),
          supabase.from("frameworks").select("id,code,version").eq("is_active", true).order("code"),
        ]);
        if (!live) return;
        if (r.status !== "COMPLETE" || f.error) throw new Error();
        setRequirements(r.data as Requirement[]);
        setFrameworks((f.data ?? []) as Framework[]);
      } catch {
        if (live) setCatalogError("تعذر تحميل كتالوج المتطلبات والأطر. أغلق النموذج وحاول مرة أخرى.");
      } finally {
        if (live) setLoading(false);
      }
    }
    void read();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!frameworkId) return;
    let live = true;
    async function read() {
      try {
        const result = await readStrategyRows((from, to) => supabase.from("controls")
          .select("id,control_code,title_ar", { count: "exact" }).eq("framework_id", Number(frameworkId))
          .order("control_code").order("id").range(from, to), row => row.id);
        if (!live) return;
        if (result.status !== "COMPLETE") throw new Error();
        setControls(result.data as Control[]);
      } catch {
        if (live) setControlError("تعذر تحميل ضوابط هذا الإطار. اختر الإطار مرة أخرى.");
      } finally {
        if (live) setControlLoading(false);
      }
    }
    void read();
    return () => { live = false; };
  }, [frameworkId]);

  const framework = frameworks.find(row => String(row.id) === frameworkId);
  const queryText = query.trim().toLowerCase();
  const candidates = requirements.filter(row => !linkedIds.includes(row.id) && `${row.requirement_code} ${row.title_ar}`.toLowerCase().includes(queryText));
  const controlQueryText = controlQuery.trim().toLowerCase();
  const remaining = controls.filter(row => !links.some(link => link.control.id === row.id)
    && `${row.control_code} ${controlHeading(framework?.code ?? "", row.control_code, row.title_ar)} ${row.title_ar}`.toLowerCase().includes(controlQueryText));
  const patchLink = (id: number, patch: Partial<Pick<DraftLink, "coverage" | "reason">>) =>
    setLinks(previous => previous.map(link => link.control.id === id ? { ...link, ...patch } : link));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || loading || catalogError) return;
    if (mode === "new" && controlId) {
      setError("اضغط «إضافة الضابط» للاحتفاظ بالضابط المختار أو امسح اختياره.");
      return;
    }
    if (!scope.trim() || (mode === "existing" ? !candidates.some(row => String(row.id) === chosenId) : !title.trim() || links.some(link => !link.reason.trim()))) {
      setError("أكمل نطاق العمل والحقول المطلوبة قبل الحفظ.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await requireProfile(["admin", "cybersecurity_team"]);
      const { error: writeError } = await supabase.rpc("save_project_requirement", {
        p_project_id: projectId,
        p_requirement_id: mode === "existing" ? Number(chosenId) : null,
        p_title: mode === "new" ? title.trim() : null,
        p_scope: scope.trim(),
        p_coverage: coverage,
        p_controls: mode === "new" ? links.map(link => ({
          control_id: link.control.id, framework_version: link.framework.version, coverage: link.coverage, reason: link.reason.trim(),
        })) : [],
      });
      if (writeError) {
        setError(rpcMessages[writeError.message] ?? "تعذر حفظ الربط. جرّب مرة أخرى.");
        return;
      }
      onSaved();
    } catch {
      setError("تعذر حفظ الربط ضمن صلاحياتك الحالية.");
    } finally {
      setBusy(false);
    }
  }

  return <AccessibleDialog backdropClassName="roadmap-dialog-backdrop" className={`roadmap-dialog ${styles.dialog}`} labelledBy="project-requirement-editor-title" busy={busy} onClose={onClose}>
    <header><div><h2 id="project-requirement-editor-title">إضافة متطلب أو ربط موجود</h2><p className={styles.hint}>الحفظ يسجّل ربطًا مخططًا، ولا يثبت تطبيق الضوابط أو تحقق الالتزام.</p></div><button type="button" disabled={busy} aria-label="إغلاق" onClick={onClose}>×</button></header>
    <form className={styles.form} onSubmit={save}>
      <div className={styles.mode} role="group" aria-label="طريقة إضافة المتطلب">
        <button type="button" disabled={busy} aria-pressed={mode === "existing"} onClick={() => { setMode("existing"); setError(""); }}>ربط متطلب موجود</button>
        <button type="button" disabled={busy} aria-pressed={mode === "new"} onClick={() => { setMode("new"); setError(""); }}>متطلب خاص بالمشروع</button>
      </div>
      {loading && <p className={styles.hint} role="status">جارٍ تحميل الكتالوج…</p>}
      {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
      <fieldset disabled={busy || loading || Boolean(catalogError)} className={styles.fields}>
        {mode === "existing" ? <>
          <label>بحث عن متطلب<input type="search" value={query} onChange={event => { setQuery(event.target.value); setChosenId(""); }} placeholder="الاسم أو الرمز" /></label>
          <label>المتطلب<select required value={chosenId} onChange={event => setChosenId(event.target.value)}>
            <option value="">{candidates.length ? "اختر متطلبًا" : "لا توجد متطلبات مطابقة قابلة للربط"}</option>
            {candidates.map(row => <option key={row.id} value={row.id}>{row.requirement_code} · {row.title_ar}</option>)}
          </select></label>
          <p className={styles.hint}>يرث المشروع ضوابط المتطلب كما هي. لا تتغير مواءماته ولا المشاريع الأخرى التي تستخدمه.</p>
        </> : <label>اسم المتطلب<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
        <label>نطاق العمل في هذا المشروع<textarea rows={2} required maxLength={2000} value={scope} onChange={event => setScope(event.target.value)} placeholder="ما الذي سيُنفَّذ، وعلى أي أنظمة أو أصول؟" /></label>
        <label>تغطية المشروع المخططة<select value={coverage} onChange={event => setCoverage(event.target.value as Coverage)}>{Object.entries(coverageLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {mode === "new" && <details className={styles.controls}>
          <summary>ربط ضوابط رسمية {links.length > 0 && `(${links.length})`}</summary>
          <div className={styles.picker}>
            <label>الإطار والإصدار<select value={frameworkId} onChange={event => {
              setFrameworkId(event.target.value); setControlId(""); setControlQuery(""); setControls([]); setControlError(""); setControlLoading(Boolean(event.target.value));
            }}>
              <option value="">اختر إطارًا</option>
              {frameworks.map(row => <option key={row.id} value={row.id}>{controlFrameworkLabel(row.code, row.version)}</option>)}
            </select></label>
            {framework && !controlLoading && !controlError && <label className={styles.controlSearch}>بحث عن ضابط<input type="search" value={controlQuery} onChange={event => { setControlQuery(event.target.value); setControlId(""); }} placeholder="اسم الضابط أو رقمه" /></label>}
            <label>الضابط<select value={controlId} disabled={!framework || controlLoading || !!controlError} onChange={event => setControlId(event.target.value)}>
              <option value="">{controlLoading ? "جارٍ التحميل…" : framework && !remaining.length ? "لا توجد ضوابط مطابقة" : "اختر ضابطًا"}</option>
              {remaining.map(row => <option key={row.id} value={row.id}>{row.control_code} · {controlHeading(framework?.code ?? "", row.control_code, row.title_ar)}</option>)}
            </select></label>
            <button type="button" className={styles.secondary} disabled={!controlId || !framework || links.length >= 24} onClick={() => {
              const control = remaining.find(row => String(row.id) === controlId);
              if (framework && control) { setLinks(previous => [...previous, { control, framework, coverage: "partial", reason: "" }]); setControlId(""); }
            }}>إضافة الضابط</button>
          </div>
          {controlError && <p className={styles.error} role="alert">{controlError}</p>}
          <p className={styles.hint}>النطاق المسجّل أعلاه ينطبق على الضوابط المختارة. إذا اختلف التنفيذ أو نطاق الأصول بشكل جوهري، أنشئ متطلبًا منفصلًا.</p>
          {links.map(link => <div className={styles.link} key={link.control.id}>
            <div className={styles.linkTitle}><bdi>{controlFrameworkLabel(link.framework.code, link.framework.version)} · {link.control.control_code}</bdi><strong>{controlHeading(link.framework.code, link.control.control_code, link.control.title_ar)}</strong><button type="button" className={styles.secondary} aria-label={`إزالة الضابط ${link.control.control_code}`} onClick={() => setLinks(previous => previous.filter(row => row.control.id !== link.control.id))}>إزالة</button></div>
            <label>تغطية المتطلب للضابط<select value={link.coverage} onChange={event => patchLink(link.control.id, { coverage: event.target.value as Coverage })}>{Object.entries(coverageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>سبب الربط<input maxLength={700} value={link.reason} onChange={event => patchLink(link.control.id, { reason: event.target.value })} /></label>
          </div>)}
        </details>}
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <footer><button className="roadmap-primary" disabled={busy || loading || Boolean(catalogError)}>{busy ? "جارٍ الحفظ…" : "حفظ الربط المخطط"}</button><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>إلغاء</button></footer>
    </form>
  </AccessibleDialog>;
}

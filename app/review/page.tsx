"use client";

import { formatRiyadhDate } from "@/lib/dates";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";
import StatusBadge from "@/components/StatusBadge";
import { requireProfile } from "@/lib/auth";
import { frameworkOf } from "@/lib/compliance";
import { getEccCatalogLabel } from "@/lib/ecc-catalog-labels";
import { type EvidenceRecord, isExpired } from "@/lib/grc";
import {
  awaitingReview, evidenceReviewKey, inReviewScope, matchesReviewTarget, parseReviewTarget,
  reviewDecisions, reviewRestriction, type ReviewDecision, type ReviewScope, type ReviewTarget,
} from "@/lib/evidence-review";
import { supabase } from "@/lib/supabase";
import ReviewFilePreview from "./file-preview";
import "./review.css";

type Control = { id: number; control_code: string; title_ar: string; official_text_ar: string | null; frameworks: unknown };
type ReviewRow = EvidenceRecord & { control: Control; framework: string; label: string; searchText: string };

const scopes: ReadonlyArray<{ key: ReviewScope; label: string; empty: string; note: string }> = [
  { key: "pending", label: "بانتظار القرار", empty: "لا توجد أدلة تنتظر قرارًا", note: "تظهر هنا الأدلة الحالية بانتظار المراجعة أو قيدها." },
  { key: "mine", label: "مراجعاتي", empty: "لا توجد أدلة مسندة إليك للمراجعة", note: "يمكنك الاطلاع على جميع الأدلة التي لم يصدر قرار بشأنها." },
  { key: "returned", label: "مطلوب استكمالها", empty: "لا توجد أدلة بانتظار الاستكمال", note: "تظهر هنا الأدلة التي أُعيدت إلى مقدّمها لاستكمالها." },
  { key: "history", label: "سجل القرارات", empty: "لا توجد قرارات مسجلة", note: "تظهر هنا قرارات القبول والرفض وطلبات الاستكمال السابقة." },
];

const titleOf = (row: EvidenceRecord) => row.evidence_name?.trim() || row.file_name?.trim() || `دليل ${row.id}`;
const normalize = (text: string) => text.trim().toLowerCase()
  .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
  .replace(/[‐-―−]/g, "-");
const formatDate = (value: string | null) => formatRiyadhDate(value, "غير محدد");
function reviewerName(row: EvidenceRecord, user: string, names: Record<string, string>, showDecision: boolean) {
  if (showDecision || !awaitingReview(row)) return row.reviewer_display_name || "غير موثق بالاسم";
  if (!row.assigned_reviewer) return "غير مسند";
  return row.assigned_reviewer === user ? "مسند إليّ" : names[row.assigned_reviewer] || "مراجع آخر";
}
const errorMessage = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : fallback;

export default function ReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [user, setUser] = useState("");
  const [myName, setMyName] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ReviewScope>("pending");
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const auth = await requireProfile(["admin", "cybersecurity_team"]).catch(cause => {
        setUser(""); setMyName(null); setRows([]); setNames({}); setNotes({});
        throw cause;
      });
      const [evidence, controls] = await Promise.all([
        supabase.rpc("grc_evidence_register"),
        supabase.from("controls").select("id,control_code,title_ar,official_text_ar,frameworks!inner(code,is_active)")
          .eq("frameworks.is_active", true),
      ]);
      if (evidence.error || controls.error) throw evidence.error || controls.error;
      const controlMap = new Map((controls.data ?? []).map(c => [c.id, c as Control]));
      const next = ((evidence.data ?? []) as EvidenceRecord[]).flatMap(row => {
        const control = controlMap.get(row.control_id);
        if (!control) return [];
        const framework = frameworkOf(control.frameworks).code;
        const label = (framework === "ECC" ? getEccCatalogLabel(control.control_code) : undefined)
          || control.title_ar.replace(/\s*[-–]\s*[\d-]+\s*$/, "").trim() || "الضابط المرتبط";
        const searchText = normalize(`${titleOf(row)} ${row.file_name ?? ""} ${control.control_code} ${label} ${control.title_ar} ${framework}`);
        return [{ ...row, control, framework, label, searchText }];
      });
      setUser(auth.user.id); setMyName(auth.profile.display_name);
      setRows(next);
      setError("");

      const assigned = [...new Set(next.flatMap(row => awaitingReview(row) && row.assigned_reviewer && row.assigned_reviewer !== auth.user.id ? [row.assigned_reviewer] : []))];
      if (assigned.length) {
        // The existing reviewer-directory RLS determines which names are available.
        const results = await Promise.allSettled(Array.from({ length: Math.ceil(assigned.length / 100) }, (_, index) =>
          supabase.from("profiles").select("user_id,display_name").in("user_id", assigned.slice(index * 100, index * 100 + 100))));
        setNames(Object.fromEntries(results.flatMap(result => result.status === "fulfilled"
          ? (result.value.data ?? []).flatMap(profile => profile.display_name ? [[profile.user_id, profile.display_name]] : []) : [])));
      } else setNames({});
    } catch (cause) { setError(errorMessage(cause, "تعذر تحميل المراجعات.")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const readHash = () => {
      setTarget(parseReviewTarget(window.location.hash)); setSelectedKey(null); setActionError("");
    };
    const start = setTimeout(() => { readHash(); void load(); }, 0);
    window.addEventListener("hashchange", readHash);
    return () => { clearTimeout(start); window.removeEventListener("hashchange", readHash); };
  }, [load]);

  const desiredRows = useMemo(() => target ? rows.filter(row => matchesReviewTarget(row, target)) : [], [rows, target]);
  const exact = target && desiredRows.length === 1 ? desiredRows[0] : null;
  const currentScope: ReviewScope = exact ? awaitingReview(exact) ? "pending"
    : inReviewScope(exact, "returned", user) ? "returned" : "history" : scope;
  const selected = selectedKey ? rows.find(row => evidenceReviewKey(row) === selectedKey) : exact;
  const searchQuery = normalize(search);
  const visible = (target ? desiredRows : rows.filter(row => inReviewScope(row, currentScope, user)))
    .filter(row => !searchQuery || row.searchText.includes(searchQuery))
    .sort((a, b) => currentScope === "history"
      ? (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? "") || b.id - a.id
      : (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? "") || a.id - b.id);
  const selectedVersions = selected?.evidence_group ? rows.filter(row =>
    row.evidence_group === selected.evidence_group && row.control_id === selected.control_id && evidenceReviewKey(row) !== evidenceReviewKey(selected)
  ).sort((a, b) => b.version_number - a.version_number || b.id - a.id) : [];

  function clearTarget() {
    if (target) {
      setTarget(null);
      if (parseReviewTarget(window.location.hash)) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }
  function closeDrawer() {
    if (lock.current) return;
    setScope(currentScope); setSelectedKey(null); setActionError(""); clearTarget();
  }
  function select(row: ReviewRow) { setSelectedKey(evidenceReviewKey(row)); setActionError(""); }
  function changeScope(next: ReviewScope) {
    setScope(next); setSelectedKey(null); setActionError(""); clearTarget();
  }
  async function start(row: ReviewRow) {
    if (lock.current || reviewRestriction(row, user) || row.status !== "pending_review" || row.link_id !== null) return;
    lock.current = true; setBusy(true); setActionError("");
    try {
      const result = await supabase.rpc("cgp_grc_command", {
        p_action: "start_review", p_control_id: row.control_id, p_data: { evidence_id: row.id },
      });
      if (result.error) throw result.error;
      setRows(previous => previous.map(item => evidenceReviewKey(item) === evidenceReviewKey(row) ? { ...item, status: "under_review" } : item));
      await load();
    } catch (cause) { setActionError(errorMessage(cause, "تعذر بدء المراجعة.")); }
    finally { lock.current = false; setBusy(false); }
  }
  async function decide(row: ReviewRow, decision: ReviewDecision) {
    if (lock.current || reviewRestriction(row, user) || (decision === "accepted" && isExpired(row.valid_until))) return;
    const key = evidenceReviewKey(row);
    const reason = notes[key]?.trim();
    if (!reason) { setActionError("اكتب مبرر القرار قبل الحفظ، بما في ذلك عند قبول الدليل."); return; }
    lock.current = true; setBusy(true); setActionError(""); setMessage("");
    try {
      const result = row.link_id !== null
        ? await supabase.rpc("cgp_review_shared_evidence_link", { p_link_id: row.link_id, p_decision: decision, p_notes: reason })
        : await supabase.rpc("cgp_review_evidence", { p_evidence_id: row.id, p_decision: decision, p_notes: reason });
      if (result.error) throw result.error;
      // Reflect only the decision acknowledged by the existing RPC and its exact control/link.
      setRows(previous => previous.map(item => evidenceReviewKey(item) === key
        ? { ...item, status: decision, review_notes: reason, reviewer_display_name: myName } : item));
      setNotes(previous => { const next = { ...previous }; delete next[key]; return next; });
      setScope(currentScope); setSelectedKey(null); clearTarget();
      setMessage("تم حفظ قرار الدليل. يُسجّل تقييم الضابط بشكل مستقل في دورة المراجعة.");
      await load();
    } catch (cause) { setActionError(errorMessage(cause, "تعذر حفظ القرار.")); }
    finally { lock.current = false; setBusy(false); }
  }

  if (loading) return <main className="workflow-page review-page" dir="rtl" role="status">جارٍ تحميل مراجعات الأدلة…</main>;
  const empty = scopes.find(item => item.key === currentScope)!;
  return <main className="workflow-page review-page" dir="rtl">
    <header className="review-header">
      <h1>مراجعة الأدلة</h1>
      <p>اتخذ قرارًا مستقلًا لكل ضابط، حتى لو كان الدليل مشتركًا. قبول الدليل لا يعني أن الضابط مطبّق.</p>
    </header>
    {error && <div className="review-notice review-error" role="alert">{error} <button type="button" className="review-button" onClick={() => void load()}>إعادة المحاولة</button></div>}
    {message && <p className="review-notice" role="status">{message}</p>}
    {user && <>
      <section className="review-toolbar" aria-label="تصفية قائمة المراجعة">
        <div className="review-quick" role="group" aria-label="قوائم مراجعة الأدلة">
          {scopes.map(item => <button key={item.key} aria-pressed={currentScope === item.key && !target} type="button" onClick={() => changeScope(item.key)}>
            {item.label} <span>{rows.filter(row => inReviewScope(row, item.key, user)).length}</span>
          </button>)}
        </div>
        <label className="review-search"><span>البحث في المراجعات</span><input type="search" value={search} dir="auto" onChange={e => setSearch(e.target.value)} placeholder="الدليل أو رقم الضابط"/></label>
      </section>
      {target && <div className="review-notice" role="status">{desiredRows.length > 1 ? "هذا الدليل مرتبط بأكثر من ضابط. اختر الصف الخاص بالضابط الذي تريد مراجعته."
        : !desiredRows.length ? "الدليل المطلوب غير متاح ضمن نطاقك." : "تعرض القائمة الدليل المحدد في الرابط."}
        <button type="button" className="review-button" onClick={() => changeScope(currentScope)}>عرض القائمة</button>
      </div>}
      {visible.length ? <table className="review-table" aria-label="قائمة مراجعة الأدلة" role="table">
        <colgroup><col/><col className="review-control-col"/><col className="review-status-col"/><col className="review-reviewer-col"/></colgroup>
        <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">الدليل</th><th scope="col" role="columnheader">الضابط</th>
          <th scope="col" role="columnheader">حالة المراجعة</th><th scope="col" role="columnheader">المراجع</th></tr></thead>
        <tbody role="rowgroup">{visible.map(row => <tr role="row" key={evidenceReviewKey(row)} id={`evidence-${evidenceReviewKey(row)}`}>
          <th scope="row" role="rowheader"><button type="button" className="review-row-trigger" aria-haspopup="dialog" onClick={() => select(row)}>
            <bdi dir="auto" title={titleOf(row)}>{titleOf(row)}</bdi>
            <small>الإصدار {row.version_number}{!row.is_current ? " · سابق" : ""}{row.link_id !== null ? " · مشترك" : ""}</small>
          </button></th>
          <td role="cell"><div className="review-control-line"><bdi className="review-code" dir="ltr">{row.framework} · {row.control.control_code}</bdi>
            <span title={row.label}>{row.label}</span></div></td>
          <td role="cell"><StatusBadge status={row.status ?? ""}/></td>
          <td role="cell"><span className="review-mobile-label" aria-hidden="true">المراجع</span><bdi>{reviewerName(row, user, names, currentScope === "history")}</bdi></td>
        </tr>)}</tbody>
      </table> : <div className="review-empty">
        <div><h2>{searchQuery ? "لا توجد نتائج مطابقة للبحث" : target ? "لا توجد نتائج لهذا الرابط" : empty.empty}</h2>
          <p>{searchQuery ? "جرّب البحث باسم الدليل أو رقم الضابط." : target ? "افتح القائمة للاطلاع على الأدلة المتاحة لك." : empty.note}</p></div>
        {searchQuery ? <button type="button" className="review-button" onClick={() => setSearch("")}>مسح البحث</button>
        : currentScope === "mine" && <button type="button" className="review-button" onClick={() => changeScope("pending")}>عرض الأدلة بانتظار القرار</button>}
      </div>}
    </>}

    {selected && <ReviewDrawer row={selected} versions={selectedVersions} reviewer={reviewerName(selected, user, names, false)}
      restriction={reviewRestriction(selected, user)} busy={busy} error={actionError} reason={notes[evidenceReviewKey(selected)] ?? ""}
      onReason={value => setNotes(previous => ({ ...previous, [evidenceReviewKey(selected)]: value }))}
      onDecision={decision => void decide(selected, decision)} onStart={() => void start(selected)} onVersion={select} onClose={closeDrawer}/>}
  </main>;
}

function ReviewDrawer({ row, versions, reviewer, restriction, busy, error, reason, onReason, onDecision, onStart, onVersion, onClose }: {
  row: ReviewRow; versions: ReviewRow[]; reviewer: string; restriction: string; busy: boolean; error: string; reason: string;
  onReason: (value: string) => void; onDecision: (decision: ReviewDecision) => void; onStart: () => void;
  onVersion: (row: ReviewRow) => void; onClose: () => void;
}) {
  const expired = isExpired(row.valid_until);
  const eligible = !restriction;
  return <AccessibleDialog labelledBy="review-drawer-title" backdropClassName="review-drawer-shell" className="review-drawer" busy={busy} onClose={onClose}>
    <header className="review-drawer-header">
      <div><bdi className="review-code" dir="ltr">{row.framework} · {row.control.control_code}</bdi>
        <h2 id="review-drawer-title"><bdi dir="auto">{titleOf(row)}</bdi></h2><p>{row.label}</p></div>
      <button type="button" className="review-button" disabled={busy} onClick={onClose} aria-label="إغلاق مساحة مراجعة الدليل">إغلاق</button>
    </header>

    <div className="review-drawer-grid">
      <ReviewFilePreview key={evidenceReviewKey(row)} path={row.file_path} name={row.file_name}/>
      <div className="review-context">
        <dl className="review-facts">
          <div><dt>حالة المراجعة</dt><dd><StatusBadge status={row.status ?? ""}/></dd></div>
          <div><dt>الإصدار</dt><dd>{row.version_number} · {row.is_current ? "الحالي" : "السابق"}</dd></div>
          <div><dt>مقدم الدليل</dt><dd><bdi>{row.uploader_name || "غير موثق بالاسم"}</bdi></dd></div>
          <div><dt>تاريخ الرفع</dt><dd>{formatDate(row.uploaded_at)}</dd></div>
          <div><dt>المراجع</dt><dd><bdi>{reviewer}</bdi></dd></div>
          <div><dt>تاريخ انتهاء الصلاحية</dt><dd>{formatDate(row.valid_until)} {expired && <span className="review-expired">منتهي الصلاحية</span>}</dd></div>
        </dl>
        {row.link_id !== null && <p className="review-inline-note">ملف مشترك. القرار أدناه خاص بالضابط المعروض فقط.</p>}
        {row.description && <section className="review-detail"><h3>وصف الدليل</h3><p dir="auto">{row.description}</p></section>}
        {row.control.official_text_ar && <details className="review-detail"><summary>النص الرسمي للضابط</summary><p>{row.control.official_text_ar}</p></details>}
        {!!versions.length && <details className="review-detail"><summary>إصدارات أخرى للدليل على هذا الضابط ({versions.length})</summary>
          <ul className="review-version-list">{versions.map(version => <li key={evidenceReviewKey(version)}>
            <button type="button" className="review-button" disabled={busy} onClick={() => onVersion(version)}>
              الإصدار {version.version_number} · {version.is_current ? "حالي" : "سابق"}
            </button><small>{formatDate(version.uploaded_at)}</small>
          </li>)}</ul>
        </details>}
        {(row.reviewed_at || row.review_notes) && <section className="review-detail review-recorded">
          <h3>قرار المراجعة المسجّل</h3><p>{formatDate(row.reviewed_at)} · <bdi>{row.reviewer_display_name || "غير موثق بالاسم"}</bdi></p>
          {row.review_notes && <p dir="auto">{row.review_notes}</p>}
        </section>}

        {error && <p className="review-notice review-error" role="alert">{error}</p>}
        {eligible ? <section className="review-decision" aria-label="اتخاذ قرار على الدليل">
          <h3>اتخاذ قرار بشأن الدليل</h3>
          <p>قبول الدليل لا يعتمد امتثال الضابط.</p>
          {row.link_id === null && row.status === "pending_review" &&
            <button type="button" className="review-button" disabled={busy} onClick={onStart}>بدء المراجعة</button>}
          {expired && <p className="review-inline-note">لا يمكن قبول دليل منتهي الصلاحية.</p>}
          <label><span>سبب القرار <small>مطلوب</small></span>
            <textarea value={reason} onChange={e => onReason(e.target.value)} disabled={busy} rows={3} placeholder="اكتب مبرر القرار لهذا الضابط."/>
          </label>
          <div className="review-decision-buttons">{reviewDecisions.map(decision => <button type="button" key={decision.value}
            className={`review-button review-decision-${decision.value}`}
            disabled={busy || !reason.trim() || (decision.value === "accepted" && expired)} onClick={() => onDecision(decision.value)}>
            {decision.label}
          </button>)}</div>
          {busy && <p role="status">جاري حفظ الإجراء…</p>}
        </section> : awaitingReview(row) && <p className="review-inline-note">{restriction}</p>}
        <Link className="review-button review-control-link" href={`/controls/${row.control_id}`}>فتح الضابط والدورة <span aria-hidden="true">←</span></Link>
      </div>
    </div>
  </AccessibleDialog>;
}

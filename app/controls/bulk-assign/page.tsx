"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { WorkflowHeading, WorkflowMetric } from "@/components/WorkflowUI";
import "./bulk-assign.css";

type Control = {
  id: number;
  control_code: string;
  title_ar: string;
  domain_ar: string;
  control_owner_id: string | null;
  control_owner: string | null;
  framework_id: number;
  frameworks: { code: string } | { code: string }[] | null;
};
type Framework = { id: number; code: string };
type Owner = { user_id: string; display_name: string | null };
type OpenItem = { control_id: number; kind: "cycle" | "request" };

const single = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default function BulkAssignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [controls, setControls] = useState<Control[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);

  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all"); // "all" | "unassigned" | a user_id
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [targetOwner, setTargetOwner] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      await requireProfile(["admin", "cybersecurity_team"]);
      const [c, f, o, cy, rq] = await Promise.all([
        supabase.from("controls").select("id,control_code,title_ar,domain_ar,control_owner_id,control_owner,framework_id,frameworks(code)").order("control_code"),
        supabase.from("frameworks").select("id,code").eq("is_active", true).order("id"),
        supabase.from("profiles").select("user_id,display_name").eq("role", "control_owner").eq("is_active", true).order("display_name"),
        supabase.from("control_review_cycles").select("control_id").eq("status", "open"),
        supabase.from("evidence_requests").select("control_id").in("status", ["open", "submitted", "changes_requested", "rejected"]),
      ]);
      if (c.error) throw c.error;
      if (f.error) throw f.error;
      if (o.error) throw o.error;
      setControls((c.data ?? []) as Control[]);
      setFrameworks((f.data ?? []) as Framework[]);
      setOwners((o.data ?? []) as Owner[]);
      const items: OpenItem[] = [
        ...((cy.data ?? []) as { control_id: number }[]).map((r) => ({ control_id: r.control_id, kind: "cycle" as const })),
        ...((rq.data ?? []) as { control_id: number }[]).map((r) => ({ control_id: r.control_id, kind: "request" as const })),
      ];
      setOpenItems(items);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر تحميل الضوابط.";
      setError(message);
      if (message.includes("تسجيل الدخول")) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openControlIds = useMemo(() => new Set(openItems.map((i) => i.control_id)), [openItems]);

  const domains = useMemo(() => {
    const fw = frameworks.find((f) => f.code === frameworkFilter);
    const scoped = fw ? controls.filter((c) => c.framework_id === fw.id) : controls;
    return [...new Set(scoped.map((c) => c.domain_ar).filter(Boolean))].sort();
  }, [controls, frameworks, frameworkFilter]);

  const filtered = useMemo(
    () =>
      controls.filter((c) => {
        const fwCode = single(c.frameworks)?.code;
        const matchesFramework = frameworkFilter === "all" || fwCode === frameworkFilter;
        const matchesDomain = domainFilter === "all" || c.domain_ar === domainFilter;
        const matchesOwner =
          ownerFilter === "all" || (ownerFilter === "unassigned" ? !c.control_owner_id : c.control_owner_id === ownerFilter);
        const matchesSearch = !search.trim() || `${c.control_code} ${c.title_ar} ${c.control_owner ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
        return matchesFramework && matchesDomain && matchesOwner && matchesSearch;
      }),
    [controls, frameworkFilter, domainFilter, ownerFilter, search],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((prev) => {
      const visibleIds = filtered.map((c) => c.id);
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedControls = controls.filter((c) => selected.has(c.id));
  const blocked = selectedControls.filter((c) => c.control_owner_id && openControlIds.has(c.id));
  const safeToAssign = selectedControls.filter((c) => !(c.control_owner_id && openControlIds.has(c.id)));

  async function confirmSave() {
    if (!targetOwner || !safeToAssign.length || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const owner = owners.find((o) => o.user_id === targetOwner);
      const ids = safeToAssign.map((c) => c.id);
      const { error: updateError } = await supabase
        .from("controls")
        .update({ control_owner_id: targetOwner, control_owner: owner?.display_name || "مالك الضابط" })
        .in("id", ids);
      if (updateError) throw updateError;
      setMessage(`تم تعيين ${ids.length} ضابطًا للمالك المحدد.${blocked.length ? ` تم تخطي ${blocked.length} ضابطًا بسبب دورة مراجعة أو طلب دليل مفتوح.` : ""}`);
      setSelected(new Set());
      setConfirming(false);
      setTargetOwner("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التعيين الجماعي.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="workflow-page" dir="rtl" role="status">جاري تحميل الضوابط…</main>;

  return (
    <main className="workflow-page bulk-assign-page" dir="rtl">
      <WorkflowHeading
        title="تعيين مالكي الضوابط الجماعي"
        description="اختر الضوابط غير المعينة أو أعد تعيينها، ثم حدد مالكًا واحدًا لكل التحديد."
        action={<Link className="workflow-button" href="/controls">العودة إلى مكتبة الضوابط ←</Link>}
      />
      {error && <p role="alert" className="cgp-shell-error">{error}</p>}
      {message && <p role="status">{message}</p>}

      <div className="workflow-metrics">
        <WorkflowMetric label="إجمالي الضوابط" value={controls.length} />
        <WorkflowMetric label="غير معيّنة" value={controls.filter((c) => !c.control_owner_id).length} tone="warning" />
        <WorkflowMetric label="محددة الآن" value={selected.size} tone="success" />
      </div>

      <section className="bulk-assign-filters">
        <label>
          <span>الإطار</span>
          <select value={frameworkFilter} onChange={(e) => { setFrameworkFilter(e.target.value); setDomainFilter("all"); }}>
            <option value="all">كل الأطر</option>
            {frameworks.map((f) => <option key={f.id} value={f.code}>{f.code}</option>)}
          </select>
        </label>
        <label>
          <span>المجال</span>
          <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="all">كل المجالات</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>
          <span>المالك الحالي</span>
          <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
            <option value="all">الكل</option>
            <option value="unassigned">غير معيّن فقط</option>
            {owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.display_name ?? o.user_id.slice(0, 8)}</option>)}
          </select>
        </label>
        <label className="bulk-assign-search">
          <span>بحث</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الضابط أو اسمه" />
        </label>
      </section>

      <section className="bulk-assign-table-wrap">
        <table className="bulk-assign-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))} onChange={toggleAllVisible} aria-label="تحديد الكل" /></th>
              <th>الضابط</th>
              <th>المجال</th>
              <th>المالك الحالي</th>
              <th>حالة الأمان</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const hasOpen = openControlIds.has(c.id);
              return (
                <tr key={c.id} className={selected.has(c.id) ? "is-selected" : ""}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`تحديد ${c.control_code}`} /></td>
                  <td><strong dir="ltr">{c.control_code}</strong><span>{c.title_ar}</span></td>
                  <td>{c.domain_ar}</td>
                  <td>{c.control_owner ?? "غير معيّن"}</td>
                  <td>{c.control_owner_id && hasOpen ? <em className="bulk-assign-unsafe">دورة/طلب مفتوح</em> : <em className="bulk-assign-safe">آمن</em>}</td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={5} className="bulk-assign-empty">لا توجد ضوابط مطابقة للفلاتر الحالية.</td></tr>}
          </tbody>
        </table>
      </section>

      {selected.size > 0 && (
        <section className="bulk-assign-action-bar">
          <label>
            <span>تعيين المحدد ({selected.size}) إلى</span>
            <select value={targetOwner} onChange={(e) => setTargetOwner(e.target.value)}>
              <option value="">اختر مالكًا</option>
              {owners.map((o) => <option key={o.user_id} value={o.user_id}>{o.display_name ?? o.user_id.slice(0, 8)}</option>)}
            </select>
          </label>
          <button className="workflow-button" disabled={!targetOwner} onClick={() => setConfirming(true)}>مراجعة وتأكيد ←</button>
        </section>
      )}

      {confirming && (
        <div className="bulk-assign-dialog-backdrop" role="presentation" onMouseDown={() => !saving && setConfirming(false)}>
          <section className="bulk-assign-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2>تأكيد التعيين الجماعي</h2>
            <p>المالك الجديد: <strong>{owners.find((o) => o.user_id === targetOwner)?.display_name ?? targetOwner}</strong></p>
            <p className="bulk-assign-safe-count">{safeToAssign.length} ضابطًا سيُعيَّن الآن بأمان.</p>
            {blocked.length > 0 && (
              <div className="bulk-assign-blocked-list">
                <p className="bulk-assign-unsafe">{blocked.length} ضابطًا لن يُعيَّن — لديه دورة مراجعة أو طلب دليل مفتوح مرتبط بالمالك الحالي. أغلق الدورة/الطلب أولًا أو تابع بدونها لتفادي ملكية غير متسقة.</p>
                <ul>{blocked.map((c) => <li key={c.id}><span dir="ltr">{c.control_code}</span> — {c.title_ar}</li>)}</ul>
              </div>
            )}
            <div className="bulk-assign-dialog-actions">
              <button type="button" disabled={saving} onClick={() => setConfirming(false)}>إلغاء</button>
              <button type="button" className="workflow-button" disabled={saving || !safeToAssign.length} onClick={() => void confirmSave()}>
                {saving ? "جاري الحفظ…" : `تأكيد تعيين ${safeToAssign.length} ضابطًا`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

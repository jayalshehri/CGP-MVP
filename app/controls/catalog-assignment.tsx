"use client";

import { useEffect, useState } from "react";
import AccessibleDialog from "@/components/AccessibleDialog";
import { loadControlAssignmentReview, saveControlOwnerAssignment, type AppliedControlOwner } from "@/lib/control-owner-assignment";

type Review = Awaited<ReturnType<typeof loadControlAssignmentReview>>;

export default function CatalogAssignment({ ids, onClose, onApplied }: {
  ids: number[];
  onClose: () => void;
  onApplied: (rows: AppliedControlOwner[], reviewedCount: number) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [target, setTarget] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadControlAssignmentReview(ids).then(result => {
      if (active) setReview(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل معاينة التعيين.");
    });
    return () => { active = false; };
  }, [ids, attempt]);

  const owner = review?.owners.find(person => person.user_id === target);
  const ready = review?.controls.filter(control => !control.blocked && (!target || control.control_owner_id !== target)) ?? [];
  const skipped = review?.controls.filter(control => control.blocked || (target && control.control_owner_id === target)) ?? [];
  function refreshReview() {
    setConfirming(false); setReview(null); setError(""); setTarget(""); setAttempt(n => n + 1);
  }
  async function save() {
    if (!confirming || !owner || !ready.length || saving) return;
    setSaving(true); setError("");
    try {
      const applied = await saveControlOwnerAssignment(ready, owner.user_id);
      onApplied(applied, ready.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التعيين.");
      setConfirming(false);
    } finally { setSaving(false); }
  }

  return <AccessibleDialog labelledBy="catalog-assignment-title" backdropClassName="catalog-assignment-backdrop"
    className="catalog-assignment-dialog" busy={saving} onClose={onClose}>
    <header>
      <h2 id="catalog-assignment-title">{confirming ? "تأكيد تعيين المالك" : "تعيين مالك للضوابط المحددة"}</h2>
      <p>{confirming ? "راجع الضوابط والمالك المختار قبل الحفظ." : `عدد الضوابط المحددة: ${ids.length}`}</p>
    </header>
    {error && <p className="catalog-assignment-error" role="alert">{error}</p>}
    {!review && !error && <p role="status">جاري تحميل الضوابط والملاك المؤهلين…</p>}
    {review && <>
      {confirming ? <p className="catalog-assign-target">المالك الجديد <strong><bdi>{owner?.display_name || "مالك الضابط"}</bdi></strong></p>
      : <label className="catalog-assign-picker">
        <span>المالك الجديد</span>
        <select value={target} onChange={e => setTarget(e.target.value)} disabled={saving || !review.owners.length}>
          <option value="">اختر مالكًا</option>
          {review.owners.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name || "مالك الضابط"}</option>)}
        </select>
        {!review.owners.length && <small>لا يوجد ملاك نشطون مؤهلون للتعيين.</small>}
      </label>}
      <div className="catalog-assignment-scroll">
        <h3>الضوابط المؤهلة <span>{ready.length}</span></h3>
        <ul>{ready.map(control => <li key={control.id}>
          <bdi className="catalog-code" dir="ltr">{control.control_code}</bdi>
          <div><strong>{control.title_ar}</strong><small>المالك الحالي <bdi>{control.control_owner || "غير معيّن"}</bdi></small></div>
        </li>)}</ul>
        {!!skipped.length && <><h3>لن يتغيّر مالكها <span>{skipped.length}</span></h3>
          <ul>{skipped.map(control => <li key={control.id}>
            <bdi className="catalog-code" dir="ltr">{control.control_code}</bdi>
            <div><strong>{control.title_ar}</strong><small>{control.blocked ? "لديه دورة مراجعة أو طلب دليل مفتوح" : "معيّن لهذا المالك بالفعل"}</small></div>
          </li>)}</ul>
        </>}
      </div>
    </>}
    <footer>
      <button type="button" disabled={saving} onClick={confirming ? () => setConfirming(false) : onClose}>{confirming ? "رجوع" : "إلغاء"}</button>
      {error ? <button type="button" onClick={refreshReview}>تحديث المعاينة</button>
      : confirming ? <button type="button" className="catalog-assignment-primary" disabled={saving || !ready.length} onClick={() => void save()}>{saving ? "جاري الحفظ…" : `تأكيد تعيين ${ready.length} ضابطًا`}</button>
      : <button type="button" className="catalog-assignment-primary" disabled={!owner || !ready.length} onClick={() => setConfirming(true)}>مراجعة التعيين</button>}
    </footer>
  </AccessibleDialog>;
}

"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";

type Asset = { id: number; asset_code: string; name_ar: string };
type Assessment = {
  id: number;
  assessment_date: string;
  assessor_name: string;
  completeness_score: number;
  accuracy_score: number;
  consistency_score: number;
  timeliness_score: number;
  data_assets: { name_ar: string; asset_code: string }[] | null;
};
const score = (row: Assessment) =>
  Math.round(
    ((row.completeness_score +
      row.accuracy_score +
      row.consistency_score +
      row.timeliness_score) /
      20) *
      100,
  );
export default function DataQualityPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rows, setRows] = useState<Assessment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const savingLock = useRef(false);
  const [form, setForm] = useState({
    asset_id: "",
    assessor_name: "",
    completeness_score: "3",
    accuracy_score: "3",
    consistency_score: "3",
    timeliness_score: "3",
    notes: "",
  });
  const load = useCallback(async () => {
    await requireProfile(["admin", "data_governance_team"]);
    const [{ data: a, error: ae }, { data: q, error: qe }] = await Promise.all([
      supabase
        .from("data_assets")
        .select("id,asset_code,name_ar")
        .order("name_ar"),
      supabase
        .from("data_quality_assessments")
        .select(
          "id,assessment_date,assessor_name,completeness_score,accuracy_score,consistency_score,timeliness_score,data_assets(name_ar,asset_code)",
        )
        .order("assessment_date", { ascending: false }),
    ]);
    if (ae || qe) throw ae || qe;
    setAssets((a ?? []) as Asset[]);
    setRows((q ?? []) as Assessment[]);
    setReady(true);
    setRefreshError("");
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => load()).catch(() => {
      if (active) setRefreshError("تعذر تحميل السجل. تحقق من الاتصال وصلاحية حسابك ثم أعد المحاولة.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    if (savingLock.current) return;
    setLoading(true);
    try { await load(); }
    catch { setRefreshError("تعذر تحديث السجل. تحقق من الاتصال ثم أعد المحاولة."); }
    finally { setLoading(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (savingLock.current || !ready || refreshError) return;
    savingLock.current = true;
    setSaving(true); setError(""); setNotice("");
    try {
      await requireProfile(["admin", "data_governance_team"]);
      const { error } = await supabase
        .from("data_quality_assessments")
        .insert({
          ...form,
          asset_id: Number(form.asset_id),
          completeness_score: Number(form.completeness_score),
          accuracy_score: Number(form.accuracy_score),
          consistency_score: Number(form.consistency_score),
          timeliness_score: Number(form.timeliness_score),
        });
      if (error) throw error;
      setNotice("تم حفظ تقييم الجودة بنجاح.");
      setOpen(false);
      setForm({
        asset_id: "",
        assessor_name: "",
        completeness_score: "3",
        accuracy_score: "3",
        consistency_score: "3",
        timeliness_score: "3",
        notes: "",
      });
      try { await load(); }
      catch { setRefreshError("تم الحفظ، لكن تعذر تحديث السجل. حدّث البيانات لعرض النتيجة."); }
    } catch {
      setError("تعذر تأكيد الحفظ. احتفظنا بالحقول؛ حدّث السجل للتحقق من وصوله قبل إعادة المحاولة.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return (
    <main className="dg-page" dir="rtl">
      <div className="workflow-heading">
        <div>
          <span>جودة البيانات</span>
          <h1>سجل تقييم جودة البيانات</h1>
          <p>
            قياس قابل للتتبع لاكتمال البيانات ودقتها واتساقها وحداثتها لكل أصل
            بيانات.
          </p>
        </div>
        <button
          className="workflow-button workflow-primary"
          disabled={!ready || loading || saving || !!refreshError}
          onClick={() => setOpen((v) => !v)}
        >
          + تقييم جديد
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {refreshError && <p role="status">{refreshError}</p>}
      {(error || refreshError) && <button type="button" disabled={loading || saving} onClick={refresh}>تحديث السجل</button>}
      {open && (
        <form className="asset-form" onSubmit={submit} aria-busy={saving}>
          <fieldset className="asset-fields" disabled={saving} style={{border:0,padding:0,margin:0}}>
            <label>
              أصل البيانات
              <select
                required
                value={form.asset_id}
                onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
              >
                <option value="">اختر الأصل</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name_ar} — {a.asset_code}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المقيّم
              <input
                required
                value={form.assessor_name}
                onChange={(e) =>
                  setForm({ ...form, assessor_name: e.target.value })
                }
              />
            </label>
            {(
              [
                "completeness_score",
                "accuracy_score",
                "consistency_score",
                "timeliness_score",
              ] as const
            ).map((field, index) => (
              <label key={field}>
                {["الاكتمال", "الدقة", "الاتساق", "الحداثة"][index]}
                <select
                  value={form[field]}
                  onChange={(e) =>
                    setForm({ ...form, [field]: e.target.value })
                  }
                >
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v} من 5
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="wide">
              ملاحظات
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </fieldset>
          <footer>
            <button
              disabled={saving || !!refreshError}
              className="workflow-button workflow-primary"
            >
              {saving ? "جاري الحفظ…" : "حفظ التقييم"}
            </button>
          </footer>
        </form>
      )}
      <section className="assets-table-wrap" aria-busy={loading}>
        <table className="assets-table">
          <thead>
            <tr>
              <th>أصل البيانات</th>
              <th>النتيجة</th>
              <th>المقيّم</th>
              <th>تاريخ التقييم</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={4}>جاري تحميل السجل…</td></tr> : rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>
                      {row.data_assets?.[0]?.name_ar || "أصل محذوف"}
                    </strong>
                    <small>{row.data_assets?.[0]?.asset_code}</small>
                  </td>
                  <td>
                    <span
                      className={
                        score(row) >= 80
                          ? "dg-score good"
                          : score(row) >= 60
                            ? "dg-score warn"
                            : "dg-score risk"
                      }
                    >
                      {score(row)}%
                    </span>
                  </td>
                  <td>{row.assessor_name}</td>
                  <td>{row.assessment_date}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>
                  {refreshError ? "لم تتوفر بيانات السجل بعد." : "لا توجد تقييمات جودة. أضف أصل بيانات ثم سجّل أول تقييم."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

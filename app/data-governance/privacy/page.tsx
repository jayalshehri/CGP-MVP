"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";
type Asset = { id: number; name_ar: string };
type Activity = {
  id: number;
  activity_code: string;
  activity_name: string;
  processing_purpose: string;
  legal_basis: string;
  contains_sensitive_data: boolean;
  cross_border_transfer: boolean;
  status: string;
  owner_name: string;
  data_assets: { name_ar: string }[] | null;
};
const labels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمد",
  retired: "متوقف",
};
export default function PrivacyPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rows, setRows] = useState<Activity[]>([]);
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
    activity_name: "",
    processing_purpose: "",
    legal_basis: "",
    data_categories: "",
    data_subject_categories: "",
    contains_sensitive_data: false,
    retention_period: "",
    recipients: "",
    cross_border_transfer: false,
    owner_name: "",
  });
  const load = useCallback(async () => {
    await requireProfile(["admin", "data_governance_team"]);
    const [{ data: a, error: assetError }, { data: p, error }] = await Promise.all([
      supabase.from("data_assets").select("id,name_ar").order("name_ar"),
      supabase
        .from("privacy_processing_activities")
        .select(
          "id,activity_code,activity_name,processing_purpose,legal_basis,contains_sensitive_data,cross_border_transfer,status,owner_name,data_assets(name_ar)",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (assetError || error) throw assetError || error;
    setAssets((a ?? []) as Asset[]);
    setRows((p ?? []) as Activity[]);
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
        .from("privacy_processing_activities")
        .insert({
          ...form,
          activity_code: "PA-" + Date.now(),
          asset_id: form.asset_id ? Number(form.asset_id) : null,
        });
      if (error) throw error;
      setNotice("تم حفظ نشاط المعالجة بنجاح.");
      setOpen(false);
      setForm({
        asset_id: "",
        activity_name: "",
        processing_purpose: "",
        legal_basis: "",
        data_categories: "",
        data_subject_categories: "",
        contains_sensitive_data: false,
        retention_period: "",
        recipients: "",
        cross_border_transfer: false,
        owner_name: "",
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
          <span>الخصوصية</span>
          <h1>سجل أنشطة معالجة البيانات الشخصية</h1>
          <p>
            توثيق الغرض والمسوغ النظامي وفئات البيانات والاحتفاظ والنقل لكل نشاط
            معالجة.
          </p>
        </div>
        <button
          className="workflow-button workflow-primary"
          disabled={!ready || loading || saving || !!refreshError}
          onClick={() => setOpen((v) => !v)}
        >
          + نشاط معالجة
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
              اسم النشاط
              <input
                required
                value={form.activity_name}
                onChange={(e) =>
                  setForm({ ...form, activity_name: e.target.value })
                }
              />
            </label>
            <label>
              مالك النشاط
              <input
                required
                value={form.owner_name}
                onChange={(e) =>
                  setForm({ ...form, owner_name: e.target.value })
                }
              />
            </label>
            <label>
              أصل البيانات
              <select
                value={form.asset_id}
                onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
              >
                <option value="">غير مرتبط بأصل</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المسوغ النظامي
              <input
                required
                value={form.legal_basis}
                onChange={(e) =>
                  setForm({ ...form, legal_basis: e.target.value })
                }
              />
            </label>
            <label className="wide">
              غرض المعالجة
              <textarea
                required
                rows={2}
                value={form.processing_purpose}
                onChange={(e) =>
                  setForm({ ...form, processing_purpose: e.target.value })
                }
              />
            </label>
            <label>
              فئات البيانات
              <input
                required
                value={form.data_categories}
                onChange={(e) =>
                  setForm({ ...form, data_categories: e.target.value })
                }
              />
            </label>
            <label>
              فئات أصحاب البيانات
              <input
                value={form.data_subject_categories}
                onChange={(e) =>
                  setForm({ ...form, data_subject_categories: e.target.value })
                }
              />
            </label>
            <label>
              مدة الاحتفاظ
              <input
                value={form.retention_period}
                onChange={(e) =>
                  setForm({ ...form, retention_period: e.target.value })
                }
              />
            </label>
            <label>
              هل توجد بيانات حساسة؟
              <select
                value={String(form.contains_sensitive_data)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contains_sensitive_data: e.target.value === "true",
                  })
                }
              >
                <option value="false">لا</option>
                <option value="true">نعم</option>
              </select>
            </label>
            <label>
              هل يوجد نقل خارج المملكة؟
              <select
                value={String(form.cross_border_transfer)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cross_border_transfer: e.target.value === "true",
                  })
                }
              >
                <option value="false">لا</option>
                <option value="true">نعم</option>
              </select>
            </label>
          </fieldset>
          <footer>
            <button
              disabled={saving || !!refreshError}
              className="workflow-button workflow-primary"
            >
              {saving ? "جاري الحفظ…" : "حفظ النشاط"}
            </button>
          </footer>
        </form>
      )}
      <section className="assets-table-wrap" aria-busy={loading}>
        <table className="assets-table">
          <thead>
            <tr>
              <th>النشاط</th>
              <th>الأصل</th>
              <th>المالك</th>
              <th>بيانات حساسة</th>
              <th>نقل خارجي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6}>جاري تحميل السجل…</td></tr> : rows.length ? (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.activity_name}</strong>
                    <small>{x.activity_code}</small>
                  </td>
                  <td>{x.data_assets?.[0]?.name_ar || "—"}</td>
                  <td>{x.owner_name}</td>
                  <td>{x.contains_sensitive_data ? "نعم" : "لا"}</td>
                  <td>{x.cross_border_transfer ? "نعم" : "لا"}</td>
                  <td>
                    <span className="asset-class internal">
                      {labels[x.status]}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>{refreshError ? "لم تتوفر بيانات السجل بعد." : "لا توجد أنشطة معالجة مسجلة."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

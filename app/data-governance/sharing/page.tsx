"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";
type Asset = { id: number; name_ar: string };
type Request = {
  id: number;
  request_code: string;
  requester_name: string;
  recipient_entity: string;
  sharing_purpose: string;
  legal_basis: string;
  status: string;
  data_assets: { name_ar: string }[] | null;
};
const statuses: Record<string, string> = {
  draft: "مسودة",
  submitted: "مقدم",
  steward_review: "مراجعة أمين البيانات",
  governance_review: "مراجعة الحوكمة",
  approved: "معتمد",
  rejected: "مرفوض",
  closed: "مغلق",
};
export default function SharingPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [rows, setRows] = useState<Request[]>([]);
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
    requester_name: "",
    recipient_entity: "",
    sharing_purpose: "",
    data_categories: "",
    legal_basis: "",
    sharing_method: "",
  });
  const load = useCallback(async () => {
    await requireProfile(["admin", "data_governance_team"]);
    const [{ data: a, error: assetError }, { data: s, error }] = await Promise.all([
      supabase.from("data_assets").select("id,name_ar").order("name_ar"),
      supabase
        .from("data_sharing_requests")
        .select(
          "id,request_code,requester_name,recipient_entity,sharing_purpose,legal_basis,status,data_assets(name_ar)",
        )
        .order("created_at", { ascending: false }),
    ]);
    if (assetError || error) throw assetError || error;
    setAssets((a ?? []) as Asset[]);
    setRows((s ?? []) as Request[]);
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
        .from("data_sharing_requests")
        .insert({
          ...form,
          request_code: "DS-" + Date.now(),
          asset_id: form.asset_id ? Number(form.asset_id) : null,
        });
      if (error) throw error;
      setNotice("تم حفظ طلب المشاركة بنجاح.");
      setOpen(false);
      setForm({
        asset_id: "",
        requester_name: "",
        recipient_entity: "",
        sharing_purpose: "",
        data_categories: "",
        legal_basis: "",
        sharing_method: "",
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
          <span>المشاركة</span>
          <h1>طلبات مشاركة البيانات</h1>
          <p>
            سجل مستقل لطلب المشاركة ومراجعته واعتماده، مرتبط بأصل البيانات
            والمسوغ النظامي.
          </p>
        </div>
        <button
          className="workflow-button workflow-primary"
          disabled={!ready || loading || saving || !!refreshError}
          onClick={() => setOpen((v) => !v)}
        >
          + طلب مشاركة
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
              مقدم الطلب
              <input
                required
                value={form.requester_name}
                onChange={(e) =>
                  setForm({ ...form, requester_name: e.target.value })
                }
              />
            </label>
            <label>
              الجهة المستفيدة
              <input
                required
                value={form.recipient_entity}
                onChange={(e) =>
                  setForm({ ...form, recipient_entity: e.target.value })
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
              غرض المشاركة
              <textarea
                required
                rows={2}
                value={form.sharing_purpose}
                onChange={(e) =>
                  setForm({ ...form, sharing_purpose: e.target.value })
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
              طريقة المشاركة
              <input
                value={form.sharing_method}
                onChange={(e) =>
                  setForm({ ...form, sharing_method: e.target.value })
                }
              />
            </label>
          </fieldset>
          <footer>
            <button
              disabled={saving || !!refreshError}
              className="workflow-button workflow-primary"
            >
              {saving ? "جاري الحفظ…" : "إرسال للمراجعة"}
            </button>
          </footer>
        </form>
      )}
      <section className="assets-table-wrap" aria-busy={loading}>
        <table className="assets-table">
          <thead>
            <tr>
              <th>الطلب</th>
              <th>الأصل</th>
              <th>الجهة المستفيدة</th>
              <th>المسوغ النظامي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5}>جاري تحميل السجل…</td></tr> : rows.length ? (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    <strong>{x.requester_name}</strong>
                    <small>{x.request_code}</small>
                  </td>
                  <td>{x.data_assets?.[0]?.name_ar || "—"}</td>
                  <td>{x.recipient_entity}</td>
                  <td>{x.legal_basis}</td>
                  <td>
                    <span className="asset-class internal">
                      {statuses[x.status]}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>{refreshError ? "لم تتوفر بيانات السجل بعد." : "لا توجد طلبات مشاركة مسجلة."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

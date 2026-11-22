"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import "../data-governance.css";

type Asset = { id: number; asset_code: string; name_ar: string; data_owner: string; data_steward: string | null; classification: string; contains_personal_data: boolean; quality_status: string; sharing_status: string };
const emptyForm = { asset_code: "", name_ar: "", data_owner: "", data_steward: "", classification: "internal", contains_personal_data: false, quality_status: "not_assessed", sharing_status: "internal_only" };

export default function DataAssets() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    await requireProfile(["admin", "data_governance_team"]);
    const { data, error: loadError } = await supabase.from("data_assets").select("*").order("name_ar");
    if (loadError) throw loadError;
    setRows((data ?? []) as Asset[]);
    setReady(true);
    setRefreshError("");
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => load()).catch(() => {
      if (active) setRefreshError("تعذر تحميل أصول البيانات. تحقق من الاتصال وصلاحية حسابك ثم أعد المحاولة.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  async function refresh() {
    if (savingLock.current) return;
    setLoading(true);
    try { await load(); }
    catch { setRefreshError("تعذر تحديث أصول البيانات. تحقق من الاتصال ثم أعد المحاولة."); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingLock.current || !ready || refreshError) return;
    savingLock.current = true;
    setSaving(true); setError(""); setNotice("");
    try {
      await requireProfile(["admin", "data_governance_team"]);
      const { error: insertError } = await supabase.from("data_assets").insert(form);
      if (insertError) {
        setError(insertError.code === "23505"
          ? "رمز الأصل مسجل بالفعل. تحقق من السجل قبل تغيير الرمز أو إعادة الإرسال."
          : "تعذر تأكيد حفظ الأصل. احتفظنا بالحقول؛ حدّث السجل للتحقق من وصوله قبل إعادة المحاولة.");
        return;
      }
      setNotice("تم حفظ أصل البيانات بنجاح.");
      setOpen(false);
      setForm(emptyForm);
      // A failed refresh must not turn a committed insert into a failed save.
      try { await load(); }
      catch { setRefreshError("تم حفظ الأصل، لكن تعذر تحديث السجل. حدّث البيانات لعرضه."); }
    } catch {
      setError("تعذر تأكيد حفظ الأصل. احتفظنا بالحقول؛ حدّث السجل للتحقق من وصوله قبل إعادة المحاولة.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return <main className="dg-page" dir="rtl">
    <div className="workflow-heading"><div><span>سجل البيانات</span><h1>أصول البيانات</h1><p>سجل موحد لملكية البيانات وتصنيفها وجودتها ومشاركتها.</p></div><button className="workflow-button workflow-primary" disabled={!ready || loading || saving || !!refreshError} onClick={() => setOpen(!open)}>+ إضافة أصل بيانات</button></div>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {refreshError && <p role="status">{refreshError}</p>}
    {(error || refreshError) && <button type="button" disabled={loading || saving} onClick={refresh}>تحديث السجل</button>}
    {open && <form className="asset-form" onSubmit={submit} aria-busy={saving}>
      <fieldset className="asset-fields" disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
        <label>الرمز<input required value={form.asset_code} onChange={e => setForm({ ...form, asset_code: e.target.value })} /></label>
        <label>اسم الأصل<input required value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} /></label>
        <label>مالك البيانات<input required value={form.data_owner} onChange={e => setForm({ ...form, data_owner: e.target.value })} /></label>
        <label>أمين البيانات<input value={form.data_steward} onChange={e => setForm({ ...form, data_steward: e.target.value })} /></label>
        <label>التصنيف<select value={form.classification} onChange={e => setForm({ ...form, classification: e.target.value })}><option value="public">عام</option><option value="internal">داخلي</option><option value="confidential">سري</option><option value="restricted">سري للغاية</option></select></label>
        <label>بيانات شخصية<select value={String(form.contains_personal_data)} onChange={e => setForm({ ...form, contains_personal_data: e.target.value === "true" })}><option value="false">لا</option><option value="true">نعم</option></select></label>
      </fieldset>
      <footer><button disabled={saving || !!refreshError} className="workflow-button workflow-primary">{saving ? "جاري الحفظ…" : "حفظ الأصل"}</button></footer>
    </form>}
    <section className="assets-table-wrap" aria-busy={loading}><table className="assets-table"><thead><tr><th>الأصل</th><th>المالك</th><th>التصنيف</th><th>بيانات شخصية</th><th>الجودة</th><th>المشاركة</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={6}>جاري تحميل أصول البيانات…</td></tr> : rows.length ? rows.map(x => <tr key={x.id}><td><strong>{x.name_ar}</strong><small>{x.asset_code}</small></td><td>{x.data_owner}</td><td>{x.classification}</td><td>{x.contains_personal_data ? "نعم" : "لا"}</td><td>{x.quality_status}</td><td>{x.sharing_status}</td></tr>) : <tr><td colSpan={6}>{refreshError ? "لم تتوفر بيانات السجل بعد." : "لا توجد أصول بيانات مسجلة."}</td></tr>}
    </tbody></table></section>
  </main>;
}

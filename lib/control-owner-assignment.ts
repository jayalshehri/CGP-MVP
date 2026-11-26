import { requireProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const controlAssignmentRoles = ["admin", "cybersecurity_team"] as const;
export const openEvidenceRequestStatuses = ["open", "submitted", "changes_requested", "rejected"] as const;
export type AssignableOwner = { user_id: string; display_name: string | null };
type OwnerSnapshot = { id: number; control_owner_id: string | null };
export type AssignmentControl = OwnerSnapshot & {
  control_code: string;
  title_ar: string;
  control_owner: string | null;
  blocked: boolean;
};
export type AppliedControlOwner = { id: number; control_owner_id: string; control_owner: string | null };

export async function listAssignableControlOwners(): Promise<AssignableOwner[]> {
  const { data, error } = await supabase.from("profiles").select("user_id,display_name")
    .eq("role", "control_owner").eq("is_active", true).order("display_name");
  if (error) throw new Error("تعذر تحميل قائمة الملاك المتاحين.");
  return (data ?? []) as AssignableOwner[];
}

async function readSelectedControls(ids: number[]): Promise<AssignmentControl[]> {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("حدد ضوابط صالحة للتعيين.");
  }
  const rows = new Map<number, AssignmentControl>();
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    const [controls, cycles, requests] = await Promise.all([
      supabase.from("controls").select("id,control_code,title_ar,control_owner_id,control_owner,frameworks!inner(is_active)")
        .in("id", batch).eq("frameworks.is_active", true),
      supabase.from("control_review_cycles").select("control_id").in("control_id", batch).eq("status", "open"),
      supabase.from("evidence_requests").select("control_id").in("control_id", batch).in("status", openEvidenceRequestStatuses),
    ]);
    if (controls.error || cycles.error || requests.error) {
      throw new Error("تعذر التحقق من الضوابط المحددة أو من الدورات وطلبات الأدلة المفتوحة. أعد المحاولة.");
    }
    const open = new Set([...(cycles.data ?? []), ...(requests.data ?? [])].map(row => row.control_id));
    for (const c of controls.data ?? []) {
      rows.set(c.id, {
        id: c.id,
        control_code: c.control_code,
        title_ar: c.title_ar,
        control_owner_id: c.control_owner_id,
        control_owner: c.control_owner,
        blocked: Boolean(c.control_owner_id && open.has(c.id)),
      });
    }
  }
  if (rows.size !== unique.length) {
    throw new Error("تغيرت إتاحة بعض الضوابط المحددة. أغلق نافذة التعيين وحدد الضوابط مرة أخرى.");
  }
  return unique.map(id => rows.get(id)!);
}

export async function loadControlAssignmentReview(ids: number[]) {
  await requireProfile(controlAssignmentRoles);
  const [owners, controls] = await Promise.all([listAssignableControlOwners(), readSelectedControls(ids)]);
  return { owners, controls };
}

export async function saveControlOwnerAssignment(reviewed: OwnerSnapshot[], ownerId: string): Promise<AppliedControlOwner[]> {
  await requireProfile(controlAssignmentRoles);
  if (!ownerId || !reviewed.length) throw new Error("اختر المالك والضوابط قبل تأكيد التعيين.");
  const [owner, current] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", ownerId)
      .eq("role", "control_owner").eq("is_active", true).maybeSingle(),
    readSelectedControls(reviewed.map(control => control.id)),
  ]);
  if (owner.error || !owner.data) throw new Error("المالك المختار غير متاح للتعيين الآن.");
  const expected = new Map(reviewed.map(control => [control.id, control.control_owner_id]));
  if (current.some(control => control.blocked || expected.get(control.id) !== control.control_owner_id)) {
    throw new Error("تغيرت ملكية أحد الضوابط أو ظهرت دورة مراجعة أو طلب دليل مفتوح. حدّث المعاينة قبل التأكيد.");
  }
  let update = supabase.from("controls")
    .update({ control_owner_id: ownerId, control_owner: owner.data.display_name || "مالك الضابط" })
    .in("id", current.map(control => control.id));
  const ownersBefore = new Set(current.map(control => control.control_owner_id));
  if (ownersBefore.size === 1) {
    const previous = current[0].control_owner_id;
    update = previous === null ? update.is("control_owner_id", null) : update.eq("control_owner_id", previous);
  }
  const result = await update.select("id,control_owner_id,control_owner");
  if (result.error) throw new Error("تعذر حفظ التعيين الجماعي. لم تُعرض أي نتيجة كناجحة.");
  if (!result.data?.length) throw new Error("لم يتم تعيين أي ضابط. حدّث المعاينة وأعد المحاولة.");
  return result.data as AppliedControlOwner[];
}

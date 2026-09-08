export const IMPLEMENTED = new Set(["implemented", "compliant"]);
export const VERIFIED = new Set(["verified", "approved"]);
export const EVIDENCE_PRESENT = new Set(["uploaded", "pending_review", "under_review", "accepted", "approved", "verified"]);

export function isImplemented(value?: string | null) {
  return IMPLEMENTED.has((value || "").toLowerCase());
}

export function isVerified(value?: string | null) {
  return VERIFIED.has((value || "").toLowerCase());
}

export function isApplicable(value?: string | null) {
  return (value || "").toLowerCase() !== "not_applicable";
}

export function percentage(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function frameworkOf(value: unknown) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return { code: "—", name_ar: "غير مصنف" };
  const row = relation as { code?: unknown; name_ar?: unknown };
  return {
    code: typeof row.code === "string" ? row.code : "—",
    name_ar: typeof row.name_ar === "string" ? row.name_ar : "غير مصنف",
  };
}

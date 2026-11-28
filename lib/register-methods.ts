export const LEGACY_RISK = "legacy_nca_workbook";
export const NFCRM_RISK = "nfcrm_1_2025";
export const legacyLevel = (s: number | null, top = "حرج") =>
  s === null ? "غير مقيّم" : s <= 3 ? "منخفض جدًا" : s <= 6 ? "منخفض" : s <= 10 ? "متوسط" : s <= 16 ? "مرتفع" : top;
export const nfcrmLevel = (s: number | null) =>
  s === null ? "غير مقيّم" : s <= 2 ? "منخفض جدًا" : s <= 7 ? "منخفض" : s <= 14 ? "متوسط" : s <= 19 ? "مرتفع" : "كارثي";
export const riskLevel = (s: number | null, method: string) => method === NFCRM_RISK ? nfcrmLevel(s) : legacyLevel(s);
export const riskTone = (s: number | null, method: string) => {
  const level = riskLevel(s, method);
  return level === "حرج" || level === "كارثي" ? "danger" : level === "مرتفع" || level === "متوسط" ? "warn" : s === null ? "neutral" : "good";
};
export const severityValues: [string,string][] = ["1","2","3","4","5"].map((x,i)=>[x, `${x} — ${["منخفض جدًا","منخفض","متوسط","مرتفع","شديد"][i]}`]);
export const likelihoodValues: [string,string][] = ["1","2","3","4","5"].map((x,i)=>[x, `${x} — ${["نادر جدًا","نادر","غير مرجّح","مرجّح","شبه مؤكد"][i]}`]);
export const recordId = (value: string | null) => value && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
export const httpLink = (url: string | null) => {
  if (!url) return null;
  try { const u = new URL(url); return ["https:","http:"].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
};

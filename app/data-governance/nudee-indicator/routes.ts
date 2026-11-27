export const indicatorPath = "/data-governance/nudee-indicator";
export const cyclesPath = indicatorPath + "?tab=cycles";

export function evidenceLink(filters: Record<string, string | number> = {}) {
  const query = new URLSearchParams({ tab: "evidence" });
  for (const [key, value] of Object.entries(filters)) query.set(key, String(value));
  return indicatorPath + "?" + query.toString();
}

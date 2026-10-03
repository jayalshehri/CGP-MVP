// Presentation-only URL contract. Never used to authorize or identify a record in a query.
export const projectTabs = ["overview", "requirements", "controls", "evidence", "treatments", "audit"] as const;
const origins = {
  register: { path: "/roadmap", label: "سجل المشاريع السيبرانية" },
  roadmap: { path: "/roadmap/dashboard", label: "خارطة طريق المشاريع" },
  analysis: { path: "/roadmap/analysis", label: "تحليل المحفظة السيبرانية" },
  executive: { path: "/roadmap/executive", label: "ملخص محفظة المشاريع السيبرانية" },
} as const;
export type ProjectOrigin = keyof typeof origins;
type Params = Pick<URLSearchParams, "get">;
const choice = (value: string | null, allowed: readonly string[], fallback = "all") =>
  value !== null && allowed.includes(value) ? value : fallback;

export function projectIdFromPath(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function registerState(params: Params) {
  return {
    q: params.get("q") ?? "",
    year: choice(params.get("year"), ["2027", "2028", "2029"]),
    status: choice(params.get("status"), ["planned", "in_progress", "on_hold", "completed"]),
    priority: choice(params.get("priority"), ["high", "medium", "low"]),
  };
}

export function roadmapFocus(params: Params) {
  const year = choice(params.get("focus_year"), ["2027", "2028", "2029"], "");
  const quarter = choice(params.get("focus_quarter"), ["Q1", "Q2", "Q3", "Q4"], "");
  return year && quarter ? { year, quarter, id: `roadmap-${year}-${quarter}` } : null;
}

export function projectOrigin(params: Params): ProjectOrigin {
  const value = params.get("from");
  return value && Object.hasOwn(origins, value) ? value as ProjectOrigin : "register";
}

function originParams(params: Params, origin: ProjectOrigin) {
  const result = new URLSearchParams();
  if (origin === "register") {
    for (const [key, value] of Object.entries(registerState(params))) {
      if (value && value !== "all") result.set(key, value);
    }
  } else if (origin === "roadmap") {
    const focus = roadmapFocus(params);
    if (focus) { result.set("focus_year", focus.year); result.set("focus_quarter", focus.quarter); }
  }
  return result;
}

const url = (path: string, params: URLSearchParams) => `${path}${params.size ? `?${params}` : ""}`;

export function projectReturn(params: Params) {
  const origin = projectOrigin(params);
  return { href: url(origins[origin].path, originParams(params, origin)), label: origins[origin].label };
}

export function projectHref(id: number, from: ProjectOrigin, context: Params = new URLSearchParams()): string {
  // Invalid source IDs never fall back to a different project or arbitrary route.
  if (projectIdFromPath(String(id)) === null) throw new Error("Invalid project link identity");
  const params = new URLSearchParams({ tab: "overview", from });
  originParams(context, from).forEach((value, key) => params.set(key, value));
  return url(`/roadmap/${id}`, params);
}

export function projectView(params: Params, frameworks: readonly string[]) {
  return {
    tab: choice(params.get("tab"), projectTabs, "overview") as typeof projectTabs[number],
    framework: choice(params.get("framework"), frameworks),
    coverage: choice(params.get("coverage"), ["full", "partial", "supporting"]),
    verification: choice(params.get("verification"), ["verified", "not_verified"]),
  };
}

export type StrategyQueryKey = "q" | "year" | "status" | "priority" | "tab" | "framework" | "coverage" | "verification";

// Called only by existing presentation controls. Next integrates native history
// with useSearchParams; replace search keystrokes, push explicit choices.
export function updateStrategyQuery(key: StrategyQueryKey, value: string) {
  const params = new URLSearchParams(window.location.search);
  if (!value || value === "all") params.delete(key); else params.set(key, value);
  const next = url(window.location.pathname, params);
  if (next === `${window.location.pathname}${window.location.search}`) return;
  window.history[key === "q" ? "replaceState" : "pushState"](null, "", next);
}

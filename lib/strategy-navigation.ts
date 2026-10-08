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

const workTypes = ["technical_project", "managed_service", "framework_agreement", "internal_program", "policy_governance", "assessment", "technical_change", "ongoing_activity"];
const unset = (values: string[]) => [...values, "unset"];
const durationBound = (value: string | null) => value !== null && /^\d+(\.\d+)?$/.test(value) ? value : "";

// URL keys for the canonical QA register filters (PortfolioFilters). Unknown
// values (including legacy year=2027 / priority=high / quarter links) reset to "all".
export function registerState(params: Params) {
  const archive = params.get("archive");
  return {
    q: params.get("q") ?? "",
    priority: choice(params.get("priority"), unset(["P1", "P2", "P3"])),
    execution_year: choice(params.get("execution_year"), unset(["1", "2", "3"])),
    work_type: choice(params.get("work_type"), unset(workTypes)),
    owner: choice(params.get("owner"), unset(["it", "cybersecurity", "dmo", "other"])),
    status: choice(params.get("status"), ["planned", "in_progress", "on_hold", "completed"]),
    duration_unit: choice(params.get("duration_unit"), unset(["day", "week", "month", "year"])),
    duration_min: durationBound(params.get("duration_min")),
    duration_max: durationBound(params.get("duration_max")),
    mapping: choice(params.get("mapping"), ["verified", "partially_mapped", "mapping_pending", "source_error"]),
    // Register data-quality filter (presentation only): projects missing a planning field.
    missing: choice(params.get("missing"), ["any", "priority", "owner", "duration", "outcome"]),
    // Absent = active portfolio. "include" shows archived and active together.
    archive: archive === "archived" ? "archived" : archive === "include" ? "all" : "active",
  };
}

/** Canonical lib/project-portfolio.ts PortfolioFilters built from URL state. */
export function portfolioFiltersFrom(state: ReturnType<typeof registerState>) {
  return {
    query: state.q, archive: state.archive as "active" | "archived" | "all",
    priority: state.priority, year: state.execution_year, workType: state.work_type, owner: state.owner,
    status: state.status, durationUnit: state.duration_unit, durationMin: state.duration_min, durationMax: state.duration_max,
    mappingCompleteness: state.mapping,
  };
}

/** URL value for an archive filter choice; the default (active) is omitted. */
export const archiveQueryValue = (value: string) => value === "archived" ? "archived" : value === "all" ? "include" : "";

export function roadmapFocus(params: Params) {
  const year = choice(params.get("focus_year"), ["1", "2", "3"], "");
  return year ? { year, id: `roadmap-year-${year}` } : null;
}

export function projectOrigin(params: Params): ProjectOrigin {
  const value = params.get("from");
  return value && Object.hasOwn(origins, value) ? value as ProjectOrigin : "register";
}

function originParams(params: Params, origin: ProjectOrigin) {
  const result = new URLSearchParams();
  if (origin === "register") {
    for (const [key, value] of Object.entries(registerState(params))) {
      if (key === "archive") { if (archiveQueryValue(value)) result.set(key, archiveQueryValue(value)); }
      else if (value && value !== "all") result.set(key, value);
    }
  } else if (origin === "roadmap") {
    const focus = roadmapFocus(params);
    if (focus) result.set("focus_year", focus.year);
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

export type StrategyQueryKey = "q" | "priority" | "execution_year" | "work_type" | "owner" | "status" | "duration_unit" | "duration_min" | "duration_max" | "mapping" | "missing" | "archive" | "tab" | "framework" | "coverage" | "verification";

// Called only by existing presentation controls. Next integrates native history
// with useSearchParams; replace search keystrokes, push explicit choices.
export function updateStrategyQuery(key: StrategyQueryKey, value: string) {
  const params = new URLSearchParams(window.location.search);
  if (!value || value === "all") params.delete(key); else params.set(key, value);
  const next = url(window.location.pathname, params);
  if (next === `${window.location.pathname}${window.location.search}`) return;
  window.history[key === "q" || key === "duration_min" || key === "duration_max" ? "replaceState" : "pushState"](null, "", next);
}

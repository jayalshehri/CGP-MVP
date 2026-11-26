const catalogStateKey = "cgp.control-catalog.v1";
const allowedParams = ["framework", "domain", "status", "assignment", "owner", "evidence", "due", "sort", "view"] as const;

type CatalogContext = {
  viewer: string;
  query: string;
  search: string;
  cloudScope: "all" | "provider" | "tenant";
  scroll: number;
};

function cleanParams(params: URLSearchParams) {
  const clean = new URLSearchParams();
  for (const key of allowedParams) {
    const value = params.get(key);
    if (value && value.length <= 450) clean.set(key, value);
  }
  return clean;
}

function validContext(value: unknown, viewer: string): CatalogContext | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<CatalogContext>;
  if (!viewer || state.viewer !== viewer || typeof state.query !== "string" || state.query.length > 5000
    || typeof state.search !== "string" || state.search.length > 1000 || typeof state.scroll !== "number"
    || !Number.isFinite(state.scroll) || state.scroll < 0 || state.scroll > 1000000
    || (state.cloudScope !== "all" && state.cloudScope !== "provider" && state.cloudScope !== "tenant")) return null;
  return state as CatalogContext;
}

function fromSession(viewer: string) {
  try {
    return validContext(JSON.parse(sessionStorage.getItem(catalogStateKey) || "null"), viewer);
  } catch { return null; }
}

export function rememberCatalogPosition(viewer: string, search: string, cloudScope: string) {
  if (!viewer || typeof window === "undefined" || window.location.pathname !== "/controls") return;
  const state: CatalogContext = {
    viewer,
    query: cleanParams(new URLSearchParams(window.location.search)).toString(),
    search: search.slice(0, 1000),
    cloudScope: cloudScope === "provider" || cloudScope === "tenant" ? cloudScope : "all",
    scroll: window.scrollY,
  };
  // Keep text and scroll in the tab only, never in the detail URL.
  try { sessionStorage.setItem(catalogStateKey, JSON.stringify(state)); } catch { /* Storage is optional. */ }
  try { window.history.replaceState({ ...window.history.state, [catalogStateKey]: state }, ""); }
  catch { /* The explicit Back link can still use session storage. */ }
}

export function readCatalogPosition(viewer: string): CatalogContext | null {
  if (typeof window === "undefined" || window.location.pathname !== "/controls") return null;
  const here = new URLSearchParams(window.location.search);
  const historyEntry = validContext(window.history.state?.[catalogStateKey], viewer);
  const state = here.get("restore") === "1" ? fromSession(viewer) || historyEntry : historyEntry;
  return state?.query === cleanParams(here).toString() ? state : null;
}

export function catalogBackHref(viewer: string) {
  const state = typeof window === "undefined" ? null : fromSession(viewer);
  if (!state) return "/controls";
  const params = cleanParams(new URLSearchParams(state.query));
  params.set("restore", "1");
  return `/controls?${params.toString()}`;
}

export function catalogDetailHref(id: number) {
  return `/controls/${id}?from=catalog`;
}

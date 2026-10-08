/** Completeness is only for the caller's RLS-authorized scope, never enterprise visibility. */
export type ReadStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
export type StrategyRead<T> = { data: T[]; status: ReadStatus; error: boolean };
type Page<T> = { data: T[] | null; error: unknown; count: number | null };
export const unavailable = "غير متاح";
export const noRelationship = "لا توجد علاقة مسجلة ضمن هذا المصدر";
export const insufficientData = "بيانات غير كافية";

export function combinedStatus(...sources: ReadStatus[]): ReadStatus {
  if (sources.every(status => status === "COMPLETE")) return "COMPLETE";
  return sources.some(status => status !== "UNAVAILABLE") ? "PARTIAL" : "UNAVAILABLE";
}

/** Each factory MUST select its ordering keys and use a stable unique order.
 * Exact counts are scoped by PostgREST/RLS. A server row cap is not an end-of-data signal.
 * Discard incomplete rows: no partial count or composite is safe to publish.
 * This is not a transaction snapshot; detected count/identity drift fails closed.
 */
export async function readStrategyRows<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  key: (row: T) => string | number,
): Promise<StrategyRead<T>> {
  const rows: T[] = [], seen = new Set<string | number>();
  let expected: number | null = null;
  const failed = (): StrategyRead<T> => ({ data: [], status: rows.length ? "PARTIAL" : "UNAVAILABLE", error: true });
  try {
    for (let request = 0; request < 10000; request++) {
      const result = await page(rows.length, rows.length + 499);
      if (result.error || !Array.isArray(result.data) || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) return failed();
      if (expected !== null && expected !== result.count) return failed();
      expected = result.count;
      for (const row of result.data) {
        const id = key(row);
        if (id == null || seen.has(id)) return failed();
        seen.add(id);
        rows.push(row);
      }
      if (rows.length === expected) return { data: rows, status: "COMPLETE", error: false };
      if (rows.length > expected || !result.data.length) return failed();
    }
  } catch { /* Only a bounded, non-sensitive read state reaches business UI. */ }
  return failed();
}

/** Invalidate previous async reads on reload or unmount, without global state. */
export function createReadEpoch() {
  let current = 0;
  return { begin: () => ++current, valid: (id: number) => id === current, cancel: () => { current++; } };
}

import { supabase } from "@/lib/supabase";

export type CycleMaturity = { title: string; result: { outcome: string; reference: string } | null };

export async function latestMaturity(): Promise<CycleMaturity | null> {
  const cycle = await supabase.from("nudee_cycles").select("id,title").order("id", { ascending: false }).limit(1);
  if (cycle.error) throw cycle.error;
  const latest = cycle.data?.[0];
  if (!latest) return null;
  const result = await supabase.from("nudee_cycle_events").select("outcome,reference").eq("cycle_id", latest.id)
    .eq("kind", "result").eq("subject", "maturity").order("id", { ascending: false }).limit(1);
  if (result.error) throw result.error;
  return { title: latest.title, result: result.data?.[0] ?? null };
}

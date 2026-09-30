import { supabase } from './supabase';
import type { SharedFinding } from './findings';
import type { ControlAuditEvent } from './control360';
import type { EvidenceRecord } from './grc';

export type ControlAssessment = {
  id: number; cycle_id: number; compliance_status: string | null; review_status: string;
  reviewed_at: string | null; updated_at: string;
  cycle: { scope_name: string; system_id: number | null; status: string; approved_at: string | null } | null;
};
export type ControlFinding = SharedFinding & { owner: { display_name: string | null } | null };
export type ControlAction = { id: number; finding_id: number; status: string; verification_status: string };

export async function loadControlEvidenceRegister(controlId: number): Promise<EvidenceRecord[]> {
  const rows: EvidenceRecord[] = [];
  for (let from = 0; ; from += 500) {
    const result = await supabase.rpc('grc_evidence_register').eq('control_id', controlId)
      .order('id').order('link_id', { nullsFirst: true }).range(from, from + 499);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []) as EvidenceRecord[]);
    if ((result.data ?? []).length < 500) return rows;
  }
}

export async function loadControlAssessments(controlId: number): Promise<ControlAssessment[]> {
  // Explicit allowed cycle columns: never request approved_snapshot or select '*'.
  const result = await supabase.from('assessment_items')
    .select('id,cycle_id,compliance_status,review_status,reviewed_at,updated_at,cycle:assessment_cycles!cycle_id(scope_name,system_id,status,approved_at)')
    .eq('control_id', controlId).order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(50);
  if (result.error) throw result.error;
  return (result.data ?? []).map(row => ({ ...row, cycle: Array.isArray(row.cycle) ? row.cycle[0] ?? null : row.cycle })) as ControlAssessment[];
}
export async function loadControlFindings(controlId: number): Promise<{ findings: ControlFinding[]; actions: ControlAction[] }> {
  const findings: ControlFinding[] = [];
  for (let from = 0; ; from += 500) {
    const result = await supabase.from('grc_findings').select('*,owner:profiles!owner_id(display_name)')
      .eq('control_id', controlId).order('id', { ascending: false }).range(from, from + 499);
    if (result.error) throw result.error;
    findings.push(...(result.data ?? []).map(row => ({ ...row, owner: Array.isArray(row.owner) ? row.owner[0] ?? null : row.owner })) as ControlFinding[]);
    if ((result.data ?? []).length < 500) break;
  }
  const actions: ControlAction[] = [];
  // Bound IN-list size, with server-side scope and paging; no per-finding N+1.
  for (let offset = 0; offset < findings.length; offset += 200) {
    const ids = findings.slice(offset, offset + 200).map(row => row.id);
    for (let from = 0; ; from += 500) {
      const result = await supabase.from('grc_corrective_actions').select('id,finding_id,status,verification_status')
        .in('finding_id', ids).order('id').range(from, from + 499);
      if (result.error) throw result.error;
      actions.push(...(result.data ?? []) as ControlAction[]);
      if ((result.data ?? []).length < 500) break;
    }
  }
  return { findings, actions };
}
export async function loadControlActivity(controlId: number): Promise<ControlAuditEvent[]> {
  const result = await supabase.from('grc_audit_events')
    .select('id,entity_type,action,actor_name,occurred_at,previous_data,new_data')
    .eq('control_id', controlId).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(20);
  if (result.error) throw result.error;
  return (result.data ?? []) as ControlAuditEvent[];
}

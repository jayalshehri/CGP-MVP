import { supabase } from '@/lib/supabase';

export type EligibleFrameworkEvidence = {
  evidence_id: number;
  target_control_id: number;
  target_control_code: string;
  association: 'direct' | 'shared';
  evidence_name: string | null;
  file_name: string | null;
  version_number: number;
  is_current: boolean;
  review_status: string;
  valid_until: string | null;
  uploaded_at: string | null;
};

// The RPC is the authorization and eligibility boundary. Page its result so
// framework summaries cannot silently stop at PostgREST's row cap.
export async function loadEligibleFrameworkEvidence(code: string): Promise<EligibleFrameworkEvidence[]> {
  const rows: EligibleFrameworkEvidence[] = [];
  for (let from = 0; ; from += 500) {
    const result = await supabase.rpc('cgp_framework_evidence_eligible', {
      p_framework_code: code,
      p_control_id: null,
    }).range(from, from + 499);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as EligibleFrameworkEvidence[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

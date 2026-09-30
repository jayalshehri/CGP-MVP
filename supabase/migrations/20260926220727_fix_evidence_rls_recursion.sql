-- P2-B4.2: break the evidence <-> evidence_control_links RLS cycle without
-- broadening shared-evidence visibility or changing evidence lifecycle data.
begin;

-- A caller learns only whether this particular evidence version is already
-- shared to a control they may read through an accepted link and approved
-- mapping. The table reads run as the function owner so they do not recurse
-- through the two tables' SELECT policies; authorization remains explicit.
create function private.can_read_approved_shared_evidence(p_evidence_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $shared$
  select auth.uid() is not null
    and private.current_user_role() in
      ('admin', 'cybersecurity_team', 'control_owner', 'nca_external_auditor')
    and exists (
      select 1
      from public.evidence e
      join public.evidence_control_links l on l.evidence_id = e.id
      join public.controls target_control on target_control.id = l.control_id
      join public.control_framework_links m on m.validation_status = 'approved'
        and (
          (m.source_control_id = e.control_id and m.target_control_id = l.control_id)
          or (m.target_control_id = e.control_id and m.source_control_id = l.control_id)
        )
      where e.id = p_evidence_id
        and l.status = 'accepted'
        and (
          private.current_user_role() in ('admin', 'cybersecurity_team')
          or (
            private.current_user_role() = 'control_owner'
            and target_control.control_owner_id = auth.uid()
          )
          or (
            private.current_user_role() = 'nca_external_auditor'
            and private.can_external_auditor_view_control(target_control.id)
          )
        )
    );
$shared$;

revoke all on function private.can_read_approved_shared_evidence(bigint)
  from public, anon, service_role;
grant execute on function private.can_read_approved_shared_evidence(bigint)
  to authenticated;

-- Preserve the existing SELECT-only policy and the direct-control policy.
-- Only an accepted shared link backed by an approved mapping may grant an
-- additional read. Historical/expired versions remain governed by the
-- existing evidence/version rules; this policy does not mutate them.
alter policy grc_shared_evidence_read on public.evidence
  using (private.can_read_approved_shared_evidence(id));

commit;

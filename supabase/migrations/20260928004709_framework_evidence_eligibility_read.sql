-- Phase 2A.1: a framework/control-scoped, read-only evidence eligibility API.
-- Keep mapping approval private; do not broaden control_framework_links RLS.
-- The existing P2-B4 predicate remains the authority for version, expiry,
-- direct/shared review, approved mapping, and active source framework checks.
begin;

-- The private definer must never be created under a temporary/pool login.
do $owner$
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'Framework evidence API requires a postgres migration session'
      using errcode = '42501';
  end if;
end
$owner$;

create function private.grc_framework_evidence_eligible(
  p_framework_code text, p_control_id bigint
) returns table (
  evidence_id bigint,
  target_control_id bigint,
  target_control_code text,
  association text,
  evidence_name text,
  file_name text,
  version_number integer,
  is_current boolean,
  review_status text,
  valid_until date,
  uploaded_at timestamptz
) language sql stable security definer set search_path = '' as $eligible$
  with scoped_controls as materialized (
    select c.id, c.control_code
    from public.controls c
    join public.frameworks f on f.id = c.framework_id
    where auth.uid() is not null
      and p_framework_code ~ '^[A-Z][A-Z0-9_]{1,31}$'
      and f.code = p_framework_code and f.is_active
      and (p_control_id is null or (p_control_id > 0 and c.id = p_control_id))
      and (
        private.current_user_role() in ('admin', 'cybersecurity_team')
        or (private.current_user_role() = 'control_owner'
          and c.control_owner_id = auth.uid())
        or (private.current_user_role() = 'nca_external_auditor'
          and private.can_external_auditor_view_control(c.id))
      )
  ), candidates as (
    select c.id as target_id, c.control_code, e.id as candidate_id,
      'direct'::text as candidate_association, e.status as candidate_status
    from scoped_controls c
    join public.evidence e on e.control_id = c.id
    union all
    select c.id, c.control_code, l.evidence_id,
      'shared'::text, l.status
    from scoped_controls c
    join public.evidence_control_links l on l.control_id = c.id
    where l.status = 'accepted'
  )
  select distinct on (candidate.target_id, e.id)
    e.id, candidate.target_id, candidate.control_code,
    candidate.candidate_association, e.evidence_name, e.file_name,
    e.version_number, e.is_current, candidate.candidate_status,
    e.valid_until, e.uploaded_at
  from candidates candidate
  join public.evidence e on e.id = candidate.candidate_id
  where private.grc_finding_evidence_valid(e.id, candidate.target_id, null::uuid)
  order by candidate.target_id, e.id,
    case when candidate.candidate_association = 'direct' then 0 else 1 end;
$eligible$;

revoke all on function private.grc_framework_evidence_eligible(text,bigint)
  from public, anon, service_role;
grant execute on function private.grc_framework_evidence_eligible(text,bigint)
  to authenticated;

-- Data API entry point stays invoker. Only the narrowly scoped private
-- implementation needs definer rights to inspect approved mappings without
-- disclosing mapping rows or extending their SELECT policy to owners.
create function public.cgp_framework_evidence_eligible(
  p_framework_code text, p_control_id bigint default null
) returns table (
  evidence_id bigint,
  target_control_id bigint,
  target_control_code text,
  association text,
  evidence_name text,
  file_name text,
  version_number integer,
  is_current boolean,
  review_status text,
  valid_until date,
  uploaded_at timestamptz
) language sql stable security invoker set search_path = '' as $wrapper$
  select * from private.grc_framework_evidence_eligible(p_framework_code, p_control_id);
$wrapper$;

revoke all on function public.cgp_framework_evidence_eligible(text,bigint)
  from public, anon, service_role;
grant execute on function public.cgp_framework_evidence_eligible(text,bigint)
  to authenticated;

commit;

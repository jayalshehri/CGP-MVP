-- Phase 1 schema only. Staging never activates a project or a control relationship.
begin;

create table public.portfolio_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null check (btrim(source_filename) <> ''),
  source_sha256 text not null unique check (source_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'staging' check (status in ('staging','validated','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.portfolio_import_projects (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.portfolio_import_batches(id),
  source_sheet text not null check (btrim(source_sheet) <> ''),
  source_row integer not null check (source_row > 0),
  source_project_name text not null check (btrim(source_project_name) <> ''),
  status text not null default 'planned' check (status = 'planned'),
  priority text not null check (priority in ('P1','P2','P3')),
  execution_year smallint generated always as (
    case priority when 'P1' then 1 when 'P2' then 2 when 'P3' then 3 end
  ) stored,
  duration_value numeric,
  duration_unit text,
  work_type text check (work_type in (
    'technical_project','managed_service','framework_agreement','internal_program',
    'policy_governance','assessment','technical_change','ongoing_activity'
  )),
  executive_owner_code text check (executive_owner_code in ('it','cybersecurity','dmo','other')),
  executive_owner_other text,
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (batch_id, source_sheet, source_row),
  constraint staging_owner_other_check check (
    (executive_owner_code is not distinct from 'other'
      and executive_owner_other is not null and btrim(executive_owner_other) <> '')
    or (executive_owner_code is distinct from 'other' and executive_owner_other is null)
  ),
  constraint staging_duration_check check (
    (duration_value is null and duration_unit is null)
    or (duration_value is not null and duration_value > 0 and duration_value < 'Infinity'::numeric
      and duration_unit is not null and duration_unit in ('day','week','month','year'))
  )
);

create table public.portfolio_mapping_reviews (
  id uuid primary key default gen_random_uuid(),
  staged_project_id uuid not null references public.portfolio_import_projects(id),
  source_reference text not null check (btrim(source_reference) <> ''),
  source_framework text,
  source_control_code text,
  target_type text not null default 'control' check (target_type in ('control','requirement')),
  control_id bigint references public.controls(id),
  requirement_id bigint references public.cybersecurity_requirements(id),
  source_requirement_code text,
  constraint mapping_target_check check (
    (target_type = 'control' and requirement_id is null)
    or (target_type = 'requirement' and control_id is null)
  ),
  match_status text not null default 'needs_review'
    check (match_status in ('exact_match','legacy_mapping','needs_review')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  decision_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (staged_project_id, target_type, source_reference),
  constraint mapping_candidate_check check (
    match_status = 'needs_review' or
    (target_type = 'control' and control_id is not null
      and source_framework is not null and btrim(source_framework) <> ''
      and source_control_code is not null and btrim(source_control_code) <> '') or
    (target_type = 'requirement' and requirement_id is not null
      and source_requirement_code is not null and btrim(source_requirement_code) <> '')
  ),
  constraint mapping_review_check check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (review_status in ('approved','rejected') and reviewed_by is not null and reviewed_at is not null
      and decision_note is not null and btrim(decision_note) <> '')
  ),
  constraint mapping_approval_check check (
    review_status <> 'approved' or (match_status in ('exact_match','legacy_mapping') and (control_id is not null or requirement_id is not null))
  )
);

create index portfolio_import_batches_creator_idx on public.portfolio_import_batches (created_by);
create index portfolio_import_projects_creator_idx on public.portfolio_import_projects (created_by);
create index portfolio_mapping_requirement_idx on public.portfolio_mapping_reviews (requirement_id);
create index portfolio_mapping_control_idx on public.portfolio_mapping_reviews (control_id);
create index portfolio_mapping_reviewer_idx on public.portfolio_mapping_reviews (reviewed_by);
create index portfolio_mapping_creator_idx on public.portfolio_mapping_reviews (created_by);

-- Preserve batch provenance; only its review workflow status can change.
create function private.guard_portfolio_batch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Batch source and attribution are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_portfolio_batch() from public, anon, authenticated;
create trigger guard_portfolio_batch before update on public.portfolio_import_batches
  for each row execute function private.guard_portfolio_batch();

alter table public.cybersecurity_projects
  add column import_staging_id uuid unique references public.portfolio_import_projects(id);
comment on column public.cybersecurity_projects.import_staging_id is
  'Reserved provenance for Phase 2. Phase 1 trigger refuses activation of staged projects.';

create function private.guard_portfolio_staging_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.review_status = 'approved' then
    if new.review_status = 'approved' and to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Reset the decision to pending before changing an approved mapping' using errcode = '23514';
    end if;
  end if;
  if new.target_type = 'control' and new.match_status = 'exact_match' and not exists (
    select 1 from public.controls c join public.frameworks f on f.id = c.framework_id
    where c.id = new.control_id and f.is_active
      and f.code = new.source_framework and c.control_code = new.source_control_code
  ) then
    raise exception 'Exact match requires the identical active framework and control code' using errcode = '23514';
  end if;
  if new.target_type = 'control' and new.review_status = 'approved' and not exists (
    select 1 from public.controls c join public.frameworks f on f.id = c.framework_id
    where c.id = new.control_id and f.is_active
  ) then
    raise exception 'Approval requires an active catalog control' using errcode = '23514';
  end if;
  if new.target_type = 'requirement' and new.match_status = 'exact_match' and not exists (
    select 1 from public.cybersecurity_requirements r
    where r.id = new.requirement_id and r.requirement_code = new.source_requirement_code
  ) then
    raise exception 'Exact match requires the identical requirement code' using errcode = '23514';
  end if;
  if new.review_status <> 'pending' then
    if auth.uid() is null or private.current_user_role() not in ('admin','cybersecurity_team')
      or private.current_user_role() is null then
      raise exception 'A signed-in portfolio manager must record the decision' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    elsif new.review_status is distinct from old.review_status then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    elsif new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Review attribution cannot be overwritten' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_portfolio_staging_review() from public, anon, authenticated;
create trigger guard_portfolio_staging_review before insert or update on public.portfolio_mapping_reviews
  for each row execute function private.guard_portfolio_staging_review();

create function private.block_portfolio_import_phase1() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.import_staging_id is not null then
    raise exception 'Import activation is disabled in Phase 1; Phase 2 approval is required' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.block_portfolio_import_phase1() from public, anon, authenticated;
create trigger block_portfolio_import_phase1 before insert or update of import_staging_id on public.cybersecurity_projects
  for each row execute function private.block_portfolio_import_phase1();

-- execution_year is generated and unavailable in a BEFORE UPDATE row.
-- Staging source rows are immutable: classification can be supplied later, but
-- source names/cells cannot be silently changed after a mapping review.
create function private.guard_portfolio_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['work_type','executive_owner_code','executive_owner_other','execution_year'])
    is distinct from (to_jsonb(old) - array['work_type','executive_owner_code','executive_owner_other','execution_year']) then
    raise exception 'Import source is immutable; create a new batch for a revised source' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_portfolio_source() from public, anon, authenticated;
create trigger guard_portfolio_source before update on public.portfolio_import_projects
  for each row execute function private.guard_portfolio_source();

alter table public.portfolio_import_batches enable row level security;
alter table public.portfolio_import_projects enable row level security;
alter table public.portfolio_mapping_reviews enable row level security;
revoke all on public.portfolio_import_batches, public.portfolio_import_projects, public.portfolio_mapping_reviews from public, anon, authenticated;
grant select, insert, update on public.portfolio_import_batches, public.portfolio_import_projects, public.portfolio_mapping_reviews to authenticated;

create policy portfolio_import_batches_manage on public.portfolio_import_batches for all to authenticated
  using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
  with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy portfolio_import_projects_manage on public.portfolio_import_projects for all to authenticated
  using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
  with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy portfolio_mapping_reviews_manage on public.portfolio_mapping_reviews for all to authenticated
  using ((select private.current_user_role()) in ('admin','cybersecurity_team'))
  with check ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create trigger grc_audit after insert or update on public.portfolio_import_batches
  for each row execute function private.grc_audit();
create trigger grc_audit after insert or update on public.portfolio_import_projects
  for each row execute function private.grc_audit();
create trigger grc_audit after insert or update on public.portfolio_mapping_reviews
  for each row execute function private.grc_audit();

-- Explicit current-object ACLs: do not rely on platform default privileges.
do $$
declare target text; privilege text;
begin
  foreach target in array array['portfolio_import_batches','portfolio_import_projects','portfolio_mapping_reviews'] loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
      if has_table_privilege('anon','public.' || target,privilege) or
        has_table_privilege('authenticated','public.' || target,privilege)
          is distinct from (privilege in ('SELECT','INSERT','UPDATE')) then
        raise exception 'Unsafe portfolio staging ACL for %.%',target,privilege;
      end if;
    end loop;
    if not (select relrowsecurity from pg_class where oid=('public.' || target)::regclass) then
      raise exception 'Portfolio staging RLS is required';
    end if;
  end loop;
end;
$$;

commit;

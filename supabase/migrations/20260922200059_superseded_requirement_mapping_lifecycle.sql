-- A-03: retain the reviewed parent mappings as history, but remove them from
-- active requirement/control relationships. Business-key/parent joins keep
-- this deterministic when surrogate IDs differ between QA and replay.
alter table public.cybersecurity_requirement_controls
  add column mapping_status text not null default 'active'
    check (mapping_status in ('active', 'superseded')),
  add column superseded_at timestamptz,
  add column superseded_reason text,
  add column supersedes_mapping_id bigint
    references public.cybersecurity_requirement_controls(id),
  add constraint cybersecurity_requirement_controls_supersession_valid
    check (
      (mapping_status = 'active' and superseded_at is null and superseded_reason is null)
      or (mapping_status = 'superseded' and superseded_at is not null
          and nullif(btrim(superseded_reason), '') is not null
          and supersedes_mapping_id is null)
    ),
  add constraint cybersecurity_requirement_controls_no_self_supersession
    check (supersedes_mapping_id is distinct from id);

create index cybersecurity_requirement_controls_active_requirement_idx
  on public.cybersecurity_requirement_controls(requirement_id, control_id)
  where mapping_status = 'active';

create index cybersecurity_requirement_controls_supersedes_idx
  on public.cybersecurity_requirement_controls(supersedes_mapping_id)
  where supersedes_mapping_id is not null;

do $a03_preflight$
declare
  old_count integer;
  replacement_count integer;
  matched_count integer;
  parents_with_replacements integer;
  archived_count integer;
begin
  select count(*) into old_count
  from public.cybersecurity_requirement_controls
  where notes ilike '%superseded by%';

  select count(*) into replacement_count
  from public.cybersecurity_requirement_controls
  where notes ilike '%from mapping_id=%';

  select count(*), count(distinct old.id) into matched_count, parents_with_replacements
  from public.cybersecurity_requirement_controls replacement
  join public.controls child on child.id = replacement.control_id
  join public.cybersecurity_requirement_controls old
    on old.requirement_id = replacement.requirement_id
   and old.control_id = child.parent_control_id
   and old.notes ilike '%superseded by%'
  where replacement.notes ilike '%from mapping_id=%';

  select count(*) into archived_count
  from public.cybersecurity_requirement_controls mapping
  join public.controls control on control.id = mapping.control_id
  join public.frameworks framework on framework.id = control.framework_id
  where not framework.is_active;

  if old_count <> 30 or replacement_count <> 35
     or matched_count <> 35 or parents_with_replacements <> 30
     or archived_count <> 0 then
    raise exception 'A-03 prerequisite mismatch: old=%, replacement=%, matched=%, parents=%, archived=%',
      old_count, replacement_count, matched_count,
      parents_with_replacements, archived_count;
  end if;
end
$a03_preflight$;

-- The replacement's FK provides a structured, queryable link back to the
-- historical parent mapping; original IDs, notes and references are unchanged.
update public.cybersecurity_requirement_controls replacement
set supersedes_mapping_id = old.id
from public.controls child,
     public.cybersecurity_requirement_controls old
where child.id = replacement.control_id
  and old.requirement_id = replacement.requirement_id
  and old.control_id = child.parent_control_id
  and old.notes ilike '%superseded by%'
  and replacement.notes ilike '%from mapping_id=%';

update public.cybersecurity_requirement_controls old
set mapping_status = 'superseded',
    superseded_at = now(),
    superseded_reason = split_part(
      split_part(old.notes, '[Master-Catalog review 2026-09-21] ', 2),
      E'\n', 1)
where old.notes ilike '%superseded by%';

do $a03_postflight$
begin
  if (select count(*) from public.cybersecurity_requirement_controls
      where mapping_status = 'superseded') <> 30
     or (select count(*) from public.cybersecurity_requirement_controls
         where supersedes_mapping_id is not null and mapping_status = 'active') <> 35
     or (select count(*) from public.cybersecurity_requirement_controls
         where mapping_status = 'active') <> 205 then
    raise exception 'A-03 mapping lifecycle postflight mismatch';
  end if;
end
$a03_postflight$;

-- Ordinary authenticated application roles can never reactivate a historical
-- mapping through PostgREST, even if they otherwise have mapping write rights.
-- Existing admin/team mapping RLS remains unchanged; control owners have no
-- write policy. A future reviewed migration can run as the database owner.
create function private.guard_superseded_mapping_reactivation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.mapping_status = 'superseded'
     and new is distinct from old then
    raise exception 'Superseded requirement mapping is historical and read-only';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_superseded_mapping_reactivation()
  from public, anon, authenticated;

create trigger guard_superseded_mapping_reactivation
before update on public.cybersecurity_requirement_controls
for each row execute function private.guard_superseded_mapping_reactivation();

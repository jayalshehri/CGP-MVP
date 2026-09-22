-- Follow-up to 20260922193112: indirect foreign keys can create new review
-- activity against historical evidence without carrying control_id themselves.
-- Existing rows remain readable; no history is deleted or rewritten.
begin;
set local lock_timeout = '10s';

create function private.guard_archived_indirect_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
declare
  row_data jsonb;
  state_index integer;
  archived_reference boolean;
begin
  for state_index in 1..2 loop
    if (state_index = 1 and tg_op in ('UPDATE', 'DELETE'))
       or (state_index = 2 and tg_op in ('INSERT', 'UPDATE')) then
      row_data := case when state_index = 1 then to_jsonb(old)
                       else to_jsonb(new) end;
      archived_reference := false;

      if tg_table_name = 'evidence_reviews' then
        select exists (
          select 1 from public.evidence e
          join public.controls c on c.id = e.control_id
          join public.frameworks f on f.id = c.framework_id
          where e.id = (row_data->>'evidence_id')::bigint and not f.is_active
        ) into archived_reference;
      elsif tg_table_name = 'evidence_control_link_reviews' then
        select exists (
          select 1 from public.evidence_control_links l
          join public.controls target on target.id = l.control_id
          join public.frameworks target_f on target_f.id = target.framework_id
          join public.evidence e on e.id = l.evidence_id
          join public.controls source on source.id = e.control_id
          join public.frameworks source_f on source_f.id = source.framework_id
          where l.id = (row_data->>'link_id')::bigint
            and (not target_f.is_active or not source_f.is_active)
        ) into archived_reference;
      elsif tg_table_name in ('control_assessments', 'evidence_requests') then
        select exists (
          select 1 from public.control_review_cycles cycle
          join public.controls c on c.id = cycle.control_id
          join public.frameworks f on f.id = c.framework_id
          where cycle.id = (row_data->>'cycle_id')::bigint
            and not f.is_active
        ) into archived_reference;
      elsif tg_table_name = 'assessment_cycles' then
        select exists (
          select 1 from public.assessment_cycles previous
          join public.frameworks f on f.id = previous.framework_id
          where previous.id = (row_data->>'previous_cycle_id')::bigint
            and not f.is_active
        ) into archived_reference;
      elsif tg_table_name = 'evidence' then
        select
          exists (
            select 1 from public.evidence previous
            join public.controls c on c.id = previous.control_id
            join public.frameworks f on f.id = c.framework_id
            where previous.id = (row_data->>'replaces_id')::bigint
              and not f.is_active
          )
          or exists (
            select 1 from public.evidence_requests request
            join public.controls c on c.id = request.control_id
            join public.frameworks f on f.id = c.framework_id
            where request.id = (row_data->>'request_id')::bigint
              and not f.is_active
          )
        into archived_reference;
      end if;

      if archived_reference then
        raise exception 'Archived regulatory history cannot receive operational activity'
          using errcode = '42501';
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.guard_archived_indirect_mutation()
  from public, anon, authenticated;

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.evidence_reviews
for each row execute function private.guard_archived_indirect_mutation();

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.evidence_control_link_reviews
for each row execute function private.guard_archived_indirect_mutation();

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.control_assessments
for each row execute function private.guard_archived_indirect_mutation();

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.evidence_requests
for each row execute function private.guard_archived_indirect_mutation();

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.assessment_cycles
for each row execute function private.guard_archived_indirect_mutation();

create trigger archived_indirect_mutation_guard
before insert or update or delete on public.evidence
for each row execute function private.guard_archived_indirect_mutation();

commit;

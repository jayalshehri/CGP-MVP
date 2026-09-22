-- Archived regulatory controls remain readable for history, but immutable for
-- operational workflows. The canonical marker is frameworks.is_active = false.
begin;
set local lock_timeout = '10s';

create function private.guard_archived_control_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
declare
  row_data jsonb;
  reference_column text;
  reference_id bigint;
  column_index integer;
  state_index integer;
begin
  -- The control row itself must not acquire a new owner, state, date or any
  -- other operational change after its framework has been retired.
  if tg_table_schema = 'public' and tg_table_name = 'controls' then
    if tg_op in ('UPDATE', 'DELETE') then
      if exists (
        select 1 from public.frameworks f
        where f.id = old.framework_id and not f.is_active
      ) then
        raise exception 'Archived regulatory controls are read-only'
          using errcode = '42501';
      end if;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      if exists (
        select 1 from public.frameworks f
        where f.id = new.framework_id and not f.is_active
      ) then
        raise exception 'Archived regulatory controls are read-only'
          using errcode = '42501';
      end if;
    end if;
  elsif tg_table_schema = 'public' and tg_table_name = 'assessment_cycles' then
    for state_index in 1..2 loop
      if (state_index = 1 and tg_op in ('UPDATE', 'DELETE'))
         or (state_index = 2 and tg_op in ('INSERT', 'UPDATE')) then
        row_data := case when state_index = 1 then to_jsonb(old)
                         else to_jsonb(new) end;
        if exists (
          select 1 from public.frameworks f
          where f.id = (row_data->>'framework_id')::bigint
            and not f.is_active
        ) then
          raise exception 'Archived regulatory frameworks cannot enter assessment workflows'
            using errcode = '42501';
        end if;
      end if;
    end loop;
  else
    -- Check both OLD and NEW so a historical relation cannot be edited,
    -- deleted or reassigned to disguise a new operational mutation.
    for state_index in 1..2 loop
      if (state_index = 1 and tg_op in ('UPDATE', 'DELETE'))
         or (state_index = 2 and tg_op in ('INSERT', 'UPDATE')) then
        row_data := case when state_index = 1 then to_jsonb(old)
                         else to_jsonb(new) end;
        for column_index in 0..tg_nargs - 1 loop
          reference_column := tg_argv[column_index];
          reference_id := nullif(row_data->>reference_column, '')::bigint;
          if reference_id is not null and exists (
            select 1 from public.controls c
            join public.frameworks f on f.id = c.framework_id
            where c.id = reference_id and not f.is_active
          ) then
            raise exception 'Archived regulatory controls cannot receive operational records'
              using errcode = '42501';
          end if;
        end loop;

        -- A shared evidence link or assessment may name an active target but
        -- still try to reuse evidence sourced from an archived control.
        if tg_table_name in ('evidence_control_links',
                             'assessment_item_evidence', 'assessment_findings')
           and row_data ? 'evidence_id'
           and nullif(row_data->>'evidence_id', '') is not null
           and exists (
             select 1 from public.evidence e
             join public.controls c on c.id = e.control_id
             join public.frameworks f on f.id = c.framework_id
             where e.id = (row_data->>'evidence_id')::bigint
               and not f.is_active
           ) then
          raise exception 'Evidence from an archived regulatory control cannot be reused'
            using errcode = '42501';
        end if;
        if tg_table_name = 'assessment_findings'
           and nullif(row_data->>'verification_evidence_id', '') is not null
           and exists (
             select 1 from public.evidence e
             join public.controls c on c.id = e.control_id
             join public.frameworks f on f.id = c.framework_id
             where e.id = (row_data->>'verification_evidence_id')::bigint
               and not f.is_active
           ) then
          raise exception 'Evidence from an archived regulatory control cannot be reused'
            using errcode = '42501';
        end if;
        if tg_table_name = 'assessment_items'
           and exists (
             select 1 from public.assessment_cycles a
             join public.frameworks f on f.id = a.framework_id
             where a.id = (row_data->>'cycle_id')::bigint
               and not f.is_active
           ) then
          raise exception 'Archived regulatory frameworks cannot receive assessment items'
            using errcode = '42501';
        end if;
        if tg_table_name in ('assessment_item_evidence', 'assessment_findings')
           and exists (
             select 1 from public.assessment_items i
             join public.controls c on c.id = i.control_id
             join public.frameworks f on f.id = c.framework_id
             where i.id = (row_data->>'item_id')::bigint
               and not f.is_active
           ) then
          raise exception 'Archived regulatory controls cannot receive assessment activity'
            using errcode = '42501';
        end if;
      end if;
    end loop;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.guard_archived_control_mutation()
  from public, anon, authenticated;

create trigger archived_control_mutation_guard
before insert or update or delete on public.controls
for each row execute function private.guard_archived_control_mutation();

create trigger archived_assessment_cycle_guard
before insert or update or delete on public.assessment_cycles
for each row execute function private.guard_archived_control_mutation();

do $triggers$
declare
  item record;
begin
  for item in
    select * from (values
      ('assessment_findings', array['control_id']),
      ('assessment_item_evidence', array['control_id']),
      ('assessment_items', array['control_id']),
      ('control_assessments', array['control_id']),
      ('control_framework_links', array['source_control_id','target_control_id']),
      ('control_review_cycles', array['control_id']),
      ('cscc_assessment_results', array['control_id']),
      ('cybersecurity_project_controls', array['control_id']),
      ('cybersecurity_requirement_controls', array['control_id']),
      ('dcc_assessment_results', array['control_id']),
      ('evidence', array['control_id']),
      ('evidence_control_links', array['control_id']),
      ('evidence_requests', array['control_id']),
      ('feedback', array['control_id']),
      ('osmacc_assessment_results', array['control_id']),
      ('shared_control_framework_mappings', array['cyber_control_id']),
      ('tcc_assessment_results', array['control_id']),
      ('vulnerabilities', array['linked_control_id'])
    ) as guarded(table_name, control_columns)
  loop
    execute format(
      'create trigger archived_control_mutation_guard before insert or update or delete on public.%I for each row execute function private.guard_archived_control_mutation(%s)',
      item.table_name,
      (select string_agg(quote_literal(column_name), ',')
       from unnest(item.control_columns) as column_name)
    );
  end loop;
end
$triggers$;

-- Preserve historical downloads and orphan-file cleanup, but never accept a
-- new object under an archived control's folder through Storage directly.
alter policy cgp_file_upload on storage.objects
with check (
  bucket_id = 'evidence-files'
  and private.current_user_role() is not null
  and exists (
    select 1 from public.controls c
    join public.frameworks f on f.id = c.framework_id
    where c.id::text = split_part(name, '/', 1)
      and f.is_active
  )
);

commit;

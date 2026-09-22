-- A-04 (20260922182000): make the regulatory catalog immutable to normal application roles.
--
-- Regulatory source-of-truth fields are protected twice:
--   1. PostgREST roles receive UPDATE only on explicitly operational columns.
--   2. A trigger rejects catalog INSERT/DELETE and regulatory-field UPDATE
--      unless it is executed by a postgres migration session with an explicit,
--      transaction-local maintenance flag and non-empty reason.
--
-- Future approved catalog migrations must use this narrow pattern inside the
-- migration transaction before changing public.frameworks or regulatory
-- columns in public.controls:
--
--   select set_config('private.catalog_maintenance', 'on', true);
--   select set_config(
--     'private.catalog_maintenance_reason',
--     '<migration version/name and approved regulatory reason>',
--     true
--   );
--
-- No callable maintenance RPC is created. Normal SECURITY DEFINER application
-- functions also cannot use this bypass because Data API sessions have
-- session_user=authenticator, not postgres.

begin;

-- Remove broad mutation privileges inherited from Supabase defaults. RLS is
-- retained unchanged as the row-scope layer; these grants are the column and
-- operation-scope layer.
revoke insert, update, delete, truncate, references, trigger
  on table public.controls, public.frameworks
  from anon, authenticated, service_role;

-- The application legitimately updates only operational workflow metadata.
-- Compliance/evidence state remains additionally governed by the existing
-- workflow triggers and SECURITY DEFINER commands.
grant update (
  implementation_status,
  evidence_status,
  verification_status,
  due_date,
  last_review_date,
  control_owner,
  evidence_owner,
  implementation_notes,
  control_owner_id,
  audit_frequency,
  next_audit_date,
  last_audit_date
) on table public.controls to authenticated, service_role;

create or replace function private.enforce_regulatory_catalog_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  maintenance_reason text := nullif(
    btrim(current_setting('private.catalog_maintenance_reason', true)),
    ''
  );
  maintenance_allowed boolean :=
    current_user = 'postgres'
    and session_user = 'postgres'
    and current_setting('private.catalog_maintenance', true) = 'on'
    and maintenance_reason is not null;
  regulatory_change boolean := false;
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('controls', 'frameworks') then
    raise exception 'Unexpected catalog integrity trigger target %.%',
      tg_table_schema, tg_table_name;
  end if;

  if tg_table_name = 'frameworks' then
    regulatory_change := true;
  elsif tg_op in ('INSERT', 'DELETE') then
    regulatory_change := true;
  elsif tg_op = 'UPDATE' then
    regulatory_change :=
      new.id is distinct from old.id
      or new.framework_id is distinct from old.framework_id
      or new.control_code is distinct from old.control_code
      or new.title_ar is distinct from old.title_ar
      or new.description_ar is distinct from old.description_ar
      or new.domain_ar is distinct from old.domain_ar
      or new.official_text_ar is distinct from old.official_text_ar
      or new.source_page is distinct from old.source_page
      or new.hierarchy_level is distinct from old.hierarchy_level
      or new.parent_control_id is distinct from old.parent_control_id
      or new.applicability is distinct from old.applicability;
  end if;

  if regulatory_change and not maintenance_allowed then
    raise exception
      'Regulatory catalog fields are immutable through normal application roles'
      using errcode = '42501',
            hint = 'Use an approved migration with transaction-local catalog maintenance context.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function private.enforce_regulatory_catalog_integrity()
  from public, anon, authenticated, service_role;

drop trigger if exists regulatory_catalog_guard on public.controls;
create trigger regulatory_catalog_guard
before insert or delete or update on public.controls
for each row execute function private.enforce_regulatory_catalog_integrity();

drop trigger if exists regulatory_catalog_guard on public.frameworks;
create trigger regulatory_catalog_guard
before insert or delete or update on public.frameworks
for each row execute function private.enforce_regulatory_catalog_integrity();

-- Controls already have private.grc_audit. Add the same row-level audit to
-- framework catalog changes so every successful maintenance operation retains
-- before/after state. Rejected writes cannot alter data and therefore do not
-- create misleading audit records.
drop trigger if exists grc_audit on public.frameworks;
create trigger grc_audit
after insert or delete or update on public.frameworks
for each row execute function private.grc_audit();

comment on function private.enforce_regulatory_catalog_integrity() is
  'A-04 guard: regulatory catalog writes require a postgres migration session plus transaction-local maintenance flag and reason.';

commit;

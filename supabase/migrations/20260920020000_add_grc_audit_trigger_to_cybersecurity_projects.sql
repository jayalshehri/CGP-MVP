-- QA-ONLY. Closes an audit coverage gap: cybersecurity_projects was not
-- wired into private.grc_audit() alongside the other GRC-tracked tables.
--
-- Compatibility confirmed before writing this migration: cybersecurity_projects
-- has a single-column bigint `id` NOT NULL PK (matches the entity_id
-- derivation `row_data->>'id'`), and has no `control_id` column, so it falls
-- into the generic ELSE branch of grc_audit() the same way
-- cybersecurity_requirements already does (proven safe in the Phase 1
-- pilot) -- control_id on the resulting audit row will simply be NULL,
-- which grc_audit_events.control_id allows (nullable). No change to
-- private.grc_audit() itself, and no change to any RLS policy or existing
-- Project read/write behavior.

create trigger grc_audit
  after insert or update or delete on public.cybersecurity_projects
  for each row execute function private.grc_audit();

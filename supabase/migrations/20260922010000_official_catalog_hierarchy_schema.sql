-- QA-ONLY. Schema foundation for representing the official NCA regulatory
-- hierarchy (Framework -> Domain -> Subdomain -> Control -> Sub-control)
-- faithfully, without disrupting any existing table, FK, RLS policy, or
-- trigger. Chosen architecture: Option A (self-referencing parent_control_id
-- + hierarchy_level on the existing `controls` table) over a separate
-- sub_controls table — see nca_reconciliation/08_architecture_decision.md
-- for the full rationale. Every dependent table (evidence, evidence_requests,
-- evidence_control_links, control_review_cycles, control_assessments,
-- assessment_items, assessment_findings, cybersecurity_requirement_controls,
-- cybersecurity_project_controls, grc_audit_events, vulnerabilities,
-- feedback, control_owner_id) already keys on controls.id — this migration
-- keeps that true for sub-controls too, so all existing workflows extend to
-- the sub-control level with zero FK or RLS changes.
--
-- All statements are additive (new nullable columns, new constraint, new
-- index) and idempotent (IF NOT EXISTS / guarded DO blocks). No column is
-- dropped or renamed. `title_ar` is unchanged in meaning: it remains the
-- concise display/navigation label (existing synthetic values stay valid as
-- display labels going forward); it is simply no longer the only text a
-- control carries. `official_text_ar` is the new, explicit regulatory
-- source of truth and must never be synthesized.

alter table public.frameworks
  add column if not exists source_url text;

alter table public.controls
  add column if not exists official_text_ar text,
  add column if not exists source_page text,
  add column if not exists hierarchy_level text not null default 'control',
  add column if not exists parent_control_id bigint,
  add column if not exists applicability text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'controls_hierarchy_level_check'
  ) then
    alter table public.controls
      add constraint controls_hierarchy_level_check
      check (hierarchy_level in ('control', 'sub_control'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'controls_applicability_check'
  ) then
    alter table public.controls
      add constraint controls_applicability_check
      check (applicability is null or applicability in ('CSP', 'CST'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'controls_parent_control_id_fkey'
  ) then
    alter table public.controls
      add constraint controls_parent_control_id_fkey
      foreign key (parent_control_id) references public.controls (id) on delete restrict;
  end if;
end $$;

-- A sub_control must have a parent; a top-level control must not (parent
-- lives at the domain/subdomain level, which this model does not
-- materialize as rows — see architecture decision doc). Postgres CHECK
-- constraints cannot be DEFERRABLE, so a bulk hierarchical load must insert
-- every row as hierarchy_level='control' (parent_control_id null — always
-- valid) first, then flip true sub-controls to hierarchy_level='sub_control'
-- together with setting parent_control_id in the same UPDATE (see the data
-- correction migration's second pass) — both changes land in one row
-- version, so the constraint is satisfied at every intermediate state.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'controls_hierarchy_parent_check'
  ) then
    alter table public.controls
      add constraint controls_hierarchy_parent_check
      check (
        (hierarchy_level = 'control' and parent_control_id is null)
        or (hierarchy_level = 'sub_control' and parent_control_id is not null)
      );
  end if;
end $$;

-- Foundational data-integrity guard the official catalog correction depends
-- on: one row per (framework, official code). Did not previously exist —
-- confirmed via information_schema before writing this migration.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'controls_framework_code_unique'
  ) then
    alter table public.controls
      add constraint controls_framework_code_unique
      unique (framework_id, control_code);
  end if;
end $$;

create index if not exists controls_parent_control_id_idx on public.controls (parent_control_id);
create index if not exists controls_hierarchy_level_idx on public.controls (hierarchy_level);

comment on column public.controls.official_text_ar is 'The validated, verbatim official NCA Arabic regulatory text for this control/sub-control. Source of regulatory truth — never a synthesized label.';
comment on column public.controls.title_ar is 'Concise display/navigation label. Not regulatory text; may be synthetic. See official_text_ar for the authoritative wording.';
comment on column public.controls.hierarchy_level is 'control = top-level NCA control (الضابط الأساسي). sub_control = NCA numbered sub-item (الضابط الفرعي), independently assessable per NCA where the primary source defines one.';
comment on column public.controls.parent_control_id is 'Self-reference to the parent control row for hierarchy_level=sub_control rows. Null for hierarchy_level=control rows.';
comment on column public.controls.source_page is 'Page (or page range) in the official NCA source PDF where this item''s official text appears.';
comment on column public.controls.applicability is 'CSP or CST for frameworks that scope controls by audience (currently only CCC-2:2024). Null where not applicable.';
comment on column public.frameworks.source_url is 'Direct URL to the official NCA source document for this framework/version.';

-- Production-safe corrective migration: adds the Phase 1 pilot business data
-- (MDR-01 / VM-01 / PAM-01, their 3 requirements, 3 project<->requirement
-- links, and 12 requirement<->control links) that exists on CGP-QA but was
-- only ever applied there via an untracked local script
-- (cgp_qa_pilot_seed.sql, never committed to git). Without this migration,
-- applying the tracked release to Production would land at 27 projects / 55
-- requirements instead of the approved 30 / 58. This file is written fresh
-- from the current QA-approved state (read back directly from CGP-QA during
-- the Safety Gate review), not copied blindly from the untracked script.
--
-- No hardcoded IDs anywhere: projects and requirements are resolved by their
-- stable codes, controls by (framework_code, control_code) against the
-- existing controls catalog. No framework or control rows are inserted here
-- -- Production already has all 4 ECC controls each of these 3 requirements
-- need (2-2-1..4, 2-10-1..4, 2-12-1..4), verified read-only against the
-- 566-row catalog. No Evidence/Review/Assessment/compliance state touched.
-- Idempotent via WHERE NOT EXISTS guards.
--
-- Requires 20260919150000 (requirements layer), 20260920000000 (surrogate
-- ids), and 20260920060000 (mapping_confidence column) already applied.
-- mapping_confidence is set to 'confirmed' directly on insert for all 12
-- links, matching the QA-approved state exactly (all 12 pilot links were
-- reconciled and confirmed against the real ECC control text during Phase 2
-- -- see 20260920060000's own backfill list, which already carries these
-- same 12 triples for defense-in-depth on environments where this migration
-- runs before that backfill).

-- 1) Projects
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'MDR-01', 'Managed Detection & Response (MDR)', 2027, 'Q1', 'planned', 'high', 'managed_service'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'MDR-01');

insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'VM-01', 'Vulnerability Management (VM)', 2027, 'Q1', 'planned', 'high', 'continuous_activity'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'VM-01');

insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'PAM-01', 'Privileged Access Management (PAM)', 2027, 'Q1', 'planned', 'high', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'PAM-01');

-- 2) Requirements
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-SIEM-SOC', 'SIEM/SOC – السجلات والمراقبة الأمنية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-SIEM-SOC');

insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-VULN-MGMT', 'إدارة الثغرات الأمنية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-VULN-MGMT');

insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-PAM', 'إدارة الحسابات والصلاحيات المميزة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-PAM');

-- 3) Project <-> Requirement links (coverage_type: full, matching the QA-approved state)
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'MDR-01' and r.requirement_code = 'REQ-SIEM-SOC'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);

insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'VM-01' and r.requirement_code = 'REQ-VULN-MGMT'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);

insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'PAM-01' and r.requirement_code = 'REQ-PAM'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);

-- 4) Requirement <-> Control links: coverage_type and mapping_confidence
-- exactly matching the QA-approved state (all 12 Confirmed).
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type, mapping_confidence)
select r.id, ctl.id, v.coverage, 'confirmed'
from (values
  ('REQ-SIEM-SOC',  'ECC', '2-12-1', 'supporting'),
  ('REQ-SIEM-SOC',  'ECC', '2-12-2', 'full'),
  ('REQ-SIEM-SOC',  'ECC', '2-12-3', 'full'),
  ('REQ-SIEM-SOC',  'ECC', '2-12-4', 'supporting'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-1', 'supporting'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-2', 'full'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-3', 'partial'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-4', 'supporting'),
  ('REQ-PAM',       'ECC', '2-2-1',  'supporting'),
  ('REQ-PAM',       'ECC', '2-2-2',  'full'),
  ('REQ-PAM',       'ECC', '2-2-3',  'partial'),
  ('REQ-PAM',       'ECC', '2-2-4',  'supporting')
) as v(requirement_code, framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = v.requirement_code
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (
  select 1 from public.cybersecurity_requirement_controls existing
  where existing.requirement_id = r.id and existing.control_id = ctl.id
);

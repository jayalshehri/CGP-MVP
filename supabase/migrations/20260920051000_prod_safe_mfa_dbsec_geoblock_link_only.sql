-- Production-safe counterpart to 20260920050000_reconcile_mfa_dbsec_geoblock_mappings.sql.
--
-- The original 050000 mixed two things: (a) inserting 5 CSCC sub-controls
-- (2-2-1-1, 2-2-1-2, 2-2-1-3, 2-2-1-4, 2-2-1-8) that were missing from QA's
-- partial reference-catalog subset, and (b) correcting the REQ-MFA /
-- REQ-DB-SECURITY / REQ-GEO-BLOCKING requirement<->control links to point at
-- those exact controls instead of the earlier coarse fallback. Production
-- already has all 5 of those controls in its real catalog (verified
-- read-only against the 566-row controls table during the Safety Gate
-- review), so only part (b) applies here. This file intentionally excludes
-- every "insert into public.controls" statement. The historical QA-only
-- 050000 file is left exactly as written -- this is a new, separate file,
-- not an edit of it.
--
-- No frameworks or controls are inserted. Controls are resolved purely by
-- (framework_code, control_code) against Production's existing catalog. No
-- hardcoded IDs. No Evidence/Review/Assessment/compliance state touched.
-- Idempotent via WHERE NOT EXISTS / scoped DELETE guards -- safe to re-run.
--
-- Must run AFTER 20260920040000 (creates REQ-MFA/REQ-DB-SECURITY/
-- REQ-GEO-BLOCKING and their initial coarse links) and BEFORE 20260920060000
-- (whose mapping_confidence backfill list already expects these corrected
-- links to exist under 2-2-1-1/1-2/1-3/1-4/1-8).

-- REQ-MFA: remove the coarse fallback (2-2-1 / 2-2-2), add the exact MFA sub-items
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-MFA' and f.code = 'CSCC' and c.control_code in ('2-2-1', '2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-MFA' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code in ('2-2-1-3', '2-2-1-4')
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

-- REQ-DB-SECURITY: remove the coarse fallback, add the exact database-access-control sub-item
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-DB-SECURITY' and f.code = 'CSCC' and c.control_code in ('2-2-1', '2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-DB-SECURITY' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code = '2-2-1-8'
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

-- REQ-GEO-BLOCKING: remove the coarse fallback, add the exact geo/location access-control sub-items
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-GEO-BLOCKING' and f.code = 'CSCC' and c.control_code in ('2-2-1', '2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-GEO-BLOCKING' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code in ('2-2-1-1', '2-2-1-2')
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

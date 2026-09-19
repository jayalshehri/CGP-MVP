-- Removes control_notes and control_work_items. Confirmed zero references in
-- application code, RPC/private functions, triggers, or any other migration
-- besides their own creation (20260903070000) and a one-time historical
-- EXISTS guard in 20260907023000 that already executed. Their only content
-- was pre-launch development/test rows (control_notes: literal "test"/"test2"/
-- "test 3"; control_work_items: manual checklist flags on early ECC test
-- controls). Both fully exported to backups/ before this migration. Superseded
-- functionally by control_review_cycles / evidence_requests.

drop table if exists public.control_notes;
drop table if exists public.control_work_items;

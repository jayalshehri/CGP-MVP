-- QA ONLY: transaction-scoped bulk assignment atomicity/security regression.
-- Executed against isolated CGP-QA on 2026-11-17; all changes rolled back.
-- Requires clean QA baseline (364 rows, no assignments/audit) and two
-- active control_owner QA profiles. Uses role impersonation, NOT real login.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>364
    OR EXISTS (SELECT 1 FROM public.nudee_assignments)
    OR EXISTS (SELECT 1 FROM public.nudee_audit)
    OR (SELECT count(*) FROM public.profiles WHERE role='control_owner' AND is_active)<2
 THEN RAISE EXCEPTION 'QA baseline is not clean'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.req1',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row LIMIT 1),true);
SELECT set_config('qa.req2',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row OFFSET 1 LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id=current_setting('qa.office')::uuid;
UPDATE public.profiles SET role='nudee_owner' WHERE user_id=current_setting('qa.owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);

-- Force failure at the third ID: preceding inserts and audit must not survive.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.nudee_assign_many(
    ARRAY[current_setting('qa.req1')::bigint,current_setting('qa.req2')::bigint,999999999::bigint],
    current_setting('qa.owner')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected invalid third requirement to reject batch'; END IF;
 IF EXISTS(SELECT 1 FROM public.nudee_assignments) OR EXISTS(SELECT 1 FROM public.nudee_audit)
 THEN RAISE EXCEPTION 'Partial writes survived failed batch'; END IF;
END $$;

-- Reject duplicates without modifying records.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.nudee_assign_many(
    ARRAY[current_setting('qa.req1')::bigint,current_setting('qa.req1')::bigint],
    current_setting('qa.owner')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Duplicate IDs accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public.nudee_assignments) THEN
  RAISE EXCEPTION 'Duplicate rejection left assignment'; END IF;
END $$;

-- A valid batch must create exactly two assignments and two audit events.
DO $$
DECLARE c integer;
BEGIN
 SELECT public.nudee_assign_many(
  ARRAY[current_setting('qa.req1')::bigint,current_setting('qa.req2')::bigint],
  current_setting('qa.owner')::uuid,NULL) INTO c;
 IF c<>2 OR (SELECT count(*) FROM public.nudee_assignments)<>2
     OR (SELECT count(*) FROM public.nudee_audit WHERE action='assigned')<>2
 THEN RAISE EXCEPTION 'Successful batch did not assign and audit exactly two'; END IF;
END $$;

-- A dedicated Nudee owner is forbidden from assigning, even to themselves.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.nudee_assign_many(
    ARRAY[current_setting('qa.req1')::bigint],
    current_setting('qa.owner')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Nudee owner could bulk assign'; END IF;
 IF (SELECT count(*) FROM public.nudee_audit)<>2 THEN
  RAISE EXCEPTION 'Owner invalid attempt generated audit'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
-- Independent confirmation that the clean QA baseline was preserved.
SELECT jsonb_build_object(
 'requirements',(SELECT count(*) FROM public.nudee_requirements),
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'audit',(SELECT count(*) FROM public.nudee_audit),
 'storage_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence'),
 'temporary_roles',(SELECT count(*) FROM public.profiles WHERE role IN ('nudee_owner','data_governance_team'))
) AS qa_post_rollback;
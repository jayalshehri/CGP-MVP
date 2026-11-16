-- QA ONLY. Transactional SQL regression for PR #237's dedicated Nudee owner.
-- Preconditions: isolated CGP-QA, imported 364 requirements, no existing Nudee
-- assignments or submissions, and at least two active control_owner profiles.
-- Execute the ENTIRE script as one request. All mutations are rolled back.
-- This is DB/RLS impersonation, NOT a real login, Storage binary, or browser test.
BEGIN;

DO $$
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements) <> 364
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_submissions)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN
   RAISE EXCEPTION 'Refusing QA regression: expected clean Nudee state with 364 requirements';
 END IF;
END $$;

SELECT set_config('qa.nudee_office_user', (
  SELECT user_id::text FROM public.profiles
  WHERE role='control_owner' AND is_active ORDER BY user_id LIMIT 1
), true);
SELECT set_config('qa.nudee_owner_user', (
  SELECT user_id::text FROM public.profiles
  WHERE role='control_owner' AND is_active ORDER BY user_id OFFSET 1 LIMIT 1
), true);

DO $$
BEGIN
 IF nullif(current_setting('qa.nudee_office_user',true),'') IS NULL
    OR nullif(current_setting('qa.nudee_owner_user',true),'') IS NULL
 THEN RAISE EXCEPTION 'Need two active QA control-owner principals'; END IF;
END $$;

-- Temporarily switch two existing QA profiles to the proposed roles.
UPDATE public.profiles SET role='data_governance_team'
 WHERE user_id=current_setting('qa.nudee_office_user')::uuid;
UPDATE public.profiles SET role='nudee_owner'
 WHERE user_id=current_setting('qa.nudee_owner_user')::uuid;

SET LOCAL ROLE authenticated;
-- Before any assignment, the restricted owner must see only their own profile.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.nudee_owner_user'),true);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements) <> 0
    OR (SELECT count(*) FROM public.nudee_assignments) <> 0
    OR (SELECT count(*) FROM public.controls) <> 0
    OR (SELECT count(*) FROM public.evidence) <> 0
    OR (SELECT count(*) FROM public.cybersecurity_projects) <> 0
    OR (SELECT count(*) FROM public.nudee_final_review) <> 0
    OR (SELECT count(*) FROM public.profiles) <> 1
 THEN
   RAISE EXCEPTION 'Unassigned Nudee owner can read unauthorized data or profiles';
 END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.nudee_office_user'),true);

DO $$
DECLARE v_owner uuid; v_requirement bigint; v_assignment bigint;
BEGIN
 IF NOT public.nudee_is_office() THEN
   RAISE EXCEPTION 'Data Office principal denied office role';
 END IF;
 SELECT a.user_id INTO v_owner
 FROM public.nudee_assignees() a WHERE a.role='nudee_owner' LIMIT 1;
 IF v_owner IS DISTINCT FROM current_setting('qa.nudee_owner_user')::uuid THEN
   RAISE EXCEPTION 'Assignee directory did not return dedicated Nudee owner';
 END IF;
 SELECT id INTO v_requirement FROM public.nudee_requirements ORDER BY source_row LIMIT 1;
 SELECT public.nudee_assign(v_requirement,v_owner,NULL) INTO v_assignment;
 IF v_assignment IS NULL THEN RAISE EXCEPTION 'Office unable to assign Nudee requirement'; END IF;
END $$;

-- Change the same authenticated SQL session to the assigned restricted owner.
SELECT set_config('request.jwt.claim.sub',current_setting('qa.nudee_owner_user'),true);

DO $$
DECLARE v_reqs bigint; v_assignments bigint; v_cyber bigint;
        v_denied boolean := false;
BEGIN
 IF public.nudee_is_office() THEN RAISE EXCEPTION 'Owner escalated to Data Office'; END IF;
 SELECT count(*) INTO v_reqs FROM public.nudee_requirements;
 SELECT count(*) INTO v_assignments FROM public.nudee_assignments;
 IF v_reqs<>1 OR v_assignments<>1 THEN
   RAISE EXCEPTION 'Owner scope incorrect: requirements %, assignments %',v_reqs,v_assignments;
 END IF;
 BEGIN
   PERFORM * FROM public.nudee_assignees();
 EXCEPTION WHEN OTHERS THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Owner could list the office assignee directory'; END IF;
 v_denied:=false;
 BEGIN
   PERFORM public.nudee_assign(
     (SELECT id FROM public.nudee_requirements LIMIT 1),
     current_setting('qa.nudee_owner_user')::uuid,NULL
   );
 EXCEPTION WHEN OTHERS THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Owner could self-assign'; END IF;
 BEGIN
   SELECT count(*) INTO v_cyber FROM public.controls;
   IF v_cyber>0 THEN RAISE EXCEPTION 'Owner could read cybersecurity controls: %',v_cyber; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

RESET ROLE;
ROLLBACK;

-- After running, independently query Nudee assignments/submissions/audit and
-- the two profile roles to confirm that the transaction left no changes.

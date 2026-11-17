-- CGP-QA ONLY: least-privilege Nudee assignment regression.
-- SQL auth-claim impersonation, NOT two authenticated browser sessions.
-- All writes are rolled back; expected 364 imported requirements and no assignments.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>364
   OR EXISTS(SELECT 1 FROM public.nudee_assignments)
   OR EXISTS(SELECT 1 FROM public.nudee_audit)
   OR (SELECT count(*) FROM public.profiles WHERE role='control_owner' AND is_active)<1
   OR (SELECT count(*) FROM public.profiles WHERE role='cybersecurity_team' AND is_active)<1
 THEN RAISE EXCEPTION 'QA baseline not clean or required synthetic principals unavailable'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles WHERE role='admin' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.cyber',(SELECT user_id::text FROM public.profiles WHERE role='cybersecurity_team' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.req',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row LIMIT 1),true);
UPDATE public.profiles SET role='nudee_owner' WHERE user_id=current_setting('qa.owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
DO $$
DECLARE v_rejected boolean := false; v_id bigint;
BEGIN
 IF (SELECT count(*) FROM public.nudee_assignees())<>1
    OR (SELECT count(*) FROM public.nudee_assignees() WHERE role='nudee_owner'
         AND user_id=current_setting('qa.owner')::uuid)<>1
 THEN RAISE EXCEPTION 'Directory leaked other application roles'; END IF;
 BEGIN
   PERFORM public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.cyber')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Cybersecurity team was allowed as Nudee assignee'; END IF;
 IF EXISTS(SELECT 1 FROM public.nudee_assignments)
   OR EXISTS(SELECT 1 FROM public.nudee_audit)
 THEN RAISE EXCEPTION 'Rejected direct assignment wrote rows'; END IF;
 v_rejected := false;
 BEGIN
   PERFORM public.nudee_assign_many(ARRAY[current_setting('qa.req')::bigint],current_setting('qa.cyber')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN v_rejected:=true; END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'Cybersecurity team was allowed in bulk assignment'; END IF;
 IF EXISTS(SELECT 1 FROM public.nudee_assignments)
   OR EXISTS(SELECT 1 FROM public.nudee_audit)
 THEN RAISE EXCEPTION 'Rejected bulk assignment wrote rows'; END IF;
 SELECT public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.owner')::uuid,NULL) INTO v_id;
 IF v_id IS NULL OR (SELECT count(*) FROM public.nudee_assignments)<>1
    OR (SELECT count(*) FROM public.nudee_audit)<>1
 THEN RAISE EXCEPTION 'Dedicated owner positive assignment/audit failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.cyber'),true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
 THEN RAISE EXCEPTION 'Non-assigned cybersecurity principal saw Nudee data'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
DO $$
DECLARE v_denied boolean:=false;
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>1
    OR (SELECT count(*) FROM public.nudee_assignments)<>1
 THEN RAISE EXCEPTION 'Dedicated owner assignment scope failed'; END IF;
 BEGIN PERFORM * FROM public.nudee_assignees();
 EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'Nudee owner read office assignee directory'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object(
 'status','PASS: dedicated Nudee owner only; directory, direct and bulk RPC, RLS; rollback',
 'requirements',(SELECT count(*) FROM public.nudee_requirements),
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'audit',(SELECT count(*) FROM public.nudee_audit),
 'temporary_roles',(SELECT count(*) FROM public.profiles WHERE role IN ('nudee_owner','data_governance_team'))
) AS qa_dedicated_owner_result;
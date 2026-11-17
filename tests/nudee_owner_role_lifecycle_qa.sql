-- CGP-QA ONLY. Run the whole script in one request. All data writes roll back.
-- Requires two unassigned active QA control_owner profiles and two unassigned requirements.
-- Existing QA UAT assignments/files are preserved; fixtures use only unassigned principals/requirements.
-- SQL auth-claim/RLS test with Storage metadata, NOT login/binary Storage/E2E.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements r WHERE NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.requirement_id=r.id)) < 2
    OR (SELECT count(*) FROM public.profiles p WHERE p.role='control_owner' AND p.is_active AND NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.assignee_id=p.user_id)) < 2
 THEN RAISE EXCEPTION 'Refusing role-lifecycle regression: need isolated unassigned QA principals/requirements'; END IF;
END $$;
SELECT set_config('qa.lifecycle_baseline_req',(SELECT count(*)::text FROM public.nudee_requirements),true);
SELECT set_config('qa.lifecycle_baseline_sub',(SELECT count(*)::text FROM public.nudee_submissions),true);
SELECT set_config('qa.lifecycle_baseline_audit',(SELECT count(*)::text FROM public.nudee_audit),true);
SELECT set_config('qa.lifecycle_baseline_storage',(SELECT count(*)::text FROM storage.objects WHERE bucket_id='nudee-evidence'),true);
SELECT set_config('qa.lifecycle_office',(SELECT user_id::text FROM public.profiles p WHERE role='control_owner' AND is_active AND NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.assignee_id=p.user_id) ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.lifecycle_owner',(SELECT user_id::text FROM public.profiles p WHERE role='control_owner' AND is_active AND NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.assignee_id=p.user_id) ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.lifecycle_req1',(SELECT id::text FROM public.nudee_requirements r WHERE NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.requirement_id=r.id) ORDER BY source_row LIMIT 1),true);
SELECT set_config('qa.lifecycle_req2',(SELECT id::text FROM public.nudee_requirements r WHERE NOT EXISTS(SELECT 1 FROM public.nudee_assignments a WHERE a.requirement_id=r.id) ORDER BY source_row OFFSET 1 LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id=current_setting('qa.lifecycle_office')::uuid;
UPDATE public.profiles SET role='nudee_owner' WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_office'),true);
SELECT set_config('qa.lifecycle_a1',public.nudee_assign(current_setting('qa.lifecycle_req1')::bigint,current_setting('qa.lifecycle_owner')::uuid,NULL)::text,true);
SELECT set_config('qa.lifecycle_a2',public.nudee_assign(current_setting('qa.lifecycle_req2')::bigint,current_setting('qa.lifecycle_owner')::uuid,NULL)::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES ('nudee-evidence',current_setting('qa.lifecycle_a1')||'/QA-LIFECYCLE/submitted.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner')),
       ('nudee-evidence',current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner'));
SELECT public.nudee_submit_evidence(current_setting('qa.lifecycle_a1')::bigint,current_setting('qa.lifecycle_a1')||'/QA-LIFECYCLE/submitted.pdf','submitted.pdf');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>2
    OR (SELECT count(*) FROM public.nudee_assignments)<>2
    OR (SELECT count(*) FROM public.nudee_submissions)<>1
    OR (SELECT count(*) FROM public.nudee_audit)<>3
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence')<>2
 THEN RAISE EXCEPTION 'Positive assigned-owner fixture failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.nudee_final_review)
    OR EXISTS(SELECT 1 FROM public.nudee_final_review_audit)
 THEN RAISE EXCEPTION 'Owner gained office progress access'; END IF;
END $$;

-- Existing assignments must not preserve permissions after transition to cybersecurity_team, active=True.
RESET ROLE;
UPDATE public.profiles SET role='cybersecurity_team',is_active=true WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_submissions)
    OR EXISTS(SELECT 1 FROM public.nudee_audit)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'Role-lifecycle data/Storage leak: cybersecurity_team, active=True'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/denied-cybersecurity_team.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner'));
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can upload: cybersecurity_team, active=True'; END IF;
 denied := false;
 BEGIN
  PERFORM public.nudee_submit_evidence(current_setting('qa.lifecycle_a2')::bigint,current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf','unsent.pdf');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'Assignment not eligible for submission' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can submit: cybersecurity_team, active=True'; END IF;
END $$;

-- Existing assignments must not preserve permissions after transition to control_owner, active=True.
RESET ROLE;
UPDATE public.profiles SET role='control_owner',is_active=true WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_submissions)
    OR EXISTS(SELECT 1 FROM public.nudee_audit)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'Role-lifecycle data/Storage leak: control_owner, active=True'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/denied-control_owner.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner'));
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can upload: control_owner, active=True'; END IF;
 denied := false;
 BEGIN
  PERFORM public.nudee_submit_evidence(current_setting('qa.lifecycle_a2')::bigint,current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf','unsent.pdf');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'Assignment not eligible for submission' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can submit: control_owner, active=True'; END IF;
END $$;

-- Existing assignments must not preserve permissions after transition to nca_external_auditor, active=True.
RESET ROLE;
UPDATE public.profiles SET role='nca_external_auditor',is_active=true WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_submissions)
    OR EXISTS(SELECT 1 FROM public.nudee_audit)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'Role-lifecycle data/Storage leak: nca_external_auditor, active=True'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/denied-nca_external_auditor.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner'));
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can upload: nca_external_auditor, active=True'; END IF;
 denied := false;
 BEGIN
  PERFORM public.nudee_submit_evidence(current_setting('qa.lifecycle_a2')::bigint,current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf','unsent.pdf');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'Assignment not eligible for submission' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can submit: nca_external_auditor, active=True'; END IF;
END $$;

-- Existing assignments must not preserve permissions after transition to nudee_owner, active=False.
RESET ROLE;
UPDATE public.profiles SET role='nudee_owner',is_active=false WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
    OR EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_submissions)
    OR EXISTS(SELECT 1 FROM public.nudee_audit)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'Role-lifecycle data/Storage leak: nudee_owner, active=False'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/denied-nudee_owner.pdf',current_setting('qa.lifecycle_owner')::uuid,current_setting('qa.lifecycle_owner'));
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can upload: nudee_owner, active=False'; END IF;
 denied := false;
 BEGIN
  PERFORM public.nudee_submit_evidence(current_setting('qa.lifecycle_a2')::bigint,current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf','unsent.pdf');
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'Assignment not eligible for submission' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked owner can submit: nudee_owner, active=False'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='nudee_owner',is_active=true WHERE user_id=current_setting('qa.lifecycle_owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_owner'),true);
SELECT public.nudee_submit_evidence(current_setting('qa.lifecycle_a2')::bigint,current_setting('qa.lifecycle_a2')||'/QA-LIFECYCLE/unsent.pdf','unsent.pdf');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nudee_submissions)<>2
 THEN RAISE EXCEPTION 'Restored dedicated owner could not submit existing evidence'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.lifecycle_office'),true);
SELECT public.nudee_review_evidence(current_setting('qa.lifecycle_a1')::bigint,'approved',NULL);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>current_setting('qa.lifecycle_baseline_req')::bigint
    OR (SELECT count(*) FROM public.nudee_submissions)<>current_setting('qa.lifecycle_baseline_sub')::bigint+2
    OR (SELECT count(*) FROM public.nudee_audit)<>current_setting('qa.lifecycle_baseline_audit')::bigint+5
    OR (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence')<>current_setting('qa.lifecycle_baseline_storage')::bigint+2
 THEN RAISE EXCEPTION 'Office rights/audit changed unexpectedly'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object(
 'result','PASS: current role required across owner data reads, Storage metadata upload/read and submit; office review preserved; rollback',
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'submissions',(SELECT count(*) FROM public.nudee_submissions),
 'audit',(SELECT count(*) FROM public.nudee_audit),
 'storage_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence')
) AS qa_lifecycle_result;
-- Real Storage API delete and signed URL behaviour must still be tested separately.

-- QA ONLY. Execute as one SQL request against CGP-QA. Tested 2026-11-17.
-- Proves an authenticated assignee cannot forge Storage object owner_id.
-- Metadata-only regression; this is NOT a real binary Storage API upload.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements)<>364
 OR EXISTS (SELECT 1 FROM public.nudee_assignments)
 OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 OR (SELECT count(*) FROM public.profiles WHERE role='control_owner' AND is_active)<2
 THEN RAISE EXCEPTION 'QA baseline not suitable for owner binding regression'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.req',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id=current_setting('qa.office')::uuid;
UPDATE public.profiles SET role='nudee_owner' WHERE user_id=current_setting('qa.owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT set_config('qa.assignment',public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.owner')::uuid,NULL)::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
    VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-OWNER-FORGE/forged.pdf',
      current_setting('qa.owner')::uuid, '00000000-0000-0000-0000-000000000001');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'SECURITY FAIL: RLS accepted forged owner_id'; END IF;
 INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
    VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-OWNER-FORGE/legit.pdf',
      current_setting('qa.owner')::uuid,current_setting('qa.owner'));
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence')<>1
 THEN RAISE EXCEPTION 'Valid upload metadata must be visible to assigned owner'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT jsonb_build_object(
 'result','PASS: forged owner_id denied; correct owner_id accepted; transaction rolled back',
 'requirements',(SELECT count(*) FROM public.nudee_requirements),
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'submissions',(SELECT count(*) FROM public.nudee_submissions),
 'storage_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence'),
 'nudee_role_profiles',(SELECT count(*) FROM public.profiles WHERE role='nudee_owner')
) AS qa_owner_guard_result;

-- CGP-QA ONLY. Rollback-only metadata/RLS test (not Storage HTTP bytes or signed URLs).
-- A Storage upload could commit across reassignment. The new assignee must
-- never inherit read access to a previously assigned user's Storage objects.
-- Direct DELETE is prohibited by Supabase storage.protect_delete(); inspect its
-- RLS predicate here, and test actual DELETE via authenticated Storage API in E2E.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.nudee_requirements) <> 364
     OR EXISTS(SELECT 1 FROM public.nudee_assignments)
     OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
     OR (SELECT count(*) FROM public.profiles WHERE is_active AND role='control_owner') < 3
  THEN RAISE EXCEPTION 'QA baseline not clean'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.old_owner',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.new_owner',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 2 LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id=current_setting('qa.office')::uuid;
UPDATE public.profiles SET role='nudee_owner' WHERE user_id IN(current_setting('qa.old_owner')::uuid,current_setting('qa.new_owner')::uuid);
SELECT set_config('qa.req',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT set_config('qa.assignment',public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.old_owner')::uuid,NULL)::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.old_owner'),true);
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-CROSS-OWNER/old.pdf',
 current_setting('qa.old_owner')::uuid,current_setting('qa.old_owner'));
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-CROSS-OWNER%')<>1
 THEN RAISE EXCEPTION 'Original owner must see own object'; END IF;
END $$;
RESET ROLE;
-- Privileged synthetic reassignment models a late upload commit (does not
-- claim the application RPC permits reassignment after an orphan is present).
UPDATE public.nudee_assignments SET assignee_id=current_setting('qa.new_owner')::uuid
 WHERE id=current_setting('qa.assignment')::bigint;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.new_owner'),true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-CROSS-OWNER%')
 THEN RAISE EXCEPTION 'SECURITY FAIL: new assignee can see former owner evidence'; END IF;
END $$;
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-CROSS-OWNER/new.pdf',
 current_setting('qa.new_owner')::uuid,current_setting('qa.new_owner'));
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-CROSS-OWNER%')<>1
 THEN RAISE EXCEPTION 'New owner must see only own evidence'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.old_owner'),true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-CROSS-OWNER%')
 THEN RAISE EXCEPTION 'Former assignee can still see folder'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-CROSS-OWNER%')<>2
 THEN RAISE EXCEPTION 'Office cannot inspect both objects for cleanup'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
  AND policyname='nudee_storage_delete_unsent'
  AND qual LIKE '%owner_id =%' AND qual LIKE '%nudee_is_office%')
 THEN RAISE EXCEPTION 'Delete policy lacks uploader identity check'; END IF;
END $$;
ROLLBACK;
SELECT jsonb_build_object(
 'result','PASS: ownership-scoped metadata RLS; rollback complete; real API E2E remains',
 'requirements',(SELECT count(*) FROM public.nudee_requirements),
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence'),
 'nudee_owners',(SELECT count(*) FROM public.profiles WHERE role='nudee_owner')
) AS qa_cross_owner_result;

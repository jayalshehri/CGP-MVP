-- QA ONLY: tested 2026-11-17 on isolated CGP-QA.
-- Metadata-only RLS regression: NOT actual file bytes / Storage HTTP / signed URLs.
-- Requires an otherwise clean QA baseline, three active control_owner test profiles,
-- the seven Nudee migrations and the 364-row import.
-- Run in ONE SQL request; all mutations are rolled back.
BEGIN;
DO $$
BEGIN
 IF (SELECT count(*) FROM public.nudee_requirements) <> 364
 OR EXISTS (SELECT 1 FROM public.nudee_assignments)
 OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'QA baseline not clean'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE role='control_owner' AND is_active)<3
 THEN RAISE EXCEPTION 'Need 3 QA identities'; END IF;
 IF NOT has_table_privilege('authenticated','storage.objects','INSERT')
 THEN RAISE EXCEPTION 'Authenticated lacks Storage INSERT privilege: RLS test invalid'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.other',(SELECT user_id::text FROM public.profiles WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 2 LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id=current_setting('qa.office')::uuid;
UPDATE public.profiles SET role='nudee_owner' WHERE user_id IN (current_setting('qa.owner')::uuid,current_setting('qa.other')::uuid);
SELECT set_config('qa.req',(SELECT id::text FROM public.nudee_requirements ORDER BY source_row LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT set_config('qa.assignment',public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.owner')::uuid,NULL)::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-STORAGE-RLS-NONBINARY/one.pdf',
current_setting('qa.owner')::uuid,current_setting('qa.owner'));
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-STORAGE-RLS-NONBINARY%')<>1
 THEN RAISE EXCEPTION 'Assigned owner should read own Storage metadata'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-STORAGE-RLS-NONBINARY%')
 THEN RAISE EXCEPTION 'Unassigned owner can see evidence'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-STORAGE-RLS-NONBINARY/other.pdf',
    current_setting('qa.other')::uuid,current_setting('qa.other'));
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Unassigned owner could insert Storage metadata'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
DO $$
DECLARE denied boolean:=false;
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-STORAGE-RLS-NONBINARY%')<>1
 THEN RAISE EXCEPTION 'Office cannot read evidence'; END IF;
 BEGIN
  PERFORM public.nudee_assign(current_setting('qa.req')::bigint,current_setting('qa.other')::uuid,NULL);
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Office reassigned with orphan metadata present'; END IF;
END $$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE user_id=current_setting('qa.owner')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
DO $$
DECLARE denied boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence' AND name LIKE '%QA-STORAGE-RLS-NONBINARY%')
 THEN RAISE EXCEPTION 'Inactive owner can still read evidence'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
  VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-STORAGE-RLS-NONBINARY/inactive.pdf',
    current_setting('qa.owner')::uuid,current_setting('qa.owner'));
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive owner could upload'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
-- Must return 364 source rows, zero assignments/objects/temporary Nudee roles.
SELECT jsonb_build_object('requirements',(SELECT count(*) FROM public.nudee_requirements),
'assignments',(SELECT count(*) FROM public.nudee_assignments),
'evidence_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence'),
'remaining_nudee_owners',(SELECT count(*) FROM public.profiles WHERE role='nudee_owner')
) AS qa_post_rollback;

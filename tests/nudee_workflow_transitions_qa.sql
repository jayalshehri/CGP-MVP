-- QA ONLY: tested 2026-11-17 against isolated CGP-QA (364 requirements).
-- All test writes occur in one transaction and are rolled back.
-- This tests real database/RLS/RPC transitions, but uses simulated Storage
-- METADATA. It does NOT test uploading or downloading binary files over HTTP,
-- invitation/activation, separate signed-in browser sessions, or visual RTL.
-- Run the full script as ONE SQL request on the designated QA database only.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.nudee_requirements) <> 364
     OR EXISTS(SELECT 1 FROM public.nudee_assignments)
     OR EXISTS(SELECT 1 FROM public.nudee_submissions)
     OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
  THEN RAISE EXCEPTION 'QA baseline is not clean'; END IF;
END $$;
SELECT set_config('qa.office',(SELECT user_id::text FROM public.profiles
 WHERE is_active AND role='control_owner' ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.owner',(SELECT user_id::text FROM public.profiles
 WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.other',(SELECT user_id::text FROM public.profiles
 WHERE is_active AND role='control_owner' ORDER BY user_id OFFSET 2 LIMIT 1),true);
UPDATE public.profiles SET role='data_governance_team'
 WHERE user_id=current_setting('qa.office')::uuid;
UPDATE public.profiles SET role='nudee_owner'
 WHERE user_id IN (current_setting('qa.owner')::uuid,current_setting('qa.other')::uuid);
SELECT set_config('qa.requirement',(SELECT id::text FROM public.nudee_requirements
 ORDER BY source_row LIMIT 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT set_config('qa.assignment',public.nudee_assign(
 current_setting('qa.requirement')::bigint,current_setting('qa.owner')::uuid,NULL)::text,true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.other'),true);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_assignments)
    OR EXISTS(SELECT 1 FROM public.nudee_requirements)
 THEN RAISE EXCEPTION 'Unassigned third-party owner could see requirements'; END IF;
END $$;
-- Simulated Storage metadata, inserted with privileged QA SQL tooling.
-- These are NOT Storage API uploads and contain no actual file bytes.
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-CONTRACT-TEST/first.pdf',
 current_setting('qa.owner')::uuid,current_setting('qa.owner'));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SELECT public.nudee_submit_evidence(current_setting('qa.assignment')::bigint,
 current_setting('qa.assignment')||'/QA-CONTRACT-TEST/first.pdf','first.pdf');
DO $$
DECLARE denied boolean:=false;
BEGIN
 IF (SELECT status FROM public.nudee_assignments LIMIT 1)<>'submitted'
    OR (SELECT count(*) FROM public.nudee_submissions)<>1
 THEN RAISE EXCEPTION 'Submission transition or visibility failed'; END IF;
 BEGIN
   PERFORM public.nudee_review_evidence(current_setting('qa.assignment')::bigint,'approved',NULL);
 EXCEPTION WHEN OTHERS THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Owner reviewed own evidence'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT public.nudee_review_evidence(current_setting('qa.assignment')::bigint,
 'changes_requested','QA revision required');
DO $$
BEGIN
 IF (SELECT status FROM public.nudee_assignments LIMIT 1)<>'changes_requested'
 THEN RAISE EXCEPTION 'Return for changes failed'; END IF;
END $$;
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name,owner,owner_id)
VALUES('nudee-evidence',current_setting('qa.assignment')||'/QA-CONTRACT-TEST/revision.pdf',
 current_setting('qa.owner')::uuid,current_setting('qa.owner'));
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
SELECT public.nudee_submit_evidence(current_setting('qa.assignment')::bigint,
 current_setting('qa.assignment')||'/QA-CONTRACT-TEST/revision.pdf','revision.pdf');
SELECT set_config('request.jwt.claim.sub',current_setting('qa.office'),true);
SELECT public.nudee_review_evidence(current_setting('qa.assignment')::bigint,
 'approved','QA review complete');
DO $$
BEGIN
 IF (SELECT status FROM public.nudee_assignments LIMIT 1)<>'approved'
 OR (SELECT count(*) FROM public.nudee_submissions)<>2
 OR (SELECT count(*) FROM public.nudee_audit)<>5
 OR (SELECT count(*) FROM public.nudee_audit WHERE action='assigned')<>1
 OR (SELECT count(*) FROM public.nudee_audit WHERE action='submitted')<>2
 OR (SELECT count(*) FROM public.nudee_audit WHERE action='changes_requested')<>1
 OR (SELECT count(*) FROM public.nudee_audit WHERE action='approved')<>1
 THEN RAISE EXCEPTION 'Approval or append-only audit history invalid'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
-- Must report 364 requirements, and 0 for each of the other four fields.
SELECT jsonb_build_object(
 'requirements',(SELECT count(*) FROM public.nudee_requirements),
 'assignments',(SELECT count(*) FROM public.nudee_assignments),
 'submissions',(SELECT count(*) FROM public.nudee_submissions),
 'audit',(SELECT count(*) FROM public.nudee_audit),
 'evidence_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='nudee-evidence')
) AS qa_post_rollback;

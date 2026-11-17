-- QA regression: de-role an active assigned Nudee owner temporarily.
-- Requires at least one approved/assigned dedicated QA owner; all test writes ROLLBACK.
-- Exercises actual SECURITY INVOKER RLS under authenticated role, not browser E2E.
BEGIN;
SELECT set_config('nudee.qa.owner',(
 SELECT a.assignee_id::text
 FROM public.nudee_assignments a
 JOIN public.profiles p ON p.user_id=a.assignee_id
 WHERE p.role='nudee_owner' AND p.is_active
 ORDER BY a.id DESC LIMIT 1
),true);
DO $$ BEGIN
 IF nullif(current_setting('nudee.qa.owner',true),'') IS NULL THEN
   RAISE EXCEPTION 'BLOCKED: need one real assigned active Nudee owner';
 END IF;
END $$;
UPDATE public.profiles SET role='control_owner'
 WHERE user_id=current_setting('nudee.qa.owner')::uuid AND role='nudee_owner';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('nudee.qa.owner'),true);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.nudee_requirements)
 OR EXISTS(SELECT 1 FROM public.nudee_assignments)
 OR EXISTS(SELECT 1 FROM public.nudee_submissions)
 OR EXISTS(SELECT 1 FROM public.nudee_audit)
 OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='nudee-evidence')
 THEN RAISE EXCEPTION 'FAIL: former Nudee owner retains protected data access';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: former Nudee owner loses all Nudee metadata and Storage visibility; role reverted' AS role_lifecycle_guard;

-- CGP-QA ONLY. Execute whole script as one request; all test data/roles roll back.
-- Covers direct API initial-state bypass and nullable role checks in SECURITY DEFINER RPC.
-- SQL role impersonation, not authenticated browser UAT.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles WHERE role='control_owner' AND is_active)<2
 THEN RAISE EXCEPTION 'Need two active synthetic QA control-owner profiles'; END IF;
END $$;
SELECT set_config('qa.dg_maker',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.dg_reviewer',(SELECT user_id::text FROM public.profiles WHERE role='control_owner' AND is_active ORDER BY user_id OFFSET 1 LIMIT 1),true);
SELECT set_config('qa.dg_nonce',gen_random_uuid()::text,true);
UPDATE public.profiles SET role='data_governance_team' WHERE user_id IN (current_setting('qa.dg_maker')::uuid,current_setting('qa.dg_reviewer')::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_maker'),true);
DO $$
DECLARE denied boolean := false; req bigint;
BEGIN
 BEGIN
  INSERT INTO public.data_governance_requests(request_code,request_type,title_ar,business_owner,status)
  VALUES('QA-PREAPPROVED-'||current_setting('qa.dg_nonce'),'data_quality','Synthetic QA request','QA office','approved');
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Office can create a request already approved'; END IF;
 denied := false;
 BEGIN
  INSERT INTO public.data_governance_requests(request_code,request_type,title_ar,business_owner,status,last_action_by,last_action_at,review_comment)
  VALUES('QA-FORGED-REVIEW-'||current_setting('qa.dg_nonce'),'data_quality','Synthetic QA request','QA office','submitted',current_setting('qa.dg_reviewer')::uuid,now(),'Forged review');
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Office can forge review attribution during creation'; END IF;
 INSERT INTO public.data_governance_requests(request_code,request_type,title_ar,business_owner,status)
 VALUES('QA-TRANSITION-'||current_setting('qa.dg_nonce'),'data_quality','Synthetic QA request','QA office','submitted') RETURNING id INTO req;
 PERFORM set_config('qa.dg_request',req::text,true);
 INSERT INTO public.data_governance_requests(request_code,request_type,title_ar,business_owner)
 VALUES('QA-DRAFT-'||current_setting('qa.dg_nonce'),'data_quality','Synthetic QA draft','QA office');
END $$;
RESET ROLE;
UPDATE public.profiles SET is_active=false WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$
DECLARE denied boolean := false;
BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Disabled profile bypassed Data Office authorization'; END IF;
END $$;
-- A missing profile must be denied before touching/looking up the request.
SELECT set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
DO $$
DECLARE denied boolean := false;
BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Missing profile did not fail closed'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='cybersecurity_team',is_active=true WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-office role cybersecurity_team transitioned a request'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='control_owner',is_active=true WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-office role control_owner transitioned a request'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='nca_external_auditor',is_active=true WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-office role nca_external_auditor transitioned a request'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='nudee_owner',is_active=true WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
 EXCEPTION WHEN insufficient_privilege THEN denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-office role nudee_owner transitioned a request'; END IF;
END $$;

RESET ROLE;
UPDATE public.profiles SET role='data_governance_team',is_active=true WHERE user_id=current_setting('qa.dg_reviewer')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 IF (SELECT status FROM public.data_governance_requests WHERE id=current_setting('qa.dg_request')::bigint)<>'submitted'
 THEN RAISE EXCEPTION 'Denied operations modified request status'; END IF;
 IF (SELECT count(*) FROM public.data_governance_request_events WHERE request_id=current_setting('qa.dg_request')::bigint)<>1
 THEN RAISE EXCEPTION 'Denied operations wrote audit events'; END IF;
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,NULL,NULL);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'حالة الاعتماد غير صالحة' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'NULL transition was accepted'; END IF;
END $$;
SELECT public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'steward_review',NULL);
SELECT public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'governance_review',NULL);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_maker'),true);
DO $$ DECLARE denied boolean := false; BEGIN
 BEGIN
  PERFORM public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'approved',NULL);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'لا يمكن لمنشئ الطلب اعتماده أو رفضه؛ يلزم مراجع مستقل' THEN RAISE; END IF;
  denied := true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Maker approved own request'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.dg_reviewer'),true);
SELECT public.transition_data_governance_request(current_setting('qa.dg_request')::bigint,'approved','Synthetic independent review');
DO $$ BEGIN
 IF (SELECT status FROM public.data_governance_requests WHERE id=current_setting('qa.dg_request')::bigint)<>'approved'
    OR (SELECT count(*) FROM public.data_governance_request_events WHERE request_id=current_setting('qa.dg_request')::bigint)<>4
 THEN RAISE EXCEPTION 'Authorized independent reviewer/audit flow failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: disabled/missing/non-office roles denied; initial-state/attribution bypass blocked; draft and independent reviewed approval preserved; rollback' AS qa_transition_authorization_result;

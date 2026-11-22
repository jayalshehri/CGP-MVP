-- READ-ONLY release check: QA baseline and production AFTER controlled import.
-- Expected 18-column ordered fingerprints from the original user-supplied
-- 364-row Nudee source, kept OUTSIDE the repository. Empty cells = SQL NULL.
-- Ordered by source_row, separated by ASCII U+001F, numeric progress normalized
-- via float8::text. MD5 is an equality fingerprint, not an authenticity proof.
-- Fails loudly on any mismatch. Do not import/overwrite data in this script.
DO $$
DECLARE
 v_expected jsonb := '{"source_row":"061b173955047d105b67778bd83cfc5c","domain_name":"dd6acec72e548f07a86fde488b099289","standard_code":"17f8ff27ac5f0019dee3cff6e73091ac","requirement_title":"f54c1e7e27746b63f46961f4c123afa1","maturity_level":"74a6f49a7bfdb8ff82a5e671bd8fd310","evidence_name":"83c0c2c1e568210967bf962836e8f607","evidence_description":"72bf5af81c27e570ce495f328decbf8f","responsible_department":"e3790a83c402be88e96d7b7af4d7828b","specification_code":"293da7b870c655ee376075e26d2f88b0","source_compliance":"690377182e84e048f3b85d05cc870943","source_notes":"1138423aa70a60aebe9b5c46fa31106d","review_phase":"81279b737ea9178b8e70f69e239db11c","planned_start":"62c274a69ffabd757b9d9c1fdba16ca6","planned_end":"24174cce58e76976ae5f80e71d9d1143","actual_end":"1138423aa70a60aebe9b5c46fa31106d","source_review_status":"d054908a023bce08c3af60e50f079a37","source_progress":"ea5baac8562cfe4c3a79f09ae5f1a5dd","schedule_indicator":"311152ae893455e0d1b917f14c367b99"}'::jsonb;
 v_actual jsonb;
 v_field text;
 v_digest text;
 v_n bigint;
 v_sources bigint;
 v_domains bigint;
 v_codes bigint;
 v_evidence bigint;
 v_min integer;
 v_max integer;
BEGIN
 SELECT count(*),count(distinct source_row),count(distinct domain_name),
 count(distinct standard_code),count(distinct evidence_name),min(source_row),max(source_row),
 jsonb_build_object(
   'source_row', md5(string_agg(coalesce("source_row"::text,''),chr(31) order by source_row)),
  'domain_name', md5(string_agg(coalesce("domain_name"::text,''),chr(31) order by source_row)),
  'standard_code', md5(string_agg(coalesce("standard_code"::text,''),chr(31) order by source_row)),
  'requirement_title', md5(string_agg(coalesce("requirement_title"::text,''),chr(31) order by source_row)),
  'maturity_level', md5(string_agg(coalesce("maturity_level"::text,''),chr(31) order by source_row)),
  'evidence_name', md5(string_agg(coalesce("evidence_name"::text,''),chr(31) order by source_row)),
  'evidence_description', md5(string_agg(coalesce("evidence_description"::text,''),chr(31) order by source_row)),
  'responsible_department', md5(string_agg(coalesce("responsible_department"::text,''),chr(31) order by source_row)),
  'specification_code', md5(string_agg(coalesce("specification_code"::text,''),chr(31) order by source_row)),
  'source_compliance', md5(string_agg(coalesce("source_compliance"::text,''),chr(31) order by source_row)),
  'source_notes', md5(string_agg(coalesce("source_notes"::text,''),chr(31) order by source_row)),
  'review_phase', md5(string_agg(coalesce("review_phase"::text,''),chr(31) order by source_row)),
  'planned_start', md5(string_agg(coalesce("planned_start"::text,''),chr(31) order by source_row)),
  'planned_end', md5(string_agg(coalesce("planned_end"::text,''),chr(31) order by source_row)),
  'actual_end', md5(string_agg(coalesce("actual_end"::text,''),chr(31) order by source_row)),
  'source_review_status', md5(string_agg(coalesce("source_review_status"::text,''),chr(31) order by source_row)),
  'source_progress', md5(string_agg(coalesce(source_progress::float8::text,''),chr(31) order by source_row)),
  'schedule_indicator', md5(string_agg(coalesce("schedule_indicator"::text,''),chr(31) order by source_row))
 ) INTO v_n,v_sources,v_domains,v_codes,v_evidence,v_min,v_max,v_actual
 FROM public.nudee_requirements;
 IF v_n<>364 OR v_sources<>364 OR v_domains<>14 OR v_codes<>42
    OR v_evidence<>364 OR v_min<>2 OR v_max<>365
 THEN RAISE EXCEPTION 'Nudee source shape mismatch: %,%,%,%,%,%,%',
 v_n,v_sources,v_domains,v_codes,v_evidence,v_min,v_max;
 END IF;
 FOR v_field,v_digest IN SELECT key,value FROM jsonb_each_text(v_expected) LOOP
   IF (v_actual->>v_field) IS DISTINCT FROM v_digest THEN
     RAISE EXCEPTION 'Nudee import fingerprint mismatch at field %', v_field;
   END IF;
 END LOOP;
END $$;
SELECT 'PASS: 364 source rows, 14 domains, 42 standard codes, 364 evidence names, 18/18 hashes' AS nudee_import_verification;

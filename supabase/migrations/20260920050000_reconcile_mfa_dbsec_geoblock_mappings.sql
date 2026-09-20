-- QA-ONLY data-mapping correction from the Phase 2 reconciliation pass.
--
-- Source-by-source reconciliation against the real CSCC-2-2-1-* sub-item text
-- (identical content already present in Production's controls catalog) showed
-- that the coarse fallback mapping to CSCC 2-2-1 / 2-2-2 (the domain-2-2 umbrella
-- and its periodic-review control) for REQ-MFA, REQ-DB-SECURITY and
-- REQ-GEO-BLOCKING was imprecise: none of the three requirements are actually
-- about identity/access-management review in general. The real catalog contains
-- exact, unambiguous sub-items for each:
--   CSCC 2-2-1-3 / 2-2-1-4 -- literal MFA controls (all users / privileged users)
--   CSCC 2-2-1-8           -- literal database direct-access restriction control
--   CSCC 2-2-1-1 / 2-2-1-2 -- literal geo-blocking / in-Kingdom remote-access controls
--
-- This migration (1) adds those 5 real sub-item controls to QA's CSCC catalog
-- (copied read-only from Production, same as every other control in this
-- matrix) and (2) replaces the imprecise links with the precise ones for
-- exactly these 3 requirements. No other requirement/control link is touched.
-- No RLS, no Evidence, no Assessments, no compliance state.

insert into public.controls (framework_id, control_code, title_ar, description_ar, domain_ar, implementation_status, evidence_status, verification_status, audit_frequency)
select f.id, v.control_code, v.title_ar, v.description_ar, v.domain_ar, 'not_started', 'not_uploaded', 'not_verified', 'annual'
from public.frameworks f
cross join (values
  ('2-2-1-1', 'إدارة هويات الدخول والصلاحيات - 2-2-1-1', 'منع الدخول عن بعد من خارج المملكة.', 'تعزيز الأمن السيبراني'),
  ('2-2-1-2', 'إدارة هويات الدخول والصلاحيات - 2-2-1-2', 'تقييد الدخول عن بعد من داخل المملكة؛ على أن يتم التأكد عن طريق مركز العمليات الأمنية الخاص بالجهة، عند كل عملية دخول؛ ومراقبة الأنشطة المتعلقة بالدخول عن بعد باستمرار.', 'تعزيز الأمن السيبراني'),
  ('2-2-1-3', 'إدارة هويات الدخول والصلاحيات - 2-2-1-3', 'التحقق من الهوية متعدد العناصر (Multi-Factor Authentication "MFA") لجميع المستفيدين.', 'تعزيز الأمن السيبراني'),
  ('2-2-1-4', 'إدارة هويات الدخول والصلاحيات - 2-2-1-4', 'التحقق من الهوية متعدد العناصر (Multi-Factor Authentication "MFA") للمستخدمين ذوي الصلاحيات الهامة، والحساسة؛ وعلى الأنظمة المستخدمة لإدارة الأنظمة الحساسة المذكورة في الضابط ٢-٣-١-٤ ومتابعتها.', 'تعزيز الأمن السيبراني'),
  ('2-2-1-8', 'إدارة هويات الدخول والصلاحيات - 2-2-1-8', 'فيما عدا مشرفي قواعد البيانات (Database Administrators)، يمنع الوصول أو التعامل المباشر لأي مستخدم مع قواعد البيانات؛ ويتم ذلك من خلال التطبيقات فقط، وبناءً على الصلاحيات المخوّل بها؛ مع مراعاة تطبيق حلول أمنية تحد، أو تمنع من اطلاع مشرفي قواعد البيانات على البيانات المصنفة (Classified Data).', 'تعزيز الأمن السيبراني')
) as v(control_code, title_ar, description_ar, domain_ar)
where f.code = 'CSCC'
  and not exists (select 1 from public.controls c where c.framework_id = f.id and c.control_code = v.control_code);

-- REQ-MFA: remove imprecise fallback, add the two exact MFA sub-items
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-MFA' and f.code = 'CSCC' and c.control_code in ('2-2-1','2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-MFA' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code in ('2-2-1-3','2-2-1-4')
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

-- REQ-DB-SECURITY: remove imprecise fallback, add the exact database-access-control sub-item
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-DB-SECURITY' and f.code = 'CSCC' and c.control_code in ('2-2-1','2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-DB-SECURITY' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code = '2-2-1-8'
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

-- REQ-GEO-BLOCKING: remove imprecise fallback, add the two exact geo/location access-control sub-items
delete from public.cybersecurity_requirement_controls rc
using public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and r.requirement_code = 'REQ-GEO-BLOCKING' and f.code = 'CSCC' and c.control_code in ('2-2-1','2-2-2');

insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, c.id, 'full'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where r.requirement_code = 'REQ-GEO-BLOCKING' and f.code = 'CSCC' and c.framework_id = f.id and c.control_code in ('2-2-1-1','2-2-1-2')
  and not exists (select 1 from public.cybersecurity_requirement_controls e where e.requirement_id = r.id and e.control_id = c.id);

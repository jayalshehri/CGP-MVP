-- QA-ONLY reference catalog subset. Mirrors a small slice of data that
-- already exists in Production (ECC framework metadata + the 12 ECC controls
-- needed for the MDR/SOC, Vulnerability Management, and PAM pilot review) —
-- not novel content, nothing invented. Reference metadata only: no evidence,
-- no evidence_requests, no control_review_cycles, no control_assessments, no
-- assessment_findings, no users/profiles, no grc_audit_events rows are
-- inserted here (the controls INSERT below will naturally produce its own
-- fresh grc_audit_events rows via the existing trigger, same as any other
-- control creation — that is expected, not copied history).
--
-- IDs are assigned fresh by QA's own identity sequences (frameworks.id,
-- controls.id) — Production's numeric IDs are not referenced or assumed.
-- Every statement is idempotent (WHERE NOT EXISTS guards) so this file is
-- safe to re-run.
--
-- This migration is QA-only by intent. It is deliberately NOT reviewed for
-- Production application in this pass (no unique constraint exists on
-- controls.control_code, so re-running it against Production — which
-- already has this exact data — would create duplicates). Do not apply to
-- Production without a separate explicit review.

insert into public.frameworks (code, name_ar, name_en, version, description_ar, is_active)
select 'ECC',
       'الضوابط الأساسية للأمن السيبراني',
       'Essential Cybersecurity Controls',
       '2-2024',
       'الضوابط الأساسية للأمن السيبراني الصادرة عن الهيئة الوطنية للأمن السيبراني',
       true
where not exists (select 1 from public.frameworks where code = 'ECC');

insert into public.controls (framework_id, control_code, title_ar, description_ar, domain_ar, implementation_status, evidence_status, verification_status, audit_frequency)
select f.id, v.control_code, v.title_ar, v.description_ar, 'تعزيز الأمن السيبراني', 'not_started', 'not_uploaded', 'not_verified', 'annual'
from public.frameworks f
cross join (values
  ('2-2-1', 'إدارة هويات الدخول والصلاحيات - 2-2-1', 'يجب تحديد وتوثيق واعتماد متطلبات الأمن السيبراني لإدارة هويات الدخول والصلاحيات في الجهة.'),
  ('2-2-2', 'إدارة هويات الدخول والصلاحيات - 2-2-2', 'يجب تطبيق متطلبات الأمن السيبراني لإدارة هويات الدخول والصلاحيات في الجهة.'),
  ('2-2-3', 'إدارة هويات الدخول والصلاحيات - 2-2-3', 'يجب أن تغطي متطلبات الأمن السيبراني المتعلقة بإدارة هويات الدخول والصلاحيات في الجهة بحد أدنى ما يلي: ٢-٢-٣-١ التحقق من الهوية أحادي العنصر (Single-factor authentication) بناءً على إدارة تسجيل المستخدم، وإدارة كلمة المرور. ٢-٢-٣-٢ التحقق من الهوية متعدد العناصر (Multi-Factor Authentication) وتحديد عناصر التحقق المناسبة وعددها وكذلك تقنيات التحقق المناسبة بناء على نتائج تقييم الأثر المحتمل لفشل عملية التحقق وتخطيها، وذلك لعمليات الدخول عن بعد والحسابات ذات الصلاحيات الهامة والحساسة. ٢-٢-٣-٣ إدارة تصاريح وصلاحيات المستخدمين (Authorization) بناءً على مبادئ التحكم بالدخول والصلاحيات (مبدأ الحاجة إلى المعرفة والاستخدام "Need-to-know and Need-to-use"، ومبدأ الحد الأدنى من الصلاحيات والامتيازات "Least Privilege"، ومبدأ فصل المهام "Segregation of Duties"). ٢-٢-٣-٤ إدارة الصلاحيات الهامة والحساسة (Privileged Access Management). ٢-٢-٣-٥ المراجعة الدورية لهويات الدخول والصلاحيات.'),
  ('2-2-4', 'إدارة هويات الدخول والصلاحيات - 2-2-4', 'يجب مراجعة تطبيق متطلبات الأمن السيبراني لإدارة هويات الدخول والصلاحيات في الجهة دورياً.'),
  ('2-10-1', 'إدارة الثغرات - 2-10-1', 'يجب تحديد وتوثيق واعتماد متطلبات الأمن السيبراني لإدارة الثغرات التقنية للجهة.'),
  ('2-10-2', 'إدارة الثغرات - 2-10-2', 'يجب تطبيق متطلبات الأمن السيبراني لإدارة الثغرات التقنية للجهة.'),
  ('2-10-3', 'إدارة الثغرات - 2-10-3', 'يجب أن تغطي متطلبات الأمن السيبراني لإدارة الثغرات بحد أدنى ما يلي: ٢-١٠-٣-١ فحص واكتشاف الثغرات دورياً. ٢-١٠-٣-٢ تصنيف الثغرات حسب خطورتها. ٢-١٠-٣-٣ معالجة الثغرات بناءً على تصنيفها والمخاطر السيبرانية المترتبة عليها. ٢-١٠-٣-٤ إدارة حزم التحديثات والإصلاحات الأمنية لمعالجة الثغرات، على أن يتم التحقق من سلامة وفعالية تلك التحديثات والإصلاحات الأمنية على بيئة غير بيئة الإنتاج قبل تطبيقها. ٢-١٠-٣-٥ التواصل والاشتراك مع مصادر موثوقة فيما يتعلق بالتنبيهات المتعلقة بالثغرات الجديدة والمحدثة.'),
  ('2-10-4', 'إدارة الثغرات - 2-10-4', 'يجب مراجعة تطبيق متطلبات الأمن السيبراني لإدارة الثغرات التقنية للجهة دورياً.'),
  ('2-12-1', 'إدارة سجلات الأحداث والمراقبة للأمن السيبراني - 2-12-1', 'يجب تحديد وتوثيق واعتماد متطلبات إدارة سجلات الأحداث ومراقبة الأمن السيبراني للجهة.'),
  ('2-12-2', 'إدارة سجلات الأحداث والمراقبة للأمن السيبراني - 2-12-2', 'يجب تطبيق متطلبات إدارة سجلات الأحداث ومراقبة الأمن السيبراني للجهة.'),
  ('2-12-3', 'إدارة سجلات الأحداث والمراقبة للأمن السيبراني - 2-12-3', 'يجب أن تغطي متطلبات إدارة سجلات الأحداث ومراقبة الأمن السيبراني بحد أدنى ما يلي: ٢-١٢-٣-١ تفعيل سجلات الأحداث (Event logs) الخاصة بالأمن السيبراني على الأصول المعلوماتية الحساسة لدى الجهة. ٢-١٢-٣-٢ تفعيل سجلات الأحداث الخاصة بالحسابات ذات الصلاحيات الهامة والحساسة على الأصول المعلوماتية وأحداث عمليات الدخول عن بعد لدى الجهة. ٢-١٢-٣-٣ تحديد التقنيات اللازمة (SIEM) لجمع سجلات الأحداث الخاصة بالأمن السيبراني. ٢-١٢-٣-٤ المراقبة المستمرة لسجلات الأحداث الخاصة بالأمن السيبراني. ٢-١٢-٣-٥ مدة الاحتفاظ بسجلات الأحداث الخاصة بالأمن السيبراني (على ألا تقل عن ١٢ شهر).'),
  ('2-12-4', 'إدارة سجلات الأحداث والمراقبة للأمن السيبراني - 2-12-4', 'يجب مراجعة تطبيق متطلبات إدارة سجلات الأحداث ومراقبة الأمن السيبراني في الجهة دورياً.')
) as v(control_code, title_ar, description_ar)
where f.code = 'ECC'
  and not exists (
    select 1 from public.controls c where c.framework_id = f.id and c.control_code = v.control_code
  );

-- QA-ONLY Full Seed for the Phase 2 Requirements & Projects Matrix.
-- Builds on the Phase 1 pilot (MDR-01/VM-01/PAM-01 + their 3 requirements + 8
-- requirement<->control links) WITHOUT modifying it. Adds the remaining 27
-- projects, 55 requirements, 55 project<->requirement links, and remaining
-- requirement<->control links from the approved Requirements & Projects Matrix.
-- No evidence, no assessments, no review cycles, no compliance state written.
-- All control lookups resolve by (framework_code, control_code) on CGP-QA itself.
-- Idempotent via WHERE NOT EXISTS guards.

-- 1) Projects (new, non-pilot)
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'PT-01', 'Penetration Testing & Red Teaming', 2027, 'Q2', 'planned', 'medium', 'continuous_activity'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'PT-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'IAM-01', 'Identity & Access Management (IAM)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'IAM-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'ENC-01', 'Enterprise Encryption & Key Management', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'ENC-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'ATP-01', 'Advanced Threat Protection (APT/Sandbox)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'ATP-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'BCDR-01', 'Backup & Disaster Recovery (BCDR)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'BCDR-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'NPS-01', 'Network Perimeter & Segmentation', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'NPS-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'NTV-01', 'Network Traffic Visibility & Control', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'NTV-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'MDM-01', 'Mobile Device & Endpoint Management (MDM/UEM)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'MDM-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'PATCH-01', 'Patch Management', 2027, 'Q2', 'planned', 'medium', 'continuous_activity'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'PATCH-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'DPS-01', 'Data Protection Suite (DLP / Masking / DRM)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'DPS-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'DGC-01', 'Data Governance & Classification', 2027, 'Q2', 'planned', 'medium', 'internal_program'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'DGC-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'HARD-01', 'Endpoint & System Hardening Baseline', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'HARD-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'DCTRL-01', 'Removable Media & Device Control', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'DCTRL-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'CMDB-01', 'Asset Management (CMDB)', 2027, 'Q2', 'planned', 'medium', 'internal_program'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'CMDB-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'DBSEC-01', 'Database Security Hardening', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'DBSEC-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'XDR-01', 'Extended Detection & Response (XDR)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'XDR-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'EMAIL-01', 'Email Security Gateway', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'EMAIL-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'APPSEC-01', 'Secure Application Development & Web Protection (AppSec)', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'APPSEC-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'IRTI-01', 'Incident Response & Threat Intelligence', 2027, 'Q2', 'planned', 'medium', 'continuous_activity'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'IRTI-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'PHYS-01', 'Physical & Facility Security', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'PHYS-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'TPRM-01', 'Third-Party & Cloud Risk Governance', 2027, 'Q2', 'planned', 'medium', 'policy_governance'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'TPRM-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'REMOTE-01', 'Remote Work & Secure Remote Access Program', 2027, 'Q2', 'planned', 'medium', 'technology_project'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'REMOTE-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'GOV-01', 'Cybersecurity Governance Framework', 2027, 'Q2', 'planned', 'medium', 'policy_governance'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'GOV-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'RISK-01', 'Cybersecurity Risk Management Program', 2027, 'Q2', 'planned', 'medium', 'policy_governance'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'RISK-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'COMP-01', 'Compliance & Internal Audit Program', 2027, 'Q2', 'planned', 'medium', 'assessment'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'COMP-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'HR-01', 'Cybersecurity HR Security Controls', 2027, 'Q2', 'planned', 'medium', 'policy_governance'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'HR-01');
insert into public.cybersecurity_projects (project_code, name_ar, planned_year, planned_quarter, status, priority, initiative_type)
select 'AWARE-01', 'Security Awareness & Training Program', 2027, 'Q2', 'planned', 'medium', 'continuous_activity'
where not exists (select 1 from public.cybersecurity_projects where project_code = 'AWARE-01');

-- 2) Requirements (new, non-pilot)
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-ENCRYPTION-TLS', 'التشفير وقنوات TLS — وفق NCS', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-ENCRYPTION-TLS');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-IAM', 'IAM — إدارة الهويات والوصول', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-IAM');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-APT-SANDBOX', 'APT/Sandbox — الحماية المتقدمة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-APT-SANDBOX');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-BACKUP', 'Backup — النسخ الاحتياطي', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-BACKUP');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-FIREWALL-SEG', 'Firewall/Segmentation — جدار الحماية والعزل', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-FIREWALL-SEG');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-MDM-UEM', 'MDM/UEM — إدارة الأجهزة المحمولة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-MDM-UEM');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DLP', 'DLP — منع تسرب البيانات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DLP');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DR-BCM', 'DR/BCM — التعافي والاستمرارية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DR-BCM');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-MFA', 'MFA — التحقق متعدد العناصر', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-MFA');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DATA-MASKING', 'Data Masking — تعتيم البيانات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DATA-MASKING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-KMS-HSM', 'KMS/HSM — إدارة مفاتيح التشفير', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-KMS-HSM');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-PATCH-MGMT', 'Patch Mgmt — إدارة التحديثات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-PATCH-MGMT');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-SECURE-WIPE', 'Secure Wipe/Export — المحو والتصدير الآمن', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-SECURE-WIPE');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DDOS', 'DDoS Protection — الحماية من الحجب', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DDOS');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-EMAIL-SEC', 'Email Security — حماية البريد', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-EMAIL-SEC');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-HARDENING', 'Hardening — التحصين', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-HARDENING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DRM-WATERMARK', 'DRM/Watermarking — حقوق ووسم الوثائق', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DRM-WATERMARK');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-NAC-WLAN', 'NAC/WLAN — التحكم بالوصول الشبكي', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-NAC-WLAN');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-PENTEST', 'PT — اختبار الاختراق', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-PENTEST');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-WAF', 'WAF — حماية تطبيقات الويب', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-WAF');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-MGMT-NET-ISOLATION', 'عزل شبكة الإدارة وسياسات الشبكة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-MGMT-NET-ISOLATION');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-APP-WHITELIST', 'Application Whitelisting — القائمة البيضاء', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-APP-WHITELIST');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-CMDB', 'CMDB — حصر الأصول', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-CMDB');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DNS-SEC', 'DNS Security — أمن النطاقات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DNS-SEC');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DATA-CLASSIFICATION', 'Data Classification — تصنيف البيانات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DATA-CLASSIFICATION');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DB-SECURITY', 'Database Security — أمن قواعد البيانات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DB-SECURITY');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DEVICE-CONTROL', 'Device Control — ضبط الوسائط الخارجية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DEVICE-CONTROL');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-XDR', 'XDR — حماية النقاط الطرفية والحماية من البرمجيات الضارة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-XDR');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-EXIT-STRATEGY', 'Exit Strategy — ضمانات الخروج التعاقدية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-EXIT-STRATEGY');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-FDE', 'FDE — تشفير القرص الكامل', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-FDE');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-GEO-BLOCKING', 'Geo-blocking — حظر الوصول الجغرافي', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-GEO-BLOCKING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-IPS-IDS', 'IPS/IDS — كشف ومنع الاختراقات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-IPS-IDS');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-IR-PLAN', 'IR Plan — خطة الاستجابة للحوادث', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-IR-PLAN');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-MULTITIER-ARCH', 'Multi-tier Architecture — معمارية متعددة الطبقات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-MULTITIER-ARCH');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-NTP', 'NTP — مزامنة التوقيت', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-NTP');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-SECURE-PRINTING', 'Secure Printing — أمن الطباعة', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-SECURE-PRINTING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-SESSION-MGMT', 'Session Management — إدارة الجلسات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-SESSION-MGMT');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-THREAT-INTEL', 'Threat Intelligence & Brand Protection — المعلومات الاستباقية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-THREAT-INTEL');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-THREAT-SHARING', 'Threat Sharing — مشاركة المؤشرات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-THREAT-SHARING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-WEB-PROXY', 'Web Proxy — تصفية الإنترنت', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-WEB-PROXY');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-STRATEGY-GOVERNANCE', 'استراتيجية وحوكمة الأمن السيبراني', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-STRATEGY-GOVERNANCE');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-POLICIES-PROCEDURES', 'سياسات وإجراءات الأمن السيبراني', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-POLICIES-PROCEDURES');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-ROLES-SOD', 'الأدوار والمسؤوليات وفصل المهام', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-ROLES-SOD');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-RISK-MGMT', 'إدارة مخاطر الأمن السيبراني', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-RISK-MGMT');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-PROJECT-CHANGE-SEC', 'الأمن السيبراني في المشاريع التقنية وإدارة التغيير', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-PROJECT-CHANGE-SEC');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-COMPLIANCE-AUDIT', 'الالتزام والمراجعة والتدقيق الدوري للأمن السيبراني', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-COMPLIANCE-AUDIT');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-HR-SECURITY', 'الأمن السيبراني للموارد البشرية ', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-HR-SECURITY');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-AWARENESS-TRAINING', 'التوعية والتدريب والاختبارات الاحتيالية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-AWARENESS-TRAINING');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-PHYSICAL-SECURITY', 'الأمن المادي لمرافق وأصول المعلومات', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-PHYSICAL-SECURITY');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-SECURE-SDLC', 'أمن تطوير التطبيقات ودورة التطوير الآمنة SDLC', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-SECURE-SDLC');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-THIRD-PARTY-RISK', 'إدارة مخاطر الأطراف الخارجية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-THIRD-PARTY-RISK');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-CLOUD-GOVERNANCE', 'حوكمة واختيار الخدمات السحابية  CST', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-CLOUD-GOVERNANCE');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-REMOTE-WORK', 'أمن العمل عن بعد والوصول البعيد', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-REMOTE-WORK');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-DATA-LIFECYCLE', 'إدارة دورة حياة البيانات وحصر البيانات ومواقعها', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-DATA-LIFECYCLE');
insert into public.cybersecurity_requirements (requirement_code, title_ar, status)
select 'REQ-IR-EXERCISES', 'اختبارات وتمارين الاستجابة للحوادث والأدلة الجنائية', 'active'
where not exists (select 1 from public.cybersecurity_requirements where requirement_code = 'REQ-IR-EXERCISES');

-- 3) Project <-> Requirement links (new, non-pilot) -- each requirement fully
--    owned by its one assigned project in this matrix
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'ENC-01' and r.requirement_code = 'REQ-ENCRYPTION-TLS'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IAM-01' and r.requirement_code = 'REQ-IAM'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'ATP-01' and r.requirement_code = 'REQ-APT-SANDBOX'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'BCDR-01' and r.requirement_code = 'REQ-BACKUP'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NPS-01' and r.requirement_code = 'REQ-FIREWALL-SEG'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'MDM-01' and r.requirement_code = 'REQ-MDM-UEM'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DPS-01' and r.requirement_code = 'REQ-DLP'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'BCDR-01' and r.requirement_code = 'REQ-DR-BCM'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IAM-01' and r.requirement_code = 'REQ-MFA'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DPS-01' and r.requirement_code = 'REQ-DATA-MASKING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'ENC-01' and r.requirement_code = 'REQ-KMS-HSM'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'PATCH-01' and r.requirement_code = 'REQ-PATCH-MGMT'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'MDM-01' and r.requirement_code = 'REQ-SECURE-WIPE'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NPS-01' and r.requirement_code = 'REQ-DDOS'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'EMAIL-01' and r.requirement_code = 'REQ-EMAIL-SEC'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'HARD-01' and r.requirement_code = 'REQ-HARDENING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DPS-01' and r.requirement_code = 'REQ-DRM-WATERMARK'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NPS-01' and r.requirement_code = 'REQ-NAC-WLAN'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'PT-01' and r.requirement_code = 'REQ-PENTEST'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'APPSEC-01' and r.requirement_code = 'REQ-WAF'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NPS-01' and r.requirement_code = 'REQ-MGMT-NET-ISOLATION'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'HARD-01' and r.requirement_code = 'REQ-APP-WHITELIST'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'CMDB-01' and r.requirement_code = 'REQ-CMDB'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NTV-01' and r.requirement_code = 'REQ-DNS-SEC'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DGC-01' and r.requirement_code = 'REQ-DATA-CLASSIFICATION'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DBSEC-01' and r.requirement_code = 'REQ-DB-SECURITY'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DCTRL-01' and r.requirement_code = 'REQ-DEVICE-CONTROL'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'XDR-01' and r.requirement_code = 'REQ-XDR'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'TPRM-01' and r.requirement_code = 'REQ-EXIT-STRATEGY'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'ENC-01' and r.requirement_code = 'REQ-FDE'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NPS-01' and r.requirement_code = 'REQ-GEO-BLOCKING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NTV-01' and r.requirement_code = 'REQ-IPS-IDS'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IRTI-01' and r.requirement_code = 'REQ-IR-PLAN'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'APPSEC-01' and r.requirement_code = 'REQ-MULTITIER-ARCH'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'HARD-01' and r.requirement_code = 'REQ-NTP'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'HARD-01' and r.requirement_code = 'REQ-SECURE-PRINTING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IAM-01' and r.requirement_code = 'REQ-SESSION-MGMT'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IRTI-01' and r.requirement_code = 'REQ-THREAT-INTEL'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IRTI-01' and r.requirement_code = 'REQ-THREAT-SHARING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'NTV-01' and r.requirement_code = 'REQ-WEB-PROXY'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'GOV-01' and r.requirement_code = 'REQ-STRATEGY-GOVERNANCE'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'GOV-01' and r.requirement_code = 'REQ-POLICIES-PROCEDURES'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'GOV-01' and r.requirement_code = 'REQ-ROLES-SOD'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'RISK-01' and r.requirement_code = 'REQ-RISK-MGMT'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'APPSEC-01' and r.requirement_code = 'REQ-PROJECT-CHANGE-SEC'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'COMP-01' and r.requirement_code = 'REQ-COMPLIANCE-AUDIT'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'HR-01' and r.requirement_code = 'REQ-HR-SECURITY'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'AWARE-01' and r.requirement_code = 'REQ-AWARENESS-TRAINING'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'PHYS-01' and r.requirement_code = 'REQ-PHYSICAL-SECURITY'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'APPSEC-01' and r.requirement_code = 'REQ-SECURE-SDLC'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'TPRM-01' and r.requirement_code = 'REQ-THIRD-PARTY-RISK'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'TPRM-01' and r.requirement_code = 'REQ-CLOUD-GOVERNANCE'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'REMOTE-01' and r.requirement_code = 'REQ-REMOTE-WORK'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'DGC-01' and r.requirement_code = 'REQ-DATA-LIFECYCLE'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);
insert into public.cybersecurity_project_requirements (project_id, requirement_id, coverage_type)
select p.id, r.id, 'full'
from public.cybersecurity_projects p, public.cybersecurity_requirements r
where p.project_code = 'IRTI-01' and r.requirement_code = 'REQ-IR-EXERCISES'
  and not exists (select 1 from public.cybersecurity_project_requirements where project_id = p.id and requirement_id = r.id);

-- 4) Requirement <-> Control links (new, non-pilot requirements only)
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-7-1', 'partial'),
  ('DCC', '2-5-1-1', 'full'),
  ('ECC', '2-15-3', 'full'),
  ('ECC', '2-8-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-ENCRYPTION-TLS'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-2-1', 'partial'),
  ('CSCC', '2-2-2', 'partial'),
  ('DCC', '2-1-1-1', 'full'),
  ('ECC', '2-2-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-IAM'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-10-1', 'partial'),
  ('CSCC', '2-10-2', 'partial'),
  ('CSCC', '2-4-1', 'partial'),
  ('ECC', '2-11-3', 'full'),
  ('ECC', '2-4-3', 'full'),
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-APT-SANDBOX'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-8-1', 'partial'),
  ('CSCC', '2-8-2', 'partial'),
  ('ECC', '2-9-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-BACKUP'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-4-1', 'partial'),
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-FIREWALL-SEG'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '2-2-1-3', 'full'),
  ('DCC', '2-3-1-1', 'full'),
  ('DCC', '2-3-1-2', 'full'),
  ('ECC', '2-6-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-MDM-UEM'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-6-1', 'partial'),
  ('DCC', '2-2-1-3', 'full'),
  ('DCC', '2-4-1-2', 'full'),
  ('ECC', '2-7-2', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DLP'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '3-1-1', 'partial'),
  ('ECC', '2-9-3', 'full'),
  ('ECC', '3-1-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DR-BCM'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-2-1', 'supporting'),
  ('CSCC', '2-2-2', 'supporting'),
  ('ECC', '2-2-3', 'full'),
  ('ECC', '2-4-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-MFA'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-6-1', 'partial'),
  ('DCC', '2-4-1-3', 'full'),
  ('DCC', '3-1-1-6', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DATA-MASKING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-8-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-KMS-HSM'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '2-2-1-1', 'full'),
  ('ECC', '2-10-3', 'full'),
  ('ECC', '2-3-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-PATCH-MGMT'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '2-6-1-1', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-SECURE-WIPE'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-4-1', 'partial'),
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DDOS'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-4-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-EMAIL-SEC'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-3-1', 'partial'),
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-HARDENING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '2-4-1-1', 'full'),
  ('DCC', '2-4-1-2', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DRM-WATERMARK'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-4-1', 'partial'),
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-NAC-WLAN'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-10-1', 'partial'),
  ('CSCC', '2-10-2', 'partial'),
  ('ECC', '2-11-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-PENTEST'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-12-1', 'partial'),
  ('CSCC', '2-12-2', 'partial'),
  ('ECC', '2-15-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-WAF'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-3-1', 'partial'),
  ('CSCC', '2-4-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-MGMT-NET-ISOLATION'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-3-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-APP-WHITELIST'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DNS-SEC'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-7-2', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DATA-CLASSIFICATION'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-2-1', 'supporting'),
  ('CSCC', '2-2-2', 'supporting')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DB-SECURITY'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-3-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DEVICE-CONTROL'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-3-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-XDR'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-5-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-FDE'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-2-1', 'supporting'),
  ('CSCC', '2-2-2', 'supporting')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-GEO-BLOCKING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-IPS-IDS'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-13-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-IR-PLAN'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-15-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-MULTITIER-ARCH'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-3-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-NTP'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '2-7-1', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-SECURE-PRINTING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-13-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-THREAT-INTEL'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-13-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-THREAT-SHARING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-5-3', 'full')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-WEB-PROXY'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '1-1-1', 'partial'),
  ('ECC', '1-1-1', 'partial'),
  ('ECC', '1-1-2', 'partial'),
  ('ECC', '1-1-3', 'partial'),
  ('ECC', '1-2-1', 'partial'),
  ('ECC', '1-2-2', 'partial'),
  ('ECC', '1-2-3', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-STRATEGY-GOVERNANCE'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '1-3-1', 'partial'),
  ('ECC', '1-3-2', 'partial'),
  ('ECC', '1-3-3', 'partial'),
  ('ECC', '1-3-4', 'partial'),
  ('TCC', '1-1-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-POLICIES-PROCEDURES'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CCC', '1-1-T-1-1', 'full'),
  ('ECC', '1-4-1', 'partial'),
  ('ECC', '1-4-2', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-ROLES-SOD'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CCC', '1-2-T-1', 'full'),
  ('CSCC', '1-2-1', 'partial'),
  ('ECC', '1-5-1', 'partial'),
  ('ECC', '1-5-2', 'partial'),
  ('ECC', '1-5-3', 'partial'),
  ('ECC', '1-5-4', 'partial'),
  ('TCC', '1-2-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-RISK-MGMT'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '1-3-1', 'partial'),
  ('CSCC', '1-3-2', 'partial'),
  ('ECC', '1-6-1', 'partial'),
  ('ECC', '1-6-2', 'partial'),
  ('ECC', '1-6-3', 'partial'),
  ('ECC', '1-6-4', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-PROJECT-CHANGE-SEC'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '1-7-1', 'partial'),
  ('ECC', '1-8-1', 'partial'),
  ('ECC', '1-8-2', 'partial'),
  ('ECC', '1-8-3', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-COMPLIANCE-AUDIT'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CCC', '1-4-T-1', 'full'),
  ('ECC', '1-9-1', 'partial'),
  ('ECC', '1-9-2', 'partial'),
  ('ECC', '1-9-3', 'partial'),
  ('ECC', '1-9-4', 'partial'),
  ('ECC', '1-9-5', 'partial'),
  ('ECC', '1-9-6', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-HR-SECURITY'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '1-10-1', 'partial'),
  ('ECC', '1-10-2', 'partial'),
  ('ECC', '1-10-3', 'partial'),
  ('ECC', '1-10-4', 'partial'),
  ('ECC', '1-10-5', 'partial'),
  ('TCC', '1-3-1', 'partial'),
  ('TCC', '1-3-2', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-AWARENESS-TRAINING'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-14-1', 'partial'),
  ('ECC', '2-14-2', 'partial'),
  ('ECC', '2-14-3', 'partial'),
  ('ECC', '2-14-4', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-PHYSICAL-SECURITY'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '2-13-1', 'partial'),
  ('CSCC', '2-13-2', 'partial'),
  ('CSCC', '2-13-3', 'partial'),
  ('CSCC', '2-13-4', 'partial'),
  ('ECC', '2-15-1', 'partial'),
  ('ECC', '2-15-2', 'partial'),
  ('ECC', '2-15-3', 'partial'),
  ('ECC', '2-15-4', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-SECURE-SDLC'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CSCC', '4-1-1', 'partial'),
  ('ECC', '4-1-1', 'partial'),
  ('ECC', '4-1-2', 'partial'),
  ('ECC', '4-1-3', 'partial'),
  ('ECC', '4-1-4', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-THIRD-PARTY-RISK'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('CCC', '1-1-T-1-1', 'full'),
  ('CCC', '1-2-T-1', 'full'),
  ('CCC', '1-3-T-1', 'full'),
  ('CCC', '2-1-T-1', 'full'),
  ('CCC', '3-1-T-1', 'full'),
  ('ECC', '4-2-1', 'partial'),
  ('ECC', '4-2-2', 'partial'),
  ('ECC', '4-2-3', 'partial'),
  ('ECC', '4-2-4', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-CLOUD-GOVERNANCE'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('TCC', '1-1-1', 'partial'),
  ('TCC', '1-2-1', 'partial'),
  ('TCC', '1-3-1', 'partial'),
  ('TCC', '1-3-2', 'partial'),
  ('TCC', '2-1-1', 'partial'),
  ('TCC', '2-11-1', 'partial'),
  ('TCC', '2-11-2', 'partial'),
  ('TCC', '2-12-1', 'partial'),
  ('TCC', '2-2-1', 'partial'),
  ('TCC', '2-2-2', 'partial'),
  ('TCC', '2-3-1', 'partial'),
  ('TCC', '2-4-1', 'partial'),
  ('TCC', '2-5-1', 'partial'),
  ('TCC', '2-6-1', 'partial'),
  ('TCC', '2-7-1', 'partial'),
  ('TCC', '3-1-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-REMOTE-WORK'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('DCC', '1-1-1', 'partial'),
  ('DCC', '1-1-2', 'partial'),
  ('DCC', '1-2-1', 'partial'),
  ('DCC', '1-3-1', 'partial'),
  ('DCC', '2-1-1', 'partial'),
  ('DCC', '2-1-2', 'partial'),
  ('DCC', '2-1-3', 'partial'),
  ('DCC', '2-2-1', 'partial'),
  ('DCC', '2-3-1', 'partial'),
  ('DCC', '2-4-1', 'partial'),
  ('DCC', '2-5-1', 'partial'),
  ('DCC', '2-6-1', 'partial'),
  ('DCC', '2-6-2', 'partial'),
  ('DCC', '2-7-1', 'partial'),
  ('DCC', '2-7-2', 'partial'),
  ('DCC', '2-7-3', 'partial'),
  ('DCC', '2-7-4', 'partial'),
  ('DCC', '3-1-1', 'partial'),
  ('DCC', '3-1-2', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-DATA-LIFECYCLE'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);
insert into public.cybersecurity_requirement_controls (requirement_id, control_id, coverage_type)
select r.id, ctl.id, v.coverage
from (values
  ('ECC', '2-13-1', 'partial'),
  ('ECC', '2-13-2', 'partial'),
  ('ECC', '2-13-3', 'partial'),
  ('ECC', '2-13-4', 'partial'),
  ('TCC', '2-12-1', 'partial')
) as v(framework_code, control_code, coverage)
join public.cybersecurity_requirements r on r.requirement_code = 'REQ-IR-EXERCISES'
join public.frameworks f on f.code = v.framework_code
join public.controls ctl on ctl.framework_id = f.id and ctl.control_code = v.control_code
where not exists (select 1 from public.cybersecurity_requirement_controls existing where existing.requirement_id = r.id and existing.control_id = ctl.id);

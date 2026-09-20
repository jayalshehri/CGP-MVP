-- QA-ONLY. Adds a minimal mapping_confidence column to persist the Phase 2
-- reconciliation result (Confirmed vs Probable) so Confirmed/Probable rollup
-- counts can be computed live instead of only living in a one-time report.
-- Default 'probable' (conservative: never silently upgrade a mapping to
-- Confirmed), then explicitly set 'confirmed' for exactly the links the
-- reconciliation verified against real official control text. No other
-- schema change; no new table; no RLS change (column inherits the existing
-- table's policies); no compliance state touched.

alter table public.cybersecurity_requirement_controls
  add column if not exists mapping_confidence text not null default 'probable'
  check (mapping_confidence in ('confirmed', 'probable'));

update public.cybersecurity_requirement_controls rc
set mapping_confidence = 'confirmed'
from public.cybersecurity_requirements r, public.frameworks f, public.controls c
where rc.requirement_id = r.id and rc.control_id = c.id and c.framework_id = f.id
  and (r.requirement_code, f.code, c.control_code) in (
  ('REQ-ENCRYPTION-TLS', 'DCC', '2-5-1-1'),
  ('REQ-ENCRYPTION-TLS', 'ECC', '2-15-3'),
  ('REQ-ENCRYPTION-TLS', 'ECC', '2-8-3'),
  ('REQ-IAM', 'DCC', '2-1-1-1'),
  ('REQ-IAM', 'ECC', '2-2-3'),
  ('REQ-APT-SANDBOX', 'ECC', '2-11-3'),
  ('REQ-APT-SANDBOX', 'ECC', '2-4-3'),
  ('REQ-APT-SANDBOX', 'ECC', '2-5-3'),
  ('REQ-BACKUP', 'ECC', '2-9-3'),
  ('REQ-FIREWALL-SEG', 'ECC', '2-5-3'),
  ('REQ-MDM-UEM', 'DCC', '2-2-1-3'),
  ('REQ-MDM-UEM', 'DCC', '2-3-1-1'),
  ('REQ-MDM-UEM', 'DCC', '2-3-1-2'),
  ('REQ-MDM-UEM', 'ECC', '2-6-3'),
  ('REQ-DLP', 'DCC', '2-2-1-3'),
  ('REQ-DLP', 'DCC', '2-4-1-2'),
  ('REQ-DLP', 'ECC', '2-7-2'),
  ('REQ-DR-BCM', 'ECC', '2-9-3'),
  ('REQ-DR-BCM', 'ECC', '3-1-3'),
  ('REQ-MFA', 'ECC', '2-2-3'),
  ('REQ-MFA', 'ECC', '2-4-3'),
  ('REQ-MFA', 'CSCC', '2-2-1-3'),
  ('REQ-MFA', 'CSCC', '2-2-1-4'),
  ('REQ-DATA-MASKING', 'DCC', '2-4-1-3'),
  ('REQ-DATA-MASKING', 'DCC', '3-1-1-6'),
  ('REQ-KMS-HSM', 'ECC', '2-8-3'),
  ('REQ-PATCH-MGMT', 'DCC', '2-2-1-1'),
  ('REQ-PATCH-MGMT', 'ECC', '2-10-3'),
  ('REQ-PATCH-MGMT', 'ECC', '2-3-3'),
  ('REQ-SECURE-WIPE', 'DCC', '2-6-1-1'),
  ('REQ-DDOS', 'ECC', '2-5-3'),
  ('REQ-EMAIL-SEC', 'ECC', '2-4-3'),
  ('REQ-HARDENING', 'ECC', '2-5-3'),
  ('REQ-DRM-WATERMARK', 'DCC', '2-4-1-1'),
  ('REQ-DRM-WATERMARK', 'DCC', '2-4-1-2'),
  ('REQ-NAC-WLAN', 'ECC', '2-5-3'),
  ('REQ-PENTEST', 'ECC', '2-11-3'),
  ('REQ-WAF', 'ECC', '2-15-3'),
  ('REQ-DNS-SEC', 'ECC', '2-5-3'),
  ('REQ-DATA-CLASSIFICATION', 'ECC', '2-7-2'),
  ('REQ-DB-SECURITY', 'CSCC', '2-2-1-8'),
  ('REQ-DEVICE-CONTROL', 'ECC', '2-3-3'),
  ('REQ-XDR', 'ECC', '2-3-3'),
  ('REQ-GEO-BLOCKING', 'CSCC', '2-2-1-1'),
  ('REQ-GEO-BLOCKING', 'CSCC', '2-2-1-2'),
  ('REQ-IPS-IDS', 'ECC', '2-5-3'),
  ('REQ-IR-PLAN', 'ECC', '2-13-3'),
  ('REQ-MULTITIER-ARCH', 'ECC', '2-15-3'),
  ('REQ-NTP', 'ECC', '2-3-3'),
  ('REQ-SECURE-PRINTING', 'DCC', '2-7-1'),
  ('REQ-THREAT-INTEL', 'ECC', '2-13-3'),
  ('REQ-THREAT-SHARING', 'ECC', '2-13-3'),
  ('REQ-WEB-PROXY', 'ECC', '2-5-3'),
  ('REQ-ROLES-SOD', 'CCC', '1-1-T-1-1'),
  ('REQ-RISK-MGMT', 'CCC', '1-2-T-1'),
  ('REQ-HR-SECURITY', 'CCC', '1-4-T-1'),
  ('REQ-CLOUD-GOVERNANCE', 'CCC', '1-1-T-1-1'),
  ('REQ-CLOUD-GOVERNANCE', 'CCC', '1-2-T-1'),
  ('REQ-CLOUD-GOVERNANCE', 'CCC', '1-3-T-1'),
  ('REQ-CLOUD-GOVERNANCE', 'CCC', '2-1-T-1'),
  ('REQ-CLOUD-GOVERNANCE', 'CCC', '3-1-T-1'),
  ('REQ-SIEM-SOC', 'ECC', '2-12-1'),
  ('REQ-SIEM-SOC', 'ECC', '2-12-2'),
  ('REQ-SIEM-SOC', 'ECC', '2-12-3'),
  ('REQ-SIEM-SOC', 'ECC', '2-12-4'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-1'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-2'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-3'),
  ('REQ-VULN-MGMT', 'ECC', '2-10-4'),
  ('REQ-PAM', 'ECC', '2-2-1'),
  ('REQ-PAM', 'ECC', '2-2-2'),
  ('REQ-PAM', 'ECC', '2-2-3'),
  ('REQ-PAM', 'ECC', '2-2-4')
);
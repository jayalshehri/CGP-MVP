-- NCA template stores the complete CVSS notation (for example: CVSS:3.0 10.0).
alter table public.vulnerabilities
  drop constraint if exists vulnerabilities_cvss_score_check;
alter table public.vulnerabilities
  alter column cvss_score type text using cvss_score::text;

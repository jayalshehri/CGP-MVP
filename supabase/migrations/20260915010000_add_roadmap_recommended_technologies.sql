alter table public.cybersecurity_projects
  add column if not exists recommended_technologies text;

update public.cybersecurity_projects
set recommended_technologies = case project_code
  when 'R-01' then 'منصة GRC، إدارة الأدلة، إدارة السياسات، إدارة مخاطر الطرف الثالث'
  when 'R-02' then 'IAM، MFA، PAM، RBAC، مراجعة الوصول الدورية'
  when 'R-03' then 'NGFW، التقسيم الشبكي، NAC، DNS Security، DDoS Protection'
  when 'R-04' then 'EDR/XDR، MDM/UEM، Device Control، Patch Management، Hardening'
  when 'R-05' then 'SIEM، SOC، SOAR، إدارة السجلات، Threat Intelligence'
  when 'R-06' then 'Vulnerability Management، Vulnerability Scanner، VAPT، Attack Surface Management'
  when 'R-07' then 'DLP، Data Masking، Encryption، KMS/HSM، Data Classification'
  when 'R-08' then 'CSPM، Cloud Logging، CASB، CMDB، Cloud Vulnerability Management'
  when 'R-09' then 'Backup، DR Orchestration، Immutable Backup، BCM، Recovery Testing'
  when 'R-10' then 'WAF، API Security، Email Security Gateway، SAST/DAST، Secrets Management'
  when 'R-11' then 'Continuous Control Monitoring، Compliance Automation، GRC Analytics، Audit Management'
end
where project_code in ('R-01','R-02','R-03','R-04','R-05','R-06','R-07','R-08','R-09','R-10','R-11')
  and recommended_technologies is null;

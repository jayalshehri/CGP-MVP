-- Test database only. Fixtures exercise import and two distinct CSCC systems.
insert into auth.users(id) values('30000000-0000-4000-8000-000000000001');
insert into profiles(user_id,display_name,role,is_active) values('30000000-0000-4000-8000-000000000001','Legacy assessor','cybersecurity_team',true);
insert into frameworks(code,name_ar,name_en,version) values('CSCC','CSCC','CSCC','1-2019'),('DCC','DCC','DCC','1-2022'),('TCC','TCC','TCC','1-2021'),('OSMACC','OSMACC','OSMACC','1-2021') on conflict(code) do nothing;
insert into controls(id,framework_id,control_code,title_ar,domain_ar) select -930001,id,'QA-1-1','Legacy CSCC','QA' from frameworks where code='CSCC';
insert into controls(id,framework_id,control_code,title_ar,domain_ar) select -930002,id,'QA-1-1','Legacy DCC','QA' from frameworks where code='DCC';
insert into cscc_systems(id,name,system_category,created_by) overriding system value values(-930001,'Legacy system A','Test','30000000-0000-4000-8000-000000000001'),(-930002,'Legacy system B','Test','30000000-0000-4000-8000-000000000001');
insert into cscc_assessment_results(system_id,control_id,compliance_status,notes,assessed_by,updated_at) values(-930001,-930001,'implemented','Original A','30000000-0000-4000-8000-000000000001','2026-08-01'),(-930002,-930001,'not_implemented','Original B','30000000-0000-4000-8000-000000000001','2026-08-02');
insert into dcc_assessment_results(control_id,compliance_status,notes,assessed_by) values(-930002,'not_applicable','Original DCC','30000000-0000-4000-8000-000000000001');

-- QA ONLY: lkozjnpfufdpzqtzdxhe. Test fixtures never commit.
begin;
set local statement_timeout = '60s';
create temporary table portfolio_test_results (test text primary key, passed boolean not null);
create function pg_temp.expect_failure(command text, expected_state text) returns void
language plpgsql as $$
declare actual_state text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state = expected_state then return; end if;
    raise exception 'Wrong failure state: expected %, got %: %',expected_state,actual_state,sqlerrm;
  end;
  raise exception 'Expected failure did not occur: %',command;
end;
$$;

do $$
declare admin_id uuid; team_id uuid; owner_id uuid; outsider_id uuid; actor uuid;
  batch uuid := gen_random_uuid(); staged uuid := gen_random_uuid(); review uuid := gen_random_uuid();
  ctrl bigint; framework text; code text; req bigint; req_code text; n integer; p record; k text;
begin
  if current_user <> 'postgres' or current_database() <> 'postgres' then raise exception 'Wrong execution identity'; end if;
  select user_id into admin_id from public.profiles where role='admin' and is_active order by user_id limit 1;
  select user_id into team_id from public.profiles where role='cybersecurity_team' and is_active order by user_id limit 1;
  select user_id into owner_id from public.profiles where role='control_owner' and is_active order by user_id limit 1;
  outsider_id := gen_random_uuid(); -- Authenticated identity without an active profile.
  if admin_id is null or team_id is null or owner_id is null or outsider_id is null then raise exception 'Required QA roles unavailable'; end if;
  select c.id,f.code,c.control_code into ctrl,framework,code from public.controls c join public.frameworks f on f.id=c.framework_id where f.is_active order by c.id limit 1;
  select id,requirement_code into req,req_code from public.cybersecurity_requirements order by id limit 1;
  if ctrl is null or req is null then raise exception 'QA catalog fixtures unavailable'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  insert into public.cybersecurity_projects(id,project_code,name_ar,portfolio_priority,duration_value,duration_unit)
    overriding system value values (-910061,'QA-PF-ROLLBACK-ONLY','  Exact — اسم  ','P1',6,'month');
  select * into p from public.cybersecurity_projects where id=-910061;
  if p.execution_year<>1 or p.status<>'planned' or p.name_ar<>'  Exact — اسم  ' or p.work_type is not null or p.executive_owner_code is not null then raise exception 'Project defaults or exact name failed'; end if;
  update public.cybersecurity_projects set portfolio_priority='P2',status='on_hold' where id=-910061;
  if not exists(select 1 from public.cybersecurity_projects where id=-910061 and execution_year=2 and status='on_hold') then raise exception 'P2 or independent status failed'; end if;
  update public.cybersecurity_projects set portfolio_priority='P3' where id=-910061;
  if not exists(select 1 from public.cybersecurity_projects where id=-910061 and execution_year=3 and status='on_hold') then raise exception 'P3 or independent status failed'; end if;
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set execution_year=1 where id=-910061$q$,'428C9');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set portfolio_priority='P4' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set work_type='guessed' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set executive_owner_code='invalid' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set executive_owner_code='other' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set executive_owner_other='wrong' where id=-910061$q$,'23514');
  foreach k in array array['0','-1','NaN','Infinity'] loop
    perform pg_temp.expect_failure(format('update public.cybersecurity_projects set duration_value=%L::numeric where id=-910061',k),'23514');
  end loop;
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set duration_unit=null where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set duration_unit='quarter' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set status='archived' where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$update public.cybersecurity_projects set archived_at=now() where id=-910061$q$,'23514');
  perform pg_temp.expect_failure($q$delete from public.cybersecurity_projects where id=-910061$q$,'23514');
  update public.cybersecurity_projects set executive_owner_code='other',executive_owner_other='Approved QA fixture',archived_at=now(),archived_by=admin_id,archive_reason='Transactional test' where id=-910061;
  if not exists(select 1 from public.cybersecurity_projects where id=-910061 and archived_at is not null and status='on_hold') then raise exception 'Archive changed status'; end if;

  insert into public.portfolio_import_batches(id,source_filename,source_sha256) values(batch,'QA disposable fixture',repeat('e',64));
  insert into public.portfolio_import_projects(id,batch_id,source_sheet,source_row,source_project_name,priority,duration_value,duration_unit)
    values(staged,batch,'QA',1,'  Exact source — اسم  ','P1',6,'month');
  if not exists(select 1 from public.portfolio_import_projects where id=staged and execution_year=1 and status='planned' and work_type is null and executive_owner_code is null) then raise exception 'Staging defaults failed'; end if;
  update public.portfolio_import_projects set work_type='assessment' where id=staged;
  perform pg_temp.expect_failure(format('update public.portfolio_import_projects set source_project_name=%L where id=%L','changed',staged),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_import_projects set duration_value=7 where id=%L',staged),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_import_batches set source_filename=%L where id=%L','changed',batch),'23514');
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set import_staging_id=%L where id=-910061',staged),'23514');
  insert into public.portfolio_mapping_reviews(id,staged_project_id,source_reference) values(review,staged,'unresolved source');
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set review_status=%L,decision_note=%L where id=%L','approved','must fail',review),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set match_status=%L,control_id=%s,source_framework=%L,source_control_code=%L where id=%L','exact_match',ctrl,framework,'not-identical',review),'23514');
  update public.portfolio_mapping_reviews set match_status='exact_match',control_id=ctrl,source_framework=framework,source_control_code=code,review_status='approved',decision_note='Exact QA catalog match' where id=review;
  if not exists(select 1 from public.portfolio_mapping_reviews where id=review and reviewed_by=admin_id and reviewed_at is not null) then raise exception 'Review attribution failed'; end if;
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set source_reference=%L where id=%L','changed',review),'23514');
  insert into public.portfolio_mapping_reviews(staged_project_id,source_reference,target_type,requirement_id,source_requirement_code,match_status,review_status,decision_note)
    values(staged,'QA requirement','requirement',req,req_code,'exact_match','approved','Exact requirement match');
  perform pg_temp.expect_failure(format('insert into public.portfolio_mapping_reviews(staged_project_id,source_reference,target_type,requirement_id,source_requirement_code,match_status) values(%L,%L,%L,%s,%L,%L)',staged,'bad requirement','requirement',req,'bad-code','exact_match'),'23514');
  insert into public.portfolio_mapping_reviews(staged_project_id,source_reference,control_id,source_framework,source_control_code,match_status,review_status,decision_note)
    values(staged,'legacy reference',ctrl,framework,'legacy-code','legacy_mapping','approved','Explicit QA legacy review');
  if exists(select 1 from public.cybersecurity_project_requirements where project_id=-910061) or exists(select 1 from public.cybersecurity_project_controls where project_id=-910061) then raise exception 'Staging activated a relationship'; end if;
  perform set_config('role','postgres',true);
  insert into portfolio_test_results values ('constraints, generated years, duration, Other, archive independent of status, exact names',true),('source immutability, exact/legacy/review guards, phase1 activation blocked',true);

  foreach actor in array array[team_id,owner_id,outsider_id] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('role','authenticated',true);
    select count(*) into n from public.portfolio_import_batches where id=batch;
    if actor=team_id then
      if n<>1 then raise exception 'Cybersecurity team cannot read staging'; end if;
      update public.portfolio_import_batches set status='validated' where id=batch;
    else
      if n<>0 then raise exception 'RLS exposed staging to unauthorized role'; end if;
      select count(*) into n from public.portfolio_import_projects where id=staged;
      if n<>0 then raise exception 'RLS exposed staged projects'; end if;
      select count(*) into n from public.portfolio_mapping_reviews where staged_project_id=staged;
      if n<>0 then raise exception 'RLS exposed review rows'; end if;
      perform pg_temp.expect_failure($q$insert into public.portfolio_import_batches(source_filename,source_sha256) values('denied',repeat('d',64))$q$,'42501');
      update public.portfolio_mapping_reviews set review_status='rejected',decision_note='denied' where id=review;
      get diagnostics n = row_count;
      if n<>0 then raise exception 'Unauthorized review write'; end if;
    end if;
    perform set_config('role','postgres',true);
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('role','anon',true);
  perform pg_temp.expect_failure('select * from public.portfolio_import_batches','42501');
  perform pg_temp.expect_failure('select * from public.portfolio_import_projects','42501');
  perform pg_temp.expect_failure('select * from public.portfolio_mapping_reviews','42501');
  perform set_config('role','postgres',true);
  insert into portfolio_test_results values ('RLS admin/team allowed, owner/unprofiled identity denied, anon denied',true);
end;
$$;
select jsonb_agg(to_jsonb(t) order by test) as evidence from portfolio_test_results t;
rollback;

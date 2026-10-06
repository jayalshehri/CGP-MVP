-- QA ONLY lkozjnpfufdpzqtzdxhe. All mutation probes and fixtures ROLLBACK.
begin;
set local statement_timeout='60s';
create temporary table results(test text,passed boolean) on commit drop;
create function pg_temp.expect_failure(command text,expected text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute command;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual=expected then return; end if;
    raise exception 'Expected %, got %: %',expected,actual,sqlerrm;
  end;
  raise exception 'Unexpected success: %',command;
end; $$;
do $$
declare admin_id uuid; team_id uuid; owner_id uuid; outsider uuid:=gen_random_uuid(); actor uuid;
  imported public.cybersecurity_projects; approved public.portfolio_mapping_reviews;
  pending public.portfolio_mapping_reviews; broken public.portfolio_mapping_reviews;
  n integer; control_other bigint; fixture bigint:=-910062; table_name text;
begin
  select user_id into strict admin_id from public.profiles where role='admin' and is_active limit 1;
  select user_id into strict team_id from public.profiles where role='cybersecurity_team' and is_active limit 1;
  select user_id into strict owner_id from public.profiles where role='control_owner' and is_active limit 1;
  select * into strict approved from public.portfolio_mapping_reviews where match_status='exact_match' and review_status='approved' limit 1;
  select * into strict imported from public.cybersecurity_projects where import_staging_id=approved.staged_project_id;
  select * into strict pending from public.portfolio_mapping_reviews where match_status='needs_review' and not source_error limit 1;
  select * into strict broken from public.portfolio_mapping_reviews where source_error;
  select c.id into strict control_other from public.controls c join public.frameworks f on f.id=c.framework_id
    where f.is_active and not exists(select 1 from public.cybersecurity_project_controls l where l.project_id=imported.id and l.control_id=c.id) limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);
  if (select count(*) from public.cybersecurity_projects where archived_at is null)<>43 or
     (select count(*) from public.cybersecurity_projects where archived_at is not null)<>32 then raise exception 'Archive visibility failed'; end if;
  if (select count(*) from public.cybersecurity_project_requirements)<>58 then raise exception 'Historic links hidden from manager'; end if;
  perform pg_temp.expect_failure(format('insert into public.cybersecurity_project_controls(project_id,control_id) values(%s,%s)',imported.id,control_other),'23514');
  perform pg_temp.expect_failure(format('insert into public.cybersecurity_project_controls(project_id,control_id,mapping_review_id) values(%s,%s,%L)',imported.id,control_other,pending.id),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set review_status=%L where id=%L','pending',approved.id),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set review_status=%L,decision_note=%L where id=%L','approved','invalid approval',broken.id),'23514');
  perform pg_temp.expect_failure(format('update public.portfolio_mapping_reviews set review_status=%L,decision_note=%L where id=%L','approved','invalid approval',pending.id),'23514');
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set import_staging_id=null where id=%s',imported.id),'23514');
  perform pg_temp.expect_failure(format('update public.cybersecurity_projects set mapping_completeness=%L where id=%s','verified',imported.id),'428C9');
  update public.cybersecurity_projects set mapping_reference_count=999,mapping_exact_count=999,mapping_source_error_count=0 where id=imported.id;
  if not exists(select 1 from public.cybersecurity_projects where id=imported.id and mapping_reference_count=imported.mapping_reference_count and mapping_exact_count=imported.mapping_exact_count) then raise exception 'Forged completeness accepted'; end if;
  perform pg_temp.expect_failure(format($q$insert into public.cybersecurity_projects(project_code,name_ar,portfolio_priority,duration_value,duration_unit,work_type,executive_owner_code,executive_owner_other,status,import_staging_id)
    select 'QA-IDEMPOTENCY-PROBE',source_project_name,priority,duration_value,duration_unit,work_type,executive_owner_code,executive_owner_other,status,id from public.portfolio_import_projects where id=%L$q$,imported.import_staging_id),'23505');
  delete from public.cybersecurity_project_controls where project_id=imported.id and mapping_review_id=approved.id;
  if not exists(select 1 from public.cybersecurity_projects where id=imported.id and mapping_exact_count=imported.mapping_exact_count-1 and mapping_completeness<>'verified') then raise exception 'Link removal left misleading completeness'; end if;
  insert into public.cybersecurity_project_controls(project_id,control_id,mapping_review_id) values(imported.id,approved.control_id,approved.id);
  if not exists(select 1 from public.cybersecurity_projects where id=imported.id and mapping_exact_count=imported.mapping_exact_count and mapping_completeness=imported.mapping_completeness) then raise exception 'Link restoration completeness failed'; end if;
  perform set_config('role','postgres',true);
  insert into results values('approved exact links only; needs_review/source_error inactive; provenance immutable',true),
    ('generated completeness resists spoofing and follows actual links',true),('duplicate import provenance rejected',true),('active 43 / archived 32 visibility and 58 historical links',true);

  foreach actor in array array[admin_id,team_id] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('role','authenticated',true);
    insert into public.cybersecurity_projects(id,project_code,name_ar,portfolio_priority,duration_value,duration_unit,work_type,executive_owner_code)
      overriding system value values(fixture,'QA-CREATE-EDIT-'||fixture,'  QA exact create/edit '||fixture||'  ','P1',6,'month','technical_project','it');
    if not exists(select 1 from public.cybersecurity_projects where id=fixture and status='planned' and execution_year=1 and mapping_completeness='mapping_pending') then raise exception 'Create failed'; end if;
    update public.cybersecurity_projects set portfolio_priority='P3',duration_value=8,executive_owner_code='other',executive_owner_other='Approved QA test',status='on_hold' where id=fixture;
    if not exists(select 1 from public.cybersecurity_projects where id=fixture and execution_year=3 and duration_value=8 and status='on_hold') then raise exception 'Edit failed'; end if;
    update public.cybersecurity_projects set name_ar='  QA edited name '||fixture||'  ' where id=fixture;
    perform pg_temp.expect_failure(format('delete from public.cybersecurity_projects where id=%s',fixture),'23514');
    perform set_config('role','postgres',true);
    fixture:=fixture-1;
  end loop;
  insert into results values('authenticated Admin and Team project create/edit succeeds; hard delete denied',true);
  foreach actor in array array[owner_id,outsider] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('role','authenticated',true);
    perform pg_temp.expect_failure($q$insert into public.cybersecurity_projects(project_code,name_ar) values('QA-DENIED','Denied')$q$,'42501');
    update public.cybersecurity_projects set status='completed' where id=imported.id;
    get diagnostics n=row_count;
    if n<>0 then raise exception 'Unauthorized project update'; end if;
    perform pg_temp.expect_failure(format('insert into public.cybersecurity_project_controls(project_id,control_id) values(%s,%s)',-910062,control_other),'42501');
    if exists(select 1 from public.portfolio_mapping_reviews) or exists(select 1 from public.portfolio_import_projects) or exists(select 1 from public.portfolio_import_batches) then raise exception 'Staging exposed'; end if;
    perform set_config('role','postgres',true);
  end loop;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('role','anon',true);
  foreach table_name in array array['cybersecurity_projects','cybersecurity_project_controls','cybersecurity_project_requirements','portfolio_import_batches','portfolio_import_projects','portfolio_mapping_reviews'] loop
    perform pg_temp.expect_failure(format('select * from public.%I',table_name),'42501');
  end loop;
  perform set_config('role','postgres',true);
  insert into results values('RLS denies Owner/unprofiled writes and staging reads; anon denied',true);
end; $$;
select jsonb_agg(to_jsonb(t) order by test) as evidence from results t;
rollback;

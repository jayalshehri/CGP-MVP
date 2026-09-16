-- Additive assessment engine. Legacy results are retained, imported without approval,
-- and become read-only. Framework assessment never overwrites a global control state.
create table public.assessment_cycles (
 id bigint generated always as identity primary key,
 framework_id bigint not null references public.frameworks(id),
 framework_version text not null,
 scope_name text not null check(length(btrim(scope_name))>0),
 system_id bigint references public.cscc_systems(id),
 previous_cycle_id bigint references public.assessment_cycles(id),
 status text not null default 'draft' check(status in ('draft','in_progress','evidence_collection','under_review','completed','approved','closed')),
 assessor_id uuid references public.profiles(user_id), reviewer_id uuid references public.profiles(user_id), approver_id uuid references public.profiles(user_id),
 due_date date, next_review_date date,
 scope_confirmed_at timestamptz, scope_reason text,
 revision integer not null default 1,
 imported boolean not null default false,
 created_by uuid references public.profiles(user_id), created_at timestamptz not null default now(),
 approved_by uuid references public.profiles(user_id), approved_at timestamptz, approved_snapshot jsonb,
 check(assessor_id is null or reviewer_id is null or assessor_id<>reviewer_id),
 check(assessor_id is null or approver_id is null or assessor_id<>approver_id)
);
create index assessment_cycles_framework on public.assessment_cycles(framework_id,id desc);
create index assessment_cycles_due on public.assessment_cycles(due_date) where status not in ('approved','closed');
create table public.assessment_items (
 id bigint generated always as identity primary key,
 cycle_id bigint not null references public.assessment_cycles(id), control_id bigint not null references public.controls(id),
 control_code text not null, title_ar text not null, description_ar text, domain_ar text not null, subdomain_code text not null,
 is_scoring boolean not null, owner_id uuid references public.profiles(user_id),
 compliance_status text check(compliance_status in ('implemented','partially_implemented','not_implemented','not_applicable')),
 notes text, corrective_action text, expected_compliance_date date,
 review_status text not null default 'pending' check(review_status in ('pending','accepted','changes_requested')),
 review_reason text, reviewed_by uuid references public.profiles(user_id), reviewed_at timestamptz,
 revision integer not null default 1, updated_by uuid references public.profiles(user_id), updated_at timestamptz not null default now(),
 legacy_source jsonb, unique(cycle_id,control_id)
);
create index assessment_items_control on public.assessment_items(control_id,cycle_id);
create index assessment_items_owner on public.assessment_items(owner_id);
create table public.assessment_item_evidence (
 id bigint generated always as identity primary key,
 item_id bigint not null references public.assessment_items(id), control_id bigint not null references public.controls(id),
 evidence_id bigint not null references public.evidence(id), linked_by uuid not null references public.profiles(user_id), linked_at timestamptz not null default now(),
 unique(item_id,evidence_id)
);
create table public.assessment_findings (
 id bigint generated always as identity primary key,
 item_id bigint not null unique references public.assessment_items(id), control_id bigint not null references public.controls(id),
 title text not null, severity text not null default 'unclassified' check(severity in ('unclassified','low','medium','high','critical')),
 owner_id uuid references public.profiles(user_id), due_date date, action_plan text,
 status text not null default 'open' check(status in ('open','in_progress','verification','closed')),
 project_id bigint references public.cybersecurity_projects(id),
 verification_evidence_id bigint references public.evidence(id), verification_reason text,
 verified_by uuid references public.profiles(user_id), verified_at timestamptz,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create index assessment_findings_due on public.assessment_findings(due_date) where status<>'closed';
create index assessment_findings_owner on public.assessment_findings(owner_id);
create index assessment_item_evidence_control on public.assessment_item_evidence(control_id);
create index assessment_cycles_previous on public.assessment_cycles(previous_cycle_id);
create index assessment_cycles_system on public.assessment_cycles(system_id);
create index assessment_findings_project on public.assessment_findings(project_id);
create index assessment_item_evidence_evidence on public.assessment_item_evidence(evidence_id);

create function private.assessment_can_read(p_cycle bigint) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.assessment_cycles a where a.id=p_cycle and (
 private.current_user_role() in ('admin','cybersecurity_team')
 or (private.current_user_role()='control_owner' and exists(select 1 from public.assessment_items i where i.cycle_id=a.id and (i.owner_id=auth.uid() or exists(select 1 from public.assessment_findings g where g.item_id=i.id and g.owner_id=auth.uid()))))
 or (private.current_user_role()='nca_external_auditor' and a.status in ('approved','closed') and exists(select 1 from public.assessment_items i where i.cycle_id=a.id) and not exists(select 1 from public.assessment_items i where i.cycle_id=a.id and not private.can_external_auditor_view_control(i.control_id)))
 ));
$$;
revoke all on function private.assessment_can_read(bigint) from public,anon;
grant execute on function private.assessment_can_read(bigint) to authenticated;
alter table public.assessment_cycles enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_item_evidence enable row level security;
alter table public.assessment_findings enable row level security;
revoke all on public.assessment_cycles,public.assessment_items,public.assessment_item_evidence,public.assessment_findings from public,anon,authenticated;
grant select on public.assessment_cycles,public.assessment_items,public.assessment_item_evidence,public.assessment_findings to authenticated;
create function private.assessment_item_can_read(p_item bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assessment_items i where i.id=p_item and private.assessment_can_read(i.cycle_id) and (private.current_user_role()<>'control_owner' or i.owner_id=auth.uid() or exists(select 1 from public.assessment_findings g where g.item_id=i.id and g.owner_id=auth.uid())));
$$;
revoke all on function private.assessment_item_can_read(bigint) from public,anon;
grant execute on function private.assessment_item_can_read(bigint) to authenticated;
-- Owners see their requirements, not the portfolio snapshot or assessment personnel.
create policy assessment_cycle_read on public.assessment_cycles for select to authenticated using(private.assessment_can_read(id) and private.current_user_role()<>'control_owner');
create policy assessment_item_read on public.assessment_items for select to authenticated using(private.assessment_item_can_read(id));
create policy assessment_evidence_read on public.assessment_item_evidence for select to authenticated using(exists(select 1 from public.assessment_items i where i.id=item_id));
create policy assessment_finding_read on public.assessment_findings for select to authenticated using(exists(select 1 from public.assessment_items i where i.id=item_id));

-- Keep the existing audit store. Item events carry the original control FK.
create trigger assessment_item_audit after insert or update or delete on public.assessment_items for each row execute function private.grc_audit();
create trigger assessment_evidence_audit after insert or update or delete on public.assessment_item_evidence for each row execute function private.grc_audit();
create trigger assessment_finding_audit after insert or update or delete on public.assessment_findings for each row execute function private.grc_audit();
create trigger assessment_cycle_audit after insert or update or delete on public.assessment_cycles for each row execute function private.grc_audit();
create policy grc_assessment_cycle_events on public.grc_audit_events for select to authenticated using(entity_type='assessment_cycles' and private.current_user_role() in ('admin','cybersecurity_team'));

create function private.assessment_snapshot_items(p_cycle bigint) returns void language sql set search_path='' as $$
 insert into public.assessment_items(cycle_id,control_id,control_code,title_ar,description_ar,domain_ar,subdomain_code,is_scoring,owner_id)
 select a.id,c.id,c.control_code,c.title_ar,c.description_ar,coalesce(c.domain_ar,'غير مصنف'),split_part(c.control_code,'-',1)||'-'||split_part(c.control_code,'-',2),
 not exists(select 1 from public.controls child where child.framework_id=c.framework_id and child.control_code like c.control_code||'-%'),c.control_owner_id
 from public.assessment_cycles a join public.controls c on c.framework_id=a.framework_id where a.id=p_cycle;
$$;
revoke all on function private.assessment_snapshot_items(bigint) from public,anon,authenticated;

-- Import exact originals including actor/time, never invent reviewer or approval.
do $$ declare fw record; s record; cid bigint; table_name text; has_results boolean; begin
 for fw in select * from public.frameworks where code in ('CSCC','DCC','TCC','OSMACC') loop
  table_name:=lower(fw.code)||'_assessment_results';
  if fw.code='CSCC' then
   for s in select * from public.cscc_systems where exists(select 1 from public.cscc_assessment_results r where r.system_id=cscc_systems.id) loop
    insert into public.assessment_cycles(framework_id,framework_version,scope_name,system_id,imported) values(fw.id,coalesce(fw.version,'unspecified'),s.name,s.id,true) returning id into cid;
    perform private.assessment_snapshot_items(cid);
    update public.assessment_items i set compliance_status=r.compliance_status,notes=r.notes,corrective_action=r.corrective_action,expected_compliance_date=r.expected_compliance_date,legacy_source=jsonb_build_object('table','cscc_assessment_results','record',to_jsonb(r)) from public.cscc_assessment_results r where i.cycle_id=cid and i.control_id=r.control_id and r.system_id=s.id;
   end loop;
  else
   execute format('select exists(select 1 from public.%I)',table_name) into has_results;
   if not has_results then continue; end if;
   insert into public.assessment_cycles(framework_id,framework_version,scope_name,imported) values(fw.id,coalesce(fw.version,'unspecified'),'نطاق الجهة — تقييم موروث',true) returning id into cid;
   perform private.assessment_snapshot_items(cid);
   execute format('update public.assessment_items i set compliance_status=r.compliance_status,notes=r.notes,corrective_action=r.corrective_action,expected_compliance_date=r.expected_compliance_date,legacy_source=jsonb_build_object(''table'',%L,''record'',to_jsonb(r)) from public.%I r where i.cycle_id=$1 and i.control_id=r.control_id',table_name,table_name) using cid;
  end if;
 end loop;
end $$;
insert into public.assessment_findings(item_id,control_id,title,owner_id,due_date,action_plan)
 select id,control_id,title_ar,owner_id,expected_compliance_date,corrective_action from public.assessment_items where compliance_status in ('not_implemented','partially_implemented');
revoke insert,update,delete on public.cscc_assessment_results,public.dcc_assessment_results,public.tcc_assessment_results,public.osmacc_assessment_results from authenticated;
create index if not exists control_framework_links_target_idx on public.control_framework_links(target_control_id);
create index if not exists cscc_results_control_idx on public.cscc_assessment_results(control_id);

-- Crosswalks retain original imported claims but require human validation.
alter table public.control_framework_links add column validation_status text not null default 'pending' check(validation_status in ('pending','approved','rejected')),
 add column coverage_type text not null default 'reference' check(coverage_type in ('reference','supports','partial','equivalent')),
 add column source_reference text, add column coverage_notes text,
 add column source_version text,add column target_version text,
 add column reviewed_by uuid references public.profiles(user_id),add column reviewed_at timestamptz,
 add column approved_by uuid references public.profiles(user_id),add column approved_at timestamptz,
 add column revision integer not null default 1;
update public.control_framework_links l set source_version=sf.version,target_version=tf.version from public.controls s,public.controls t,public.frameworks sf,public.frameworks tf where s.id=l.source_control_id and t.id=l.target_control_id and sf.id=s.framework_id and tf.id=t.framework_id;

create function private.assessment_evidence_valid(p_item bigint,p_actor uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.assessment_item_evidence l join public.assessment_items i on i.id=l.item_id join public.evidence e on e.id=l.evidence_id
 where i.id=p_item and e.is_current and (e.valid_until is null or e.valid_until>=(now() at time zone 'Asia/Riyadh')::date)
 and e.uploaded_by is not null and e.uploaded_by is distinct from p_actor
 and ((e.control_id=i.control_id and e.status in ('accepted','approved')) or exists(select 1 from public.evidence_control_links el where el.evidence_id=e.id and el.control_id=i.control_id and el.status in ('accepted','approved') and exists(select 1 from public.control_framework_links m where m.validation_status='approved' and ((m.source_control_id=e.control_id and m.target_control_id=i.control_id) or (m.target_control_id=e.control_id and m.source_control_id=i.control_id))))));
$$;
revoke all on function private.assessment_evidence_valid(bigint,uuid) from public,anon,authenticated;

create function private.assessment_command(p_action text,p_cycle bigint,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assessment_cycles%rowtype; i public.assessment_items%rowtype; actor uuid:=auth.uid(); role_name text:=private.current_user_role();
 fw public.frameworks%rowtype; cid bigint; target text; reason text:=nullif(btrim(p_data->>'reason'),''); x bigint; f public.assessment_findings%rowtype; nextid bigint;
begin
 if actor is null or role_name is null or role_name not in ('admin','cybersecurity_team','control_owner') then raise exception 'غير مصرح بهذا الإجراء' using errcode='42501'; end if;
 if p_action='create' then
  if role_name not in ('admin','cybersecurity_team') then raise exception 'غير مصرح' using errcode='42501'; end if;
  select * into fw from public.frameworks where id=(p_data->>'framework_id')::bigint;
  if not found then raise exception 'إطار غير موجود'; end if;
  if fw.code='CSCC' and not exists(select 1 from public.cscc_systems where id=(p_data->>'system_id')::bigint) then raise exception 'اختر النظام الحساس'; end if;
  insert into public.assessment_cycles(framework_id,framework_version,scope_name,system_id,assessor_id,created_by,due_date)
  values(fw.id,coalesce(fw.version,'unspecified'),btrim(p_data->>'scope_name'),case when fw.code='CSCC' then (p_data->>'system_id')::bigint end,actor,actor,(p_data->>'due_date')::date) returning id into cid;
  perform private.assessment_snapshot_items(cid); return jsonb_build_object('id',cid);
 end if;
 select * into a from public.assessment_cycles where id=p_cycle for update;
 if not found or not private.assessment_can_read(a.id) then raise exception 'التقييم غير متاح' using errcode='42501'; end if;
 if p_action='reassess' then
  if role_name not in ('admin','cybersecurity_team') or a.status not in ('approved','closed') then raise exception 'إعادة التقييم بعد الاعتماد فقط'; end if;
  insert into public.assessment_cycles(framework_id,framework_version,scope_name,system_id,previous_cycle_id,assessor_id,created_by,due_date)
  values(a.framework_id,a.framework_version,a.scope_name,a.system_id,a.id,actor,actor,(p_data->>'due_date')::date) returning id into cid;
  insert into public.assessment_items(cycle_id,control_id,control_code,title_ar,description_ar,domain_ar,subdomain_code,is_scoring,owner_id)
  select cid,control_id,control_code,title_ar,description_ar,domain_ar,subdomain_code,is_scoring,owner_id from public.assessment_items where cycle_id=a.id;
  return jsonb_build_object('id',cid);
 end if;
 if p_action in ('save','finding') and nullif(p_data->>'owner_id','') is not null and not exists(select 1 from public.profiles p where p.user_id=(p_data->>'owner_id')::uuid and p.is_active and p.role in ('admin','cybersecurity_team','control_owner')) then raise exception 'اختر مالكًا نشطًا مخولًا بالمعالجة'; end if;
 if p_action='finding' then
  select * into i from public.assessment_items where id=(p_data->>'item_id')::bigint and cycle_id=a.id;
  select * into f from public.assessment_findings where item_id=i.id for update;
  if not found then raise exception 'الفجوة غير موجودة'; end if;
  if role_name='control_owner' and f.owner_id is distinct from actor then raise exception 'الفجوة خارج نطاقك' using errcode='42501'; end if;
  if f.revision is distinct from (p_data->>'revision')::int then raise exception 'تغيرت الفجوة؛ أعد التحميل' using errcode='40001'; end if;
  target:=p_data->>'status';
  if target is null or target not in ('open','in_progress','verification','closed') then raise exception 'حالة معالجة غير صالحة'; end if;
  if f.status='closed' then raise exception 'الفجوة مغلقة؛ افتح معالجة جديدة عبر إعادة التقييم'; end if;
  if target='closed' then
   if actor is distinct from a.reviewer_id or actor=f.owner_id or reason is null then raise exception 'إغلاق الفجوة يتطلب تحققًا مستقلًا ومبررًا' using errcode='42501'; end if;
   x:=(p_data->>'evidence_id')::bigint;
   if not exists(select 1 from public.evidence e where e.id=x and e.is_current and e.uploaded_by is not null and e.uploaded_by is distinct from actor and (e.valid_until is null or e.valid_until>=(now() at time zone 'Asia/Riyadh')::date) and ((e.control_id=i.control_id and e.status in ('accepted','approved')) or exists(select 1 from public.evidence_control_links l where l.evidence_id=e.id and l.control_id=i.control_id and l.status in ('accepted','approved') and exists(select 1 from public.control_framework_links m where m.validation_status='approved' and ((m.source_control_id=e.control_id and m.target_control_id=i.control_id) or (m.target_control_id=e.control_id and m.source_control_id=i.control_id)))))) then raise exception 'اختر دليل معالجة صالحًا ومقبولًا للضابط'; end if;
  end if;
  update public.assessment_findings set status=target,action_plan=p_data->>'action_plan',due_date=nullif(p_data->>'due_date','')::date,
   owner_id=case when role_name='control_owner' then owner_id else nullif(p_data->>'owner_id','')::uuid end,
   severity=case when role_name='control_owner' then severity else coalesce(p_data->>'severity',severity) end,
   project_id=case when role_name='control_owner' then project_id else nullif(p_data->>'project_id','')::bigint end,
   verification_evidence_id=case when target='closed' then x end,verification_reason=case when target='closed' then reason end,
   verified_by=case when target='closed' then actor end,verified_at=case when target='closed' then now() end,revision=revision+1,updated_at=now() where id=f.id;
  return jsonb_build_object('id',f.id);
 end if;
 if a.revision is distinct from (p_data->>'cycle_revision')::int then raise exception 'تغير التقييم؛ أعد تحميله قبل المتابعة' using errcode='40001'; end if;
 if a.status in ('approved','closed') and p_action<>'close' then raise exception 'النسخة معتمدة وغير قابلة للتعديل؛ أنشئ إعادة تقييم'; end if;
 if p_action='configure' then
  if role_name not in ('admin','cybersecurity_team') or a.status<>'draft' then raise exception 'الإعدادات متاحة في المسودة فقط'; end if;
  if exists(select 1 from jsonb_array_elements_text(jsonb_build_array(p_data->>'assessor_id',p_data->>'reviewer_id',p_data->>'approver_id')) v where v.value is null or not exists(select 1 from public.profiles p where p.user_id=v.value::uuid and p.is_active and p.role in ('admin','cybersecurity_team'))) then raise exception 'اختر مسؤولين نشطين من فريق الامتثال'; end if;
  if nullif(p_data->>'due_date','') is null then raise exception 'حدد موعد استحقاق التقييم'; end if;
  update public.assessment_cycles set assessor_id=(p_data->>'assessor_id')::uuid,reviewer_id=(p_data->>'reviewer_id')::uuid,approver_id=(p_data->>'approver_id')::uuid,due_date=(p_data->>'due_date')::date,revision=revision+1 where id=a.id;
 elsif p_action='scope' then
  if role_name not in ('admin','cybersecurity_team') or a.status<>'draft' or reason is null then raise exception 'تأكيد نطاق المسودة يتطلب مبررًا'; end if;
  update public.assessment_items set is_scoring=id in(select value::bigint from jsonb_array_elements_text(p_data->'item_ids')),revision=revision+1,updated_by=actor,updated_at=now() where cycle_id=a.id;
  if not exists(select 1 from public.assessment_items where cycle_id=a.id and is_scoring) then raise exception 'اختر متطلبًا واحدًا على الأقل'; end if;
  if exists(select 1 from public.assessment_items parent join public.assessment_items child on child.cycle_id=parent.cycle_id and child.control_code like parent.control_code||'-%' where parent.cycle_id=a.id and parent.is_scoring and child.is_scoring) then raise exception 'لا تجمع الضابط الرئيسي وفروعه في مقام النسبة'; end if;
  update public.assessment_cycles set scope_confirmed_at=now(),scope_reason=reason,revision=revision+1 where id=a.id;
 elsif p_action in ('save','review') then
  select * into i from public.assessment_items where id=(p_data->>'item_id')::bigint and cycle_id=a.id for update;
  if not found or i.revision is distinct from (p_data->>'revision')::int then raise exception 'تغير المتطلب؛ أعد تحميله' using errcode='40001'; end if;
  if p_action='save' then
   if actor is distinct from a.assessor_id or a.status not in ('draft','in_progress','evidence_collection') then raise exception 'التعديل للمقيم المكلّف في مرحلة الإدخال' using errcode='42501'; end if;
   update public.assessment_items set compliance_status=nullif(p_data->>'compliance_status',''),notes=nullif(p_data->>'notes',''),corrective_action=nullif(p_data->>'corrective_action',''),expected_compliance_date=nullif(p_data->>'expected_compliance_date','')::date,owner_id=nullif(p_data->>'owner_id','')::uuid,
    review_status='pending',review_reason=null,reviewed_by=null,reviewed_at=null,revision=revision+1,updated_by=actor,updated_at=now() where id=i.id;
   delete from public.assessment_item_evidence where item_id=i.id;
   for x in select distinct value::bigint from jsonb_array_elements_text(coalesce(p_data->'evidence_ids','[]')) loop
    if not exists(select 1 from public.evidence e where e.id=x and (e.control_id=i.control_id or exists(select 1 from public.evidence_control_links l where l.evidence_id=e.id and l.control_id=i.control_id))) then raise exception 'الدليل غير مرتبط بالضابط'; end if;
    insert into public.assessment_item_evidence(item_id,control_id,evidence_id,linked_by) values(i.id,i.control_id,x,actor);
   end loop;
   if p_data->>'compliance_status' in ('not_implemented','partially_implemented') then
    insert into public.assessment_findings(item_id,control_id,title,owner_id,due_date,action_plan) values(i.id,i.control_id,i.title_ar,nullif(p_data->>'owner_id','')::uuid,nullif(p_data->>'expected_compliance_date','')::date,p_data->>'corrective_action')
    on conflict(item_id) do update set action_plan=excluded.action_plan,due_date=excluded.due_date,owner_id=excluded.owner_id,revision=assessment_findings.revision+1,updated_at=now() where assessment_findings.status<>'closed';
   end if;
  else
   if actor is distinct from a.reviewer_id or actor=a.assessor_id or a.status<>'under_review' or reason is null then raise exception 'المراجعة للمراجع المكلّف مع سبب القرار' using errcode='42501'; end if;
   target:=p_data->>'decision'; if target not in ('accepted','changes_requested') then raise exception 'قرار غير صالح'; end if;
   if target='accepted' and i.compliance_status in ('implemented','partially_implemented') and not private.assessment_evidence_valid(i.id,actor) then raise exception 'النتيجة تتطلب دليلًا حاليًا مقبولًا ومستقلًا'; end if;
   if target='accepted' and (i.compliance_status is null or nullif(btrim(i.notes),'') is null) then raise exception 'أكمل النتيجة ومبررها'; end if;
   update public.assessment_items set review_status=target,review_reason=reason,reviewed_by=actor,reviewed_at=now(),revision=revision+1 where id=i.id;
  end if;
 else
  target:=case p_action when 'start' then 'in_progress' when 'collect' then 'evidence_collection' when 'submit' then 'under_review' when 'return' then 'evidence_collection' when 'complete' then 'completed' when 'approve' then 'approved' when 'close' then 'closed' end;
  if target is null then raise exception 'إجراء غير معروف'; end if;
  if p_action in ('start','collect','submit') and actor is distinct from a.assessor_id then raise exception 'الإجراء للمقيم المكلّف' using errcode='42501'; end if;
  if p_action in ('return','complete') and actor is distinct from a.reviewer_id then raise exception 'الإجراء للمراجع المكلّف' using errcode='42501'; end if;
  if p_action in ('approve','close') and (actor is distinct from a.approver_id or actor=a.assessor_id) then raise exception 'الإجراء للمعتمد المستقل' using errcode='42501'; end if;
  if not ((p_action='start' and a.status='draft') or (p_action='collect' and a.status='in_progress') or (p_action='submit' and a.status in ('in_progress','evidence_collection')) or (p_action='return' and a.status in ('under_review','completed')) or (p_action='complete' and a.status='under_review') or (p_action='approve' and a.status='completed') or (p_action='close' and a.status='approved')) then raise exception 'انتقال غير مسموح من الحالة الحالية'; end if;
  if p_action='start' and (a.scope_confirmed_at is null or a.assessor_id is null or a.reviewer_id is null or a.approver_id is null or a.due_date is null) then raise exception 'أكد النطاق وعيّن المسؤولين والموعد أولًا'; end if;
  if p_action in ('submit','complete','approve') and exists(select 1 from public.assessment_items q where q.cycle_id=a.id and q.is_scoring and (q.compliance_status is null or nullif(btrim(q.notes),'') is null or (q.compliance_status in ('not_implemented','partially_implemented') and (q.owner_id is null or q.expected_compliance_date is null or nullif(btrim(q.corrective_action),'') is null)))) then raise exception 'أكمل النتائج والمبررات وخطط معالجة الفجوات وملاكها ومواعيدها'; end if;
  if p_action in ('complete','approve') and exists(select 1 from public.assessment_items q where q.cycle_id=a.id and q.is_scoring and (q.review_status<>'accepted' or (q.compliance_status in ('implemented','partially_implemented') and not private.assessment_evidence_valid(q.id,a.reviewer_id)))) then raise exception 'توجد نتائج لم تقبل أو أدلة تغيرت صلاحيتها؛ أعدها للمراجعة'; end if;
  if p_action in ('return','approve','close') and reason is null then raise exception 'سبب القرار مطلوب'; end if;
  if p_action='approve' and (p_data->>'next_review_date')::date<=(now() at time zone 'Asia/Riyadh')::date then raise exception 'موعد إعادة التقييم يجب أن يكون مستقبليًا'; end if;
  if p_action='approve' and nullif(p_data->>'next_review_date','') is null then raise exception 'حدد موعد إعادة التقييم'; end if;
  update public.assessment_cycles set status=target,revision=revision+1,
   approved_by=case when p_action='approve' then actor else approved_by end,
   approved_at=case when p_action='approve' then now() else approved_at end,
   next_review_date=case when p_action='approve' then (p_data->>'next_review_date')::date else next_review_date end,
   approved_snapshot=case when p_action='approve' then jsonb_build_object('reason',reason,'method','full-scope-v1','items',(select jsonb_agg(to_jsonb(q)||jsonb_build_object('evidence',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.assessment_item_evidence l join public.evidence e on e.id=l.evidence_id where l.item_id=q.id))) from public.assessment_items q where q.cycle_id=a.id)) else approved_snapshot end
   where id=a.id;
  insert into public.grc_audit_events(entity_type,entity_id,action,actor_id,new_data) values('assessment_cycles',a.id::text,p_action,actor,jsonb_build_object('reason',reason,'status',target));
 end if;
 return jsonb_build_object('id',a.id);
end $$;
revoke all on function private.assessment_command(text,bigint,jsonb) from public,anon;
grant execute on function private.assessment_command(text,bigint,jsonb) to authenticated;
create function public.cgp_assessment_command(p_action text,p_cycle bigint default null,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.assessment_command(p_action,p_cycle,p_data); $$;
revoke all on function public.cgp_assessment_command(text,bigint,jsonb) from public,anon;
grant execute on function public.cgp_assessment_command(text,bigint,jsonb) to authenticated;

create trigger assessment_crosswalk_audit after insert or update or delete on public.control_framework_links for each row execute function private.grc_audit();
create policy grc_crosswalk_events on public.grc_audit_events for select to authenticated using(entity_type='control_framework_links' and private.current_user_role() in ('admin','cybersecurity_team'));
create function public.cgp_crosswalk() returns table(id bigint,source_id bigint,target_id bigint,source_framework text,target_framework text,source_code text,target_code text,source_title text,target_title text,source_version text,target_version text,relationship_type text,coverage_type text,validation_status text,source_reference text,coverage_notes text,reviewed_by uuid,reviewed_at timestamptz,approved_by uuid,approved_at timestamptz,revision integer)
language sql stable security invoker set search_path='' as $$
 select l.id,s.id,t.id,sf.code,tf.code,s.control_code,t.control_code,s.title_ar,t.title_ar,l.source_version,l.target_version,l.relationship_type,l.coverage_type,l.validation_status,l.source_reference,l.coverage_notes,l.reviewed_by,l.reviewed_at,l.approved_by,l.approved_at,l.revision
 from public.control_framework_links l join public.controls s on s.id=l.source_control_id join public.controls t on t.id=l.target_control_id join public.frameworks sf on sf.id=s.framework_id join public.frameworks tf on tf.id=t.framework_id;
$$;
revoke all on function public.cgp_crosswalk() from public,anon;
grant execute on function public.cgp_crosswalk() to authenticated;
create function private.crosswalk_command(p_id bigint,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare l public.control_framework_links%rowtype; actor uuid:=auth.uid(); begin
 if actor is null or coalesce(private.current_user_role(),'') not in ('admin','cybersecurity_team') then raise exception 'غير مصرح' using errcode='42501'; end if;
 if p_id is null then
  if p_data->>'action'<>'create' or (p_data->>'source_id')::bigint=(p_data->>'target_id')::bigint then raise exception 'اختر ضابطين مختلفين'; end if;
  if nullif(btrim(p_data->>'source_reference'),'') is null or nullif(btrim(p_data->>'coverage_notes'),'') is null then raise exception 'المصدر وحدود التغطية مطلوبان'; end if;
  insert into public.control_framework_links(source_control_id,target_control_id,relationship_type,coverage_type,source_reference,coverage_notes,source_version,target_version,reviewed_by,reviewed_at)
  select sc.id,tc.id,'manual_mapping',p_data->>'coverage_type',p_data->>'source_reference',p_data->>'coverage_notes',sf.version,tf.version,actor,now()
  from public.controls sc join public.frameworks sf on sf.id=sc.framework_id,public.controls tc join public.frameworks tf on tf.id=tc.framework_id
  where sc.id=(p_data->>'source_id')::bigint and tc.id=(p_data->>'target_id')::bigint;
  if not found then raise exception 'الضابط غير موجود'; end if;
  return;
 end if;
 select * into l from public.control_framework_links where id=p_id for update;
 if not found or l.revision is distinct from (p_data->>'revision')::int then raise exception 'تغير الرابط؛ أعد التحميل'; end if;
 if p_data->>'action'='approve' then
  if l.validation_status<>'pending' or l.reviewed_by is null or l.reviewed_by=actor or nullif(l.source_reference,'') is null or nullif(l.coverage_notes,'') is null then raise exception 'الاعتماد يتطلب مصدرًا وتفسيرًا ومراجعًا آخر'; end if;
  update public.control_framework_links set validation_status='approved',approved_by=actor,approved_at=now(),revision=revision+1 where id=p_id;
 else
  if nullif(btrim(p_data->>'source_reference'),'') is null or nullif(btrim(p_data->>'coverage_notes'),'') is null then raise exception 'المصدر وحدود التغطية مطلوبان'; end if;
  update public.control_framework_links set source_reference=p_data->>'source_reference',coverage_notes=p_data->>'coverage_notes',coverage_type=p_data->>'coverage_type',validation_status=case when p_data->>'action'='reject' then 'rejected' else 'pending' end,reviewed_by=actor,reviewed_at=now(),approved_by=null,approved_at=null,revision=revision+1 where id=p_id;
 end if;
end $$;
revoke all on function private.crosswalk_command(bigint,jsonb) from public,anon;
grant execute on function private.crosswalk_command(bigint,jsonb) to authenticated;
create function public.cgp_crosswalk_command(p_id bigint,p_data jsonb) returns void language sql security invoker set search_path='' as $$ select private.crosswalk_command(p_id,p_data); $$;
revoke all on function public.cgp_crosswalk_command(bigint,jsonb) from public,anon;
grant execute on function public.cgp_crosswalk_command(bigint,jsonb) to authenticated;
-- Expose metadata to assigned owners without exposing the full approved snapshot.
drop policy assessment_cycle_read on public.assessment_cycles;
create policy assessment_cycle_read on public.assessment_cycles for select to authenticated using(private.assessment_can_read(id));
revoke select on public.assessment_cycles from authenticated;
grant select(id,framework_id,framework_version,scope_name,system_id,previous_cycle_id,status,assessor_id,reviewer_id,approver_id,due_date,next_review_date,scope_confirmed_at,scope_reason,revision,imported,created_by,created_at,approved_by,approved_at) on public.assessment_cycles to authenticated;

-- Results and evidence links become immutable when the cycle is approved.
create function private.assessment_frozen() returns trigger language plpgsql set search_path='' as $$
declare cid bigint; begin
 if TG_TABLE_NAME='assessment_items' then cid:=coalesce(old.cycle_id,new.cycle_id);
 else select cycle_id into cid from public.assessment_items where id=coalesce(old.item_id,new.item_id); end if;
 if exists(select 1 from public.assessment_cycles where id=cid and status in ('approved','closed')) then raise exception 'Approved assessment history is immutable'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.assessment_frozen() from public,anon,authenticated;
create trigger assessment_item_frozen before insert or update or delete on public.assessment_items for each row execute function private.assessment_frozen();
create trigger assessment_evidence_frozen before insert or update or delete on public.assessment_item_evidence for each row execute function private.assessment_frozen();
create function private.assessment_control_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and (new.implementation_status is distinct from old.implementation_status or new.verification_status is distinct from old.verification_status)
 and exists(select 1 from public.frameworks where id=new.framework_id and code in ('CSCC','DCC','TCC','OSMACC')) then
 raise exception 'استخدم قرار مراجعة الضابط المستقل؛ التقييمات القطاعية لا تعدّل الحالة العامة مباشرة' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.assessment_control_guard() from public,anon,authenticated;
create trigger assessment_control_guard before update on public.controls for each row execute function private.assessment_control_guard();

-- Replace legacy ECC reflections with approved, scope-preserving assessment results.
create or replace function public.ecc_assessment_reflections(p_ecc_control_id bigint)
returns table(source_framework text,source_control_code text,source_control_title text,assessment_scope text,compliance_status text,notes text,corrective_action text,expected_compliance_date date,updated_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select f.code,i.control_code,i.title_ar,a.scope_name||' · دورة #'||a.id::text,i.compliance_status,i.notes,i.corrective_action,i.expected_compliance_date,a.approved_at
 from public.control_framework_links l join public.assessment_items i on i.control_id=l.source_control_id
 join public.assessment_cycles a on a.id=i.cycle_id join public.frameworks f on f.id=a.framework_id
 where l.target_control_id=p_ecc_control_id and l.validation_status='approved' and a.status in ('approved','closed') and i.is_scoring
 order by f.code,i.control_code,a.approved_at desc;
$$;
create function public.cgp_assessment_summary() returns jsonb language sql stable security invoker set search_path='' as $$
with stats as (
 select a.id,a.framework_id,f.code framework,a.framework_version,a.scope_name,a.status,a.previous_cycle_id,a.due_date,a.next_review_date,a.approved_at,
 count(i.id) filter(where i.is_scoring) total,
 count(i.id) filter(where i.is_scoring and i.compliance_status is not null) assessed,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted') reviewed,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted' and i.compliance_status='not_applicable' and a.status in ('approved','closed')) not_applicable,
 count(i.id) filter(where i.is_scoring and i.review_status='accepted' and i.compliance_status='implemented' and a.status in ('approved','closed')) compliant,
 count(i.id) filter(where i.is_scoring and (i.compliance_status is null or nullif(btrim(i.notes),'') is null or (i.compliance_status in ('not_implemented','partially_implemented') and (i.owner_id is null or i.expected_compliance_date is null or nullif(btrim(i.corrective_action),'') is null)))) missing_data,
 string_agg(i.control_code,',' order by i.control_code) filter(where i.is_scoring) scope_signature
 from public.assessment_cycles a join public.frameworks f on f.id=a.framework_id left join public.assessment_items i on i.cycle_id=a.id
 group by a.id,f.code
), summaries as (
 select s.*,case when s.status in ('approved','closed') then 100.0*s.compliant/nullif(s.total-s.not_applicable,0) end compliance,
 100.0*s.assessed/nullif(s.total,0) completion,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed') open_gaps,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed' and g.severity='critical') critical_gaps,
 (select count(*) from public.assessment_findings g join public.assessment_items i on i.id=g.item_id where i.cycle_id=s.id and g.status<>'closed' and g.due_date<(now() at time zone 'Asia/Riyadh')::date) overdue_actions,
 (select count(distinct l.evidence_id) from public.assessment_item_evidence l join public.assessment_items i on i.id=l.item_id join public.evidence e on e.id=l.evidence_id where i.cycle_id=s.id and e.is_current and (e.valid_until is null or e.valid_until>=(now() at time zone 'Asia/Riyadh')::date) and ((e.control_id=i.control_id and e.status in ('pending_review','under_review','submitted')) or exists(select 1 from public.evidence_control_links el where el.evidence_id=e.id and el.control_id=i.control_id and el.status in ('pending_review','under_review')))) pending_evidence,
 (select count(distinct l.evidence_id) from public.assessment_item_evidence l join public.assessment_items i on i.id=l.item_id join public.evidence e on e.id=l.evidence_id where i.cycle_id=s.id and (not e.is_current or e.valid_until<(now() at time zone 'Asia/Riyadh')::date)) evidence_needing_refresh
 from stats s
)
select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('improvement',case when p.status in ('approved','closed') and s.status in ('approved','closed') and p.scope_signature=s.scope_signature and p.framework_version=s.framework_version and p.scope_name=s.scope_name then s.compliance-p.compliance end) order by s.id desc),'[]')
from summaries s left join summaries p on p.id=s.previous_cycle_id;
$$;
revoke all on function public.cgp_assessment_summary() from public,anon;
grant execute on function public.cgp_assessment_summary() to authenticated;
-- Only validated relationships are presented as eligible evidence-sharing links.
create or replace function public.grc_control_mappings(p_control_id bigint)
returns table(control_id bigint,framework_code text,control_code text,control_title text,relationship_type text,source_note text)
language sql stable security invoker set search_path='' as $$
 select c.id,f.code,c.control_code,c.title_ar,l.coverage_type,l.coverage_notes
 from public.control_framework_links l join public.controls c on c.id=case when l.source_control_id=p_control_id then l.target_control_id else l.source_control_id end
 join public.frameworks f on f.id=c.framework_id
 where (l.source_control_id=p_control_id or l.target_control_id=p_control_id) and l.validation_status='approved';
$$;
create function private.assessment_shared_mapping_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not exists(select 1 from public.evidence e join public.control_framework_links l on ((l.source_control_id=e.control_id and l.target_control_id=new.control_id) or (l.target_control_id=e.control_id and l.source_control_id=new.control_id)) and l.validation_status='approved' where e.id=new.evidence_id) then raise exception 'مشاركة الدليل تحتاج علاقة مواءمة معتمدة'; end if;
 return new;
end $$;
revoke all on function private.assessment_shared_mapping_guard() from public,anon,authenticated;
create trigger assessment_shared_mapping_guard before insert on public.evidence_control_links for each row execute function private.assessment_shared_mapping_guard();

-- Legacy system scopes with assessment history cannot be deleted through the old API.
revoke delete on public.cscc_systems from authenticated;

-- Crosswalk approval is only writable through the checked command.
revoke insert,update,delete on public.control_framework_links from authenticated;

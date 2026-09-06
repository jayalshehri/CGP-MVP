do $$
begin
  if exists (
    select 1
    from public.controls c
    join public.frameworks f on f.id = c.framework_id
    where f.code = 'OTCC'
      and (
        c.implementation_status <> 'not_started'
        or c.control_owner_id is not null
        or c.control_owner is not null
        or c.due_date is not null
        or exists (select 1 from public.evidence e where e.control_id = c.id)
        or exists (select 1 from public.control_work_items w where w.control_id = c.id)
        or exists (select 1 from public.control_notes n where n.control_id = c.id)
      )
  ) then
    raise exception 'OTCC contains workflow data and cannot be removed automatically';
  end if;
end $$;

delete from public.controls
where framework_id = (select id from public.frameworks where code = 'OTCC');

delete from public.frameworks where code = 'OTCC';

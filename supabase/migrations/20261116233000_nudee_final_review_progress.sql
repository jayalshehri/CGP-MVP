-- Nudee workbook's fourth phase (comprehensive review) is a manually maintained
-- progress input (Excel: الجدول الزمني!K15), NOT the third maturity level.
-- Preserve this independent 0..100% office-owned progress with audit history.
create table public.nudee_final_review (
  id smallint primary key default 1 check (id = 1),
  progress numeric(5,4) not null default 0 check (progress between 0 and 1),
  notes text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.nudee_final_review (id,progress) values (1,0);
create table public.nudee_final_review_audit (
  id bigint generated always as identity primary key,
  old_progress numeric(5,4) not null,
  new_progress numeric(5,4) not null,
  notes text not null,
  actor_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create index nudee_final_review_audit_changed_at_idx on public.nudee_final_review_audit(changed_at desc);
alter table public.nudee_final_review enable row level security;
alter table public.nudee_final_review_audit enable row level security;
create policy nudee_final_review_office_read on public.nudee_final_review
  for select to authenticated using (public.nudee_is_office());
create policy nudee_final_review_audit_office_read on public.nudee_final_review_audit
  for select to authenticated using (public.nudee_is_office());
revoke all on public.nudee_final_review,public.nudee_final_review_audit from public,anon,authenticated;
grant select on public.nudee_final_review,public.nudee_final_review_audit to authenticated;

create function public.nudee_set_final_review_progress(
  p_percent numeric, p_notes text
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_old numeric(5,4);
  v_new numeric(5,4);
begin
  if v_actor is null or not public.nudee_is_office() then
    raise exception 'Data Office reviewer role required';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'Percent must be between 0 and 100';
  end if;
  if nullif(btrim(p_notes),'') is null or length(p_notes) > 2000 then
    raise exception 'A review note of up to 2000 characters is required';
  end if;
  v_new := round(p_percent / 100,4);
  select progress into v_old from public.nudee_final_review where id = 1 for update;
  if not found then raise exception 'Final-review tracking is not initialized'; end if;
  update public.nudee_final_review
    set progress = v_new, notes = btrim(p_notes), updated_by = v_actor, updated_at = now()
    where id = 1;
  insert into public.nudee_final_review_audit(old_progress,new_progress,notes,actor_id)
    values(v_old,v_new,btrim(p_notes),v_actor);
  return v_new;
end;
$$;
revoke all on function public.nudee_set_final_review_progress(numeric,text) from public,anon;
grant execute on function public.nudee_set_final_review_progress(numeric,text) to authenticated;

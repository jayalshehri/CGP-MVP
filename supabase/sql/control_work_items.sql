begin;
create table public.control_work_items (
 control_id bigint not null references public.controls(id) on delete cascade,
 item_key text not null check(length(item_key) between 1 and 100),
 completed boolean not null default false,
 primary key(control_id,item_key)
);
alter table public.control_work_items enable row level security;
revoke all on public.control_work_items from public,anon,authenticated;
grant select,insert,update on public.control_work_items to authenticated;
create policy work_read on public.control_work_items for select to authenticated using(exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid())))));
create policy work_insert on public.control_work_items for insert to authenticated with check(exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid())))));
create policy work_update on public.control_work_items for update to authenticated using(exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid()))))) with check(exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid())))));
create table public.control_notes (
 id bigint generated always as identity primary key,
 control_id bigint not null references public.controls(id) on delete cascade,
 author_id uuid not null default auth.uid(),
 body text not null check(length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
alter table public.control_notes enable row level security;
revoke all on public.control_notes from public,anon,authenticated;
grant select on public.control_notes to authenticated;
grant insert(control_id,body) on public.control_notes to authenticated;
grant usage on sequence public.control_notes_id_seq to authenticated;
create policy notes_read on public.control_notes for select to authenticated using(exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid())))));
create policy notes_insert on public.control_notes for insert to authenticated with check(author_id=auth.uid() and exists(select 1 from public.controls c where c.id=control_id and ((select private.current_user_role()) in ('admin','cybersecurity_team') or ((select private.current_user_role())='control_owner' and c.control_owner_id=(select auth.uid())))));
commit;

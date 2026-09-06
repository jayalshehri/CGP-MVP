create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null default 'suggestion' check (category in ('suggestion', 'bug', 'question')),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  page_path text not null check (char_length(page_path) between 1 and 500),
  control_id bigint references public.controls(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved'))
);

create index if not exists feedback_created_at_idx on public.feedback(created_at desc);
create index if not exists feedback_created_by_idx on public.feedback(created_by);
create index if not exists feedback_control_id_idx on public.feedback(control_id);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert on public.feedback to authenticated;
grant update(status, priority) on public.feedback to authenticated;
grant delete on public.feedback to authenticated;

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check ((select auth.uid()) = created_by and (select private.current_user_role()) is not null);

drop policy if exists feedback_read_scoped on public.feedback;
create policy feedback_read_scoped on public.feedback for select to authenticated
  using (created_by = (select auth.uid()) or (select private.current_user_role()) = 'admin');

drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update to authenticated
  using ((select private.current_user_role()) = 'admin')
  with check ((select private.current_user_role()) = 'admin');

drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback for delete to authenticated
  using ((select private.current_user_role()) = 'admin');

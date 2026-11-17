-- Defense in depth against an assignment/upload race.
-- A Storage object uploaded by the former assignee can commit after
-- an office reassignment's orphan check. Folder ownership alone must
-- never grant a new assignee access to the former assignee's bytes.
-- Office users retain read/cleanup rights for orphan resolution.
drop policy if exists nudee_storage_read on storage.objects;
create policy nudee_storage_read on storage.objects
for select to authenticated using (
  bucket_id = 'nudee-evidence'
  and (
    public.nudee_is_office()
    or (
      owner_id = (select auth.uid())::text
      and exists (
        select 1
        from public.nudee_assignments a
        join public.profiles p on p.user_id = a.assignee_id
        where a.id::text = (storage.foldername(storage.objects.name))[1]
          and a.assignee_id = (select auth.uid())
          and p.is_active
      )
    )
  )
);

drop policy if exists nudee_storage_delete_unsent on storage.objects;
create policy nudee_storage_delete_unsent on storage.objects
for delete to authenticated using (
  bucket_id = 'nudee-evidence'
  and exists (
    select 1
    from public.nudee_assignments a
    where a.id::text = (storage.foldername(storage.objects.name))[1]
      and a.status in ('assigned', 'changes_requested')
      and not exists (
        select 1 from public.nudee_submissions s
        where s.storage_path = storage.objects.name
      )
      and (
        public.nudee_is_office()
        or (
          owner_id = (select auth.uid())::text
          and a.assignee_id = (select auth.uid())
          and exists (
            select 1 from public.profiles p
            where p.user_id = (select auth.uid()) and p.is_active
          )
        )
      )
  )
);
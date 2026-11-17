-- Defense in depth: an assigned Nudee owner must not forge an object's owner_id.
-- Storage uploads run with the uploader's JWT. The HTTP Storage service ordinarily
-- populates owner_id from that JWT; bind the RLS INSERT policy to the same identity.
-- This hardens the policy against direct authenticated storage.objects inserts.
-- The SELECT and DELETE policies remain intentionally unchanged.
drop policy if exists nudee_storage_upload on storage.objects;
create policy nudee_storage_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'nudee-evidence'
  and owner_id = (select auth.uid())::text
  and exists (
    select 1
    from public.nudee_assignments a
    join public.profiles p on p.user_id = a.assignee_id
    where a.id::text = (storage.foldername(storage.objects.name))[1]
      and a.assignee_id = (select auth.uid())
      and a.status in ('assigned', 'changes_requested')
      and p.is_active
  )
);

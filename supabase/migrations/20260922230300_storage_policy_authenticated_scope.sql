-- Reconcile QA Storage policy-role drift with the existing CGP migrations and
-- Production baseline. Four evidence-files policies were created FOR
-- authenticated but QA currently exposes them TO public (including anon).
-- Keep USING/WITH CHECK predicates unchanged. Requires a migration session
-- authorized to ALTER POLICY on storage.objects.
begin;
set local lock_timeout = '10s';

do $precheck$
begin
  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('cgp_file_cleanup','cgp_file_read',
                           'cgp_file_upload','grc_shared_file_read')) <> 4
     or exists (
       select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname in ('cgp_file_cleanup','cgp_file_read',
                            'cgp_file_upload','grc_shared_file_read')
         and roles not in (array['public']::name[],
                           array['authenticated']::name[])
     ) then
    raise exception 'Unexpected CGP Storage policy set or roles';
  end if;
end
$precheck$;

alter policy cgp_file_cleanup on storage.objects to authenticated;
alter policy cgp_file_read on storage.objects to authenticated;
alter policy cgp_file_upload on storage.objects to authenticated;
alter policy grc_shared_file_read on storage.objects to authenticated;

do $postcheck$
begin
  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('cgp_file_cleanup','cgp_file_read',
                           'cgp_file_upload','grc_shared_file_read')
        and roles = array['authenticated']::name[]) <> 4 then
    raise exception 'CGP Storage policy-role reconciliation incomplete';
  end if;
end
$postcheck$;
commit;

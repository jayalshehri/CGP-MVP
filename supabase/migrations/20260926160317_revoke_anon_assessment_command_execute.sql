-- P2-B3.4: remove the unintended anon EXECUTE grant on the assessment RPC.
-- Preserve authenticated and service_role grants, function definitions, and data.
begin;

revoke execute on function public.cgp_assessment_command(text, bigint, jsonb)
  from anon;

do $verify$
begin
  if has_function_privilege(
       'anon', 'public.cgp_assessment_command(text,bigint,jsonb)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.cgp_assessment_command(text,bigint,jsonb)', 'EXECUTE'
     )
  then
    raise exception 'Assessment RPC EXECUTE grants did not reach the certified state';
  end if;
end
$verify$;

commit;

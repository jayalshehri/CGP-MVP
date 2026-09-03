alter function public.is_cgp_admin_or_team() security invoker;
revoke all on function public.is_cgp_admin_or_team() from public,anon;
grant execute on function public.is_cgp_admin_or_team() to authenticated;

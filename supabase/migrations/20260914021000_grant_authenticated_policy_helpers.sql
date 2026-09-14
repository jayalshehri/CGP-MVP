-- RLS policies invoke these private helpers for every authenticated CGP role.
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_cgp_admin() to authenticated;
grant execute on function private.can_external_auditor_view_framework(bigint) to authenticated;
grant execute on function private.can_external_auditor_view_control(bigint) to authenticated;

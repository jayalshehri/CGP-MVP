-- Remove non-workflow data manipulation privileges from the client role.
revoke all on public.data_governance_requests from authenticated;
grant select, insert on public.data_governance_requests to authenticated;
revoke all on public.data_governance_request_events from authenticated;
grant select on public.data_governance_request_events to authenticated;

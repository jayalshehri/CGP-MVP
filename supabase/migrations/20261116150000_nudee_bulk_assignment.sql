
-- One transaction for the entire bulk operation: either every assignment succeeds or none.
create function public.nudee_assign_many(p_requirement_ids bigint[],p_assignee_id uuid,p_due_date date default null)
returns integer language plpgsql security definer set search_path='' as $$
declare v_requirement_id bigint; v_count integer := 0;
begin
 if auth.uid() is null or not public.nudee_is_office() then raise exception 'Data Office role required'; end if;
 if p_requirement_ids is null or cardinality(p_requirement_ids)=0 or cardinality(p_requirement_ids)>100 then
  raise exception 'Provide between 1 and 100 requirements';
 end if;
 if (select count(distinct value) from unnest(p_requirement_ids) as x(value)) <> cardinality(p_requirement_ids) then
  raise exception 'Duplicate or null requirement IDs are not allowed';
 end if;
 foreach v_requirement_id in array p_requirement_ids loop
  perform public.nudee_assign(v_requirement_id,p_assignee_id,p_due_date);
  v_count := v_count+1;
 end loop;
 return v_count;
end; $$;
revoke all on function public.nudee_assign_many(bigint[],uuid,date) from public,anon;
grant execute on function public.nudee_assign_many(bigint[],uuid,date) to authenticated;

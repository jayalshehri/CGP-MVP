-- Enforce maker-checker separation for the final data governance decision.
create or replace function public.transition_data_governance_request(
  p_request_id bigint,
  p_target_status text,
  p_comment text default null
)
returns public.data_governance_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.data_governance_requests;
  v_actor uuid := auth.uid();
  v_role text;
  v_event_type text;
  v_from_status text;
begin
  if v_actor is null then raise exception 'يجب تسجيل الدخول لتنفيذ الاعتماد'; end if;
  select role into v_role from public.profiles where user_id = v_actor and is_active = true;
  if v_role not in ('admin', 'data_governance_team') then raise exception 'لا تملك صلاحية تنفيذ اعتماد حوكمة البيانات'; end if;
  if p_target_status not in ('steward_review', 'governance_review', 'approved', 'returned', 'rejected', 'submitted') then raise exception 'حالة الاعتماد غير صالحة'; end if;
  if p_comment is not null and char_length(btrim(p_comment)) > 2000 then raise exception 'ملاحظة الاعتماد طويلة جداً'; end if;
  select * into v_request from public.data_governance_requests where id = p_request_id for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  if not ((v_request.status = 'submitted' and p_target_status = 'steward_review') or (v_request.status = 'steward_review' and p_target_status in ('governance_review', 'returned')) or (v_request.status = 'governance_review' and p_target_status in ('approved', 'returned', 'rejected')) or (v_request.status = 'returned' and p_target_status = 'submitted')) then raise exception 'لا يمكن نقل الطلب من الحالة % إلى الحالة %', v_request.status, p_target_status; end if;
  if p_target_status in ('approved', 'rejected') and v_request.created_by = v_actor then raise exception 'لا يمكن لمنشئ الطلب اعتماده أو رفضه؛ يلزم مراجع مستقل'; end if;
  v_from_status := v_request.status;
  v_event_type := case p_target_status when 'steward_review' then 'steward_review_started' when 'governance_review' then 'governance_review_started' when 'approved' then 'approved' when 'returned' then 'returned_for_completion' when 'rejected' then 'rejected' else 'resubmitted' end;
  update public.data_governance_requests set status = p_target_status, review_comment = nullif(btrim(p_comment), ''), last_action_by = v_actor, last_action_at = now(), updated_at = now() where id = p_request_id returning * into v_request;
  insert into public.data_governance_request_events (request_id, from_status, to_status, event_type, comment, actor_id) values (v_request.id, v_from_status, p_target_status, v_event_type, nullif(btrim(p_comment), ''), v_actor);
  return v_request;
end;
$$;
-- One physical evidence file may be proposed for explicitly mapped controls.
-- Each target control keeps a separate review decision and audit record.
create table if not exists public.evidence_control_links (
  id bigint generated always as identity primary key,
  evidence_id bigint not null references public.evidence(id) on delete cascade,
  control_id bigint not null references public.controls(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review','under_review','accepted','rejected')),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique (evidence_id, control_id)
);

create table if not exists public.evidence_control_link_reviews (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.evidence_control_links(id) on delete cascade,
  decision text not null check (decision in ('accepted','rejected')),
  reviewer_name text,
  review_notes text,
  reviewed_at timestamptz not null default now()
);

alter table public.evidence_control_links enable row level security;
alter table public.evidence_control_link_reviews enable row level security;
revoke all on public.evidence_control_links, public.evidence_control_link_reviews from anon;
grant select, insert on public.evidence_control_links to authenticated;
grant select on public.evidence_control_link_reviews to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy cgp_shared_evidence_links_team_read on public.evidence_control_links for select to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'));
create policy cgp_shared_evidence_links_team_insert on public.evidence_control_links for insert to authenticated
with check (
  (select private.current_user_role()) in ('admin','cybersecurity_team')
  and created_by=(select auth.uid())
  and exists (select 1 from public.evidence e where e.id=evidence_id)
  and exists (select 1 from public.control_framework_links l join public.evidence e on e.id=evidence_id where l.source_control_id=control_id and l.target_control_id=e.control_id)
);
create policy cgp_shared_evidence_review_history on public.evidence_control_link_reviews for select to authenticated
using ((select private.current_user_role()) in ('admin','cybersecurity_team'));

create index if not exists cgp_shared_evidence_target_idx on public.evidence_control_links(control_id,status);
create index if not exists cgp_shared_evidence_source_idx on public.evidence_control_links(evidence_id);

create or replace function public.ecc_control_mappings(p_ecc_control_id bigint)
returns table (
  control_id bigint,
  framework_code text,
  control_code text,
  control_title text,
  relationship_type text,
  source_note text
)
language sql stable security invoker set search_path='public' as $$
  select sc.id, f.code, sc.control_code, sc.title_ar, l.relationship_type, l.source_note
  from public.control_framework_links l
  join public.controls sc on sc.id=l.source_control_id
  join public.frameworks f on f.id=sc.framework_id
  where l.target_control_id=p_ecc_control_id
  order by f.code, sc.control_code;
$$;
revoke all on function public.ecc_control_mappings(bigint) from public, anon;
grant execute on function public.ecc_control_mappings(bigint) to authenticated;

create or replace function public.shared_evidence_review_queue()
returns table (
  link_id bigint,
  evidence_id bigint,
  target_control_id bigint,
  target_control_code text,
  target_control_title text,
  source_control_id bigint,
  source_control_code text,
  source_control_title text,
  evidence_name text,
  file_name text,
  file_path text,
  description text,
  uploaded_at timestamptz,
  status text,
  review_notes text
)
language sql stable security invoker set search_path='public' as $$
  select l.id,e.id,target.id,target.control_code,target.title_ar,source.id,source.control_code,source.title_ar,
    e.evidence_name,e.file_name,e.file_path,e.description,e.uploaded_at,l.status,l.review_notes
  from public.evidence_control_links l
  join public.evidence e on e.id=l.evidence_id
  join public.controls target on target.id=l.control_id
  join public.controls source on source.id=e.control_id
  where (select private.current_user_role()) in ('admin','cybersecurity_team')
  order by l.created_at desc;
$$;
revoke all on function public.shared_evidence_review_queue() from public, anon;
grant execute on function public.shared_evidence_review_queue() to authenticated;

create or replace function public.cgp_review_shared_evidence_link(p_link_id bigint,p_decision text,p_notes text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare target bigint;
begin
  if (select private.current_user_role()) not in ('admin','cybersecurity_team') then
    raise exception 'Reviewer role required' using errcode='42501';
  end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Invalid review decision'; end if;
  if p_decision='rejected' and nullif(btrim(p_notes),'') is null then raise exception 'Rejection notes are required'; end if;
  select control_id into target from public.evidence_control_links where id=p_link_id for update;
  if not found then raise exception 'Shared evidence link not found'; end if;
  update public.evidence_control_links set status=p_decision, review_notes=nullif(btrim(p_notes),''), reviewed_at=now(), reviewed_by=(select auth.uid())::text
  where id=p_link_id and status in ('pending_review','under_review');
  if not found then raise exception 'Evidence is no longer pending. Refresh the page.'; end if;
  insert into public.evidence_control_link_reviews(link_id,decision,reviewer_name,review_notes)
  values(p_link_id,p_decision,(select auth.uid())::text,nullif(btrim(p_notes),''));
  -- This decision proves the shared evidence was assessed for the target. It does not auto-mark the target as implemented.
  update public.controls set evidence_status=p_decision,
    verification_status=case when p_decision='accepted' then 'verified' else 'not_verified' end,
    last_review_date=current_date
  where id=target;
end $$;
revoke all on function public.cgp_review_shared_evidence_link(bigint,text,text) from public, anon;
grant execute on function public.cgp_review_shared_evidence_link(bigint,text,text) to authenticated;

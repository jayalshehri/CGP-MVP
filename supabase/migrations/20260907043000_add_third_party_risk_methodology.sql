alter table public.third_parties drop constraint if exists third_parties_inherent_risk_score_check;
alter table public.third_parties add column if not exists risk_scenario text;
alter table public.third_parties add column if not exists likelihood smallint not null default 3 check (likelihood between 1 and 5);
alter table public.third_parties add column if not exists impact smallint not null default 3 check (impact between 1 and 5);
alter table public.third_parties add column if not exists residual_risk_score smallint not null default 6 check (residual_risk_score between 1 and 25);
alter table public.third_parties add column if not exists risk_treatment text not null default 'mitigate' check (risk_treatment in ('accept','mitigate','transfer','avoid'));
alter table public.third_parties add constraint third_parties_inherent_risk_score_check check (inherent_risk_score between 1 and 25);

create or replace function public.calculate_third_party_risk()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.inherent_risk_score := new.likelihood * new.impact;
  new.residual_risk_score := greatest(1, round(new.inherent_risk_score * ((6 - new.control_effectiveness) / 5.0))::smallint);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists calculate_third_party_risk_trigger on public.third_parties;
create trigger calculate_third_party_risk_trigger before insert or update of likelihood,impact,control_effectiveness on public.third_parties for each row execute function public.calculate_third_party_risk();

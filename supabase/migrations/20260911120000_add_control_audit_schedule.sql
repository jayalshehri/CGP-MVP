alter table public.controls
  add column if not exists audit_frequency text not null default 'annual'
    check (audit_frequency in ('monthly','quarterly','semiannual','annual','custom')),
  add column if not exists next_audit_date date,
  add column if not exists last_audit_date date;

create index if not exists controls_next_audit_date_idx
  on public.controls(next_audit_date);

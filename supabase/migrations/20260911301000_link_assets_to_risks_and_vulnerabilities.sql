-- Optional operational links: one registered asset may be referenced by risks and vulnerabilities.
alter table public.cyber_risks add column if not exists asset_id bigint references public.assets(id) on delete set null;
alter table public.vulnerabilities add column if not exists asset_id bigint references public.assets(id) on delete set null;
create index if not exists cyber_risks_asset_idx on public.cyber_risks(asset_id);
create index if not exists vulnerabilities_asset_idx on public.vulnerabilities(asset_id);
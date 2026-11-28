-- Retire temporary test notes, without cascading into unrelated tables.
set local lock_timeout = '5s';
drop table if exists public.feedback restrict;

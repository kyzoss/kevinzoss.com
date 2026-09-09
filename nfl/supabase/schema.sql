-- One row per season holds the whole pool document. Run this once in the
-- Supabase SQL editor, then paste the project URL and anon key into nfl/config.js.
--
-- The policy below lets anyone holding the anon key read and write the row.
-- That is the same trust model as the old shared spreadsheet: whoever has the
-- link can edit. Keep the repo private (or move the key server-side) if that
-- ever stops being fine.

create table if not exists public.pool_state (
  id          text primary key,          -- the season, e.g. '2026'
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.pool_state enable row level security;

drop policy if exists "pool: anon read"  on public.pool_state;
drop policy if exists "pool: anon write" on public.pool_state;
create policy "pool: anon read"  on public.pool_state for select using (true);
create policy "pool: anon write" on public.pool_state for all    using (true) with check (true);

-- Realtime pushes every save to the other phones within a second.
alter publication supabase_realtime add table public.pool_state;

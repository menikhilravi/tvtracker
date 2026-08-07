-- TV Tracker — persist TMDB detail on the shared `titles` cache.
--
-- Until now `titles` held only display fields (name/poster/year), so anything
-- needing runtime or genres had to fetch `getTitle` for every tracked title on
-- every visit — hundreds of proxy requests on a large library, and a headline
-- "time watched" that fell back to a flat ~40 min/episode guess.
--
-- These columns cache the *stable* parts of a TMDB detail response. Genuinely
-- live fields (next episode to air, watch providers) are deliberately not
-- stored — they go stale, and the app still fetches those on demand.
--
-- Idempotent — safe to run on an existing database.

alter table public.titles add column if not exists runtime            integer;   -- movies: minutes
alter table public.titles add column if not exists episode_run_time   integer;   -- tv: typical episode length
alter table public.titles add column if not exists number_of_episodes integer;   -- tv: total across the series
alter table public.titles add column if not exists genres             text[];
alter table public.titles add column if not exists networks           text[];    -- tv only
alter table public.titles add column if not exists release_date       date;      -- movies: full date, for upcoming
-- Null until the row has been filled from a real TMDB detail fetch. Rows written
-- by a list-shaped stub keep it null, which is what the sync in Settings looks
-- for. Also lets a future backfill re-sync stale rows by age.
alter table public.titles add column if not exists details_synced_at  timestamptz;

-- TV Tracker — rewatches.
--
-- Movies already supported this at the storage level: `movie_watches` has no
-- unique key, so each viewing is its own row with its own date. The app just
-- never surfaced the count.
--
-- Episodes could not be rewatched at all. `episode_watches` is unique per
-- (user, show, season, episode), and that uniqueness is load-bearing: the
-- toggle deletes by that tuple, and rating an episode upserts on it. So rather
-- than dropping the constraint, a rewatch bumps a counter on the existing row.
--
-- The trade-off, stated plainly: individual rewatch *dates* aren't kept for
-- episodes — only the first and most recent. `watched_at` keeps its existing
-- meaning (first watch), so imported history and the activity heatmap are
-- unaffected.
--
-- Idempotent — safe to run on an existing database.

alter table public.episode_watches add column if not exists play_count      integer not null default 1;
alter table public.episode_watches add column if not exists last_watched_at timestamptz;

-- `add constraint if not exists` doesn't exist in Postgres; swallow the
-- duplicate so re-running the file stays clean.
do $$ begin
  alter table public.episode_watches
    add constraint episode_watches_play_count_positive check (play_count >= 1);
exception when duplicate_object then null;
end $$;

-- Incrementing needs to read and write in one statement — a select-then-update
-- from the client can lose a count if two devices log a rewatch at once.
-- `security invoker` keeps row-level security in force, so the `auth.uid()`
-- filter here is belt-and-braces rather than the only thing protecting rows.
create or replace function public.log_episode_rewatch(
  p_show integer,
  p_season integer,
  p_episode integer
) returns void
language sql
security invoker
set search_path = public
as $$
  update public.episode_watches
     set play_count = play_count + 1,
         last_watched_at = now()
   where user_id = auth.uid()
     and tmdb_show_id = p_show
     and season_number = p_season
     and episode_number = p_episode;
$$;

grant execute on function public.log_episode_rewatch(integer, integer, integer) to authenticated;

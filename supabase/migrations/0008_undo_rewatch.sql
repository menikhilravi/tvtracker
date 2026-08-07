-- TV Tracker — undo a rewatch.
--
-- The counterpart to log_episode_rewatch (0007). Logging a rewatch is a single
-- tap, so mis-taps are easy; this takes one back off. Floors at 1 rather than 0:
-- a row in episode_watches means "I have seen this", so dropping to zero plays
-- would be a contradiction. Removing the record entirely is a delete, which the
-- history screen does directly.
--
-- last_watched_at is cleared when the count returns to 1 — we don't keep a
-- per-play log, so the previous rewatch date isn't recoverable and guessing at
-- it would be worse than showing nothing.
--
-- Idempotent — safe to run on an existing database.

create or replace function public.undo_episode_rewatch(
  p_show integer,
  p_season integer,
  p_episode integer
) returns void
language sql
security invoker
set search_path = public
as $$
  update public.episode_watches
     set play_count      = greatest(play_count - 1, 1),
         last_watched_at = case when play_count - 1 <= 1 then null else last_watched_at end
   where user_id = auth.uid()
     and tmdb_show_id = p_show
     and season_number = p_season
     and episode_number = p_episode;
$$;

grant execute on function public.undo_episode_rewatch(integer, integer, integer) to authenticated;

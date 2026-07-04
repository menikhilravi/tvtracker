-- TV Tracker — per-episode ratings.
-- One score per user per episode (1–10, same scale as `ratings`). The UI can
-- average these into a suggested overall show rating.

create table if not exists public.episode_ratings (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_show_id   integer not null,
  season_number  integer not null,
  episode_number integer not null,
  score          smallint not null check (score between 1 and 10),
  updated_at     timestamptz not null default now(),
  unique (user_id, tmdb_show_id, season_number, episode_number)
);

alter table public.episode_ratings enable row level security;

create policy "episode_ratings are private"
  on public.episode_ratings for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists episode_ratings_user_show_idx
  on public.episode_ratings (user_id, tmdb_show_id);

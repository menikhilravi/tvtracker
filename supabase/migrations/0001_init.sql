-- TV Tracker — initial schema
-- Owns the user's tracking data. TMDB is used only for metadata (cached in `titles`).
-- Every user-owned table is protected by Row-Level Security so a user only ever
-- sees their own rows.

-- ---------------------------------------------------------------------------
-- titles: a thin cache of TMDB entities we reference, so the UI can render
-- lists (watchlist, history) without re-fetching TMDB for every row.
-- Not user-scoped: it is shared reference data, readable by any authed user.
-- ---------------------------------------------------------------------------
create table if not exists public.titles (
  id           bigint generated always as identity primary key,
  tmdb_id      integer not null,
  media_type   text not null check (media_type in ('movie', 'tv')),
  name         text not null,
  poster_path  text,
  release_year integer,
  metadata     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  unique (tmdb_id, media_type)
);

alter table public.titles enable row level security;

-- Any signed-in user can read and upsert cached metadata.
create policy "titles readable by authenticated"
  on public.titles for select
  to authenticated using (true);

create policy "titles upsertable by authenticated"
  on public.titles for insert
  to authenticated with check (true);

create policy "titles updatable by authenticated"
  on public.titles for update
  to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- follows: the user's relationship to a title (watchlist / watching / etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id     integer not null,
  media_type  text not null check (media_type in ('movie', 'tv')),
  status      text not null default 'watchlist'
              check (status in ('watchlist', 'watching', 'completed', 'dropped')),
  -- Denormalized display fields so lists render without joining `titles`.
  name        text,
  poster_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

alter table public.follows enable row level security;

create policy "follows are private"
  on public.follows for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- episode_watches: one row per watched TV episode.
-- ---------------------------------------------------------------------------
create table if not exists public.episode_watches (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_show_id   integer not null,
  season_number  integer not null,
  episode_number integer not null,
  watched_at     timestamptz not null default now(),
  unique (user_id, tmdb_show_id, season_number, episode_number)
);

alter table public.episode_watches enable row level security;

create policy "episode_watches are private"
  on public.episode_watches for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- movie_watches: one row per movie watch (a movie can be watched more than once).
-- ---------------------------------------------------------------------------
create table if not exists public.movie_watches (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_movie_id integer not null,
  watched_at    timestamptz not null default now()
);

alter table public.movie_watches enable row level security;

create policy "movie_watches are private"
  on public.movie_watches for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ratings: one score (+ optional review) per user per title.
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id    integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  score      smallint not null check (score between 1 and 10),
  review     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

alter table public.ratings enable row level security;

create policy "ratings are private"
  on public.ratings for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Helpful indexes for the common lookups.
create index if not exists follows_user_status_idx on public.follows (user_id, status);
create index if not exists episode_watches_user_show_idx on public.episode_watches (user_id, tmdb_show_id);
create index if not exists movie_watches_user_idx on public.movie_watches (user_id, watched_at desc);

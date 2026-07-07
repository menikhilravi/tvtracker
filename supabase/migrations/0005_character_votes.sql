-- TV Tracker — favorite-character votes.
-- Your personal "favorite character" picks, made while reviewing a title or a
-- specific episode. A character is identified by its TMDB person (actor) id;
-- the display fields are denormalized so favorites render without a TMDB
-- round-trip. season_number/episode_number are NULL for a title-level pick and
-- set for an episode-level one.

create table if not exists public.character_votes (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id        integer not null,
  media_type     text not null check (media_type in ('movie', 'tv')),
  season_number  integer,
  episode_number integer,
  person_id      integer not null,
  character_name text,
  actor_name     text,
  profile_path   text,
  created_at     timestamptz not null default now(),
  -- Episode scope is all-or-nothing: both set (episode-level) or both null (title-level).
  constraint character_votes_episode_pair
    check ((season_number is null) = (episode_number is null))
);

alter table public.character_votes enable row level security;

create policy "character_votes are private"
  on public.character_votes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- One pick per character per scope. Two partial unique indexes because NULLs
-- compare as distinct in a plain UNIQUE, which wouldn't dedupe title-level picks.
create unique index if not exists character_votes_title_uniq
  on public.character_votes (user_id, tmdb_id, media_type, person_id)
  where season_number is null;

create unique index if not exists character_votes_episode_uniq
  on public.character_votes (user_id, tmdb_id, season_number, episode_number, person_id)
  where season_number is not null;

create index if not exists character_votes_user_title_idx
  on public.character_votes (user_id, tmdb_id, media_type);

-- TV Tracker — custom lists.
--
-- `follows.status` is a fixed four-value enum (watchlist / watching / completed
-- / dropped), which answers "where am I with this" but not "what is this to me".
-- Lists are the user's own grouping: comfort shows, movie night, watch with Dad.
--
-- A title can sit in any number of lists, and being in a list says nothing about
-- whether it's tracked — you can shortlist something you haven't added.
--
-- Idempotent — safe to run on an existing database.

create table if not exists public.lists (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  -- Optional emoji so lists are recognisable at a glance, matching how the rest
  -- of the app leans on them for section identity.
  emoji      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Two lists with the same name would be indistinguishable in the picker.
  unique (user_id, name)
);

alter table public.lists enable row level security;

create policy "lists are private"
  on public.lists for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.list_items (
  id          bigint generated always as identity primary key,
  list_id     bigint not null references public.lists(id) on delete cascade,
  -- Denormalized alongside list_id so the RLS policy is a plain column check
  -- rather than a subquery against `lists` on every read.
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tmdb_id     integer not null,
  media_type  text not null check (media_type in ('movie', 'tv')),
  -- Display fields, same pattern as `follows`: list views render without a join.
  name        text,
  poster_path text,
  added_at    timestamptz not null default now(),
  unique (list_id, tmdb_id, media_type)
);

alter table public.list_items enable row level security;

create policy "list_items are private"
  on public.list_items for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists list_items_list_idx on public.list_items (list_id);
create index if not exists list_items_user_title_idx on public.list_items (user_id, tmdb_id, media_type);

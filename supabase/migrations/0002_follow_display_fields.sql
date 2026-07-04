-- Add denormalized display fields to `follows` so Home can render watchlist /
-- watching lists without joining the `titles` cache. Idempotent — safe to run
-- on an existing database.

alter table public.follows add column if not exists name text;
alter table public.follows add column if not exists poster_path text;

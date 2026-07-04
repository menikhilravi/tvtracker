-- TV Tracker — Web Push subscriptions for episode reminders.
-- One row per browser/device push endpoint the user has opted in from.
-- The send-reminders Edge Function reads these (with the service role) to push
-- notifications; each user can only see/manage their own via RLS.

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  -- The push endpoint uniquely identifies a subscription; re-subscribing from
  -- the same device upserts rather than duplicating.
  unique (endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions are private"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

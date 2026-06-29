-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query)

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  product_id text not null,
  product_name text not null,
  amount_cents integer not null,
  stripe_session_id text unique not null,
  status text not null default 'pending', -- 'pending' | 'paid'
  created_at timestamptz default now()
);

alter table purchases enable row level security;

-- Logged-in users can see their own purchases (used by the "My Account" page)
create policy "Users can view own purchases"
  on purchases for select
  using (auth.uid() = user_id);

-- No insert/update policy for anon/authenticated roles on purpose:
-- only the server (using the service role key) is allowed to write rows.

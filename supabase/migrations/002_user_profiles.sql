-- ============================================================
-- Userplug — User Profiles & Approval System
-- Run this in Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================

create table if not exists user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'user',   -- 'user' | 'admin'
  approved    boolean not null default false,
  created_at  timestamptz default now()
);

alter table user_profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own" on user_profiles
  for select to authenticated
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "profiles_select_admin" on user_profiles
  for select to authenticated
  using (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can update any profile (approve, change role)
create policy "profiles_update_admin" on user_profiles
  for update to authenticated
  using (
    exists (
      select 1 from user_profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (true);

-- Auto-create profile on sign-up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, role, approved)
  values (
    new.id,
    new.email,
    'user',
    false  -- requires admin approval
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- Make yourself admin — replace with your actual email
-- Run once after creating your account:
-- ============================================================
-- update user_profiles set role = 'admin', approved = true
-- where email = 'your@email.com';

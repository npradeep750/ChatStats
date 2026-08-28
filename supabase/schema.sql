-- Run this in Supabase Dashboard → SQL Editor.
create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled group chat',
  source_format text not null,
  message_count integer not null default 0,
  participant_count integer not null default 0,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_reports_user_created_idx
  on public.chat_reports (user_id, created_at desc);

alter table public.chat_reports enable row level security;

grant select, insert, update, delete on public.chat_reports to authenticated;

drop policy if exists "Users can view their own reports" on public.chat_reports;
create policy "Users can view their own reports"
  on public.chat_reports for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save their own reports" on public.chat_reports;
create policy "Users can save their own reports"
  on public.chat_reports for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own reports" on public.chat_reports;
create policy "Users can update their own reports"
  on public.chat_reports for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own reports" on public.chat_reports;
create policy "Users can delete their own reports"
  on public.chat_reports for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null default '',
  avatar_url text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

grant select, insert, update on public.user_profiles to authenticated;

drop policy if exists "Users can view their own profile" on public.user_profiles;
create policy "Users can view their own profile"
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy "Users can insert their own profile"
  on public.user_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Profile picture storage bucket. Each user's images live under avatars/<user_id>/.
-- The bucket is public so the picture can render directly in an <img> tag.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Users can view their own avatar" on storage.objects;
create policy "Users can view their own avatar"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

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

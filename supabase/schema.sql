create table if not exists public.student_records (
  owner_id uuid not null references auth.users (id) on delete cascade,
  student_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, student_id)
);

alter table public.student_records enable row level security;

grant select, insert, update, delete on public.student_records to authenticated;

drop policy if exists "Owners can read their student records" on public.student_records;
create policy "Owners can read their student records"
  on public.student_records for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their student records" on public.student_records;
create policy "Owners can create their student records"
  on public.student_records for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their student records" on public.student_records;
create policy "Owners can update their student records"
  on public.student_records for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their student records" on public.student_records;
create policy "Owners can delete their student records"
  on public.student_records for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create index if not exists student_records_owner_updated_idx
  on public.student_records (owner_id, updated_at desc);

create or replace function public.set_student_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_records_updated_at on public.student_records;
create trigger student_records_updated_at
  before update on public.student_records
  for each row execute function public.set_student_records_updated_at();

-- New signups join every project automatically, as Tester.
--
-- Until now a new account got a profile but no project_members row, so RLS hid
-- everything: the person saw an empty app, and an admin had no sign they had
-- joined. Now they appear in Project Members straight away and can work.
--
-- Worth knowing: email confirmation is off on this project, so signups are
-- unverified. Combined with this trigger, anyone who reaches the signup page
-- gets write access to the test repository. Gate signup by email domain if
-- that becomes a concern.


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;

  -- Join every existing project so the account is visible to admins
  -- immediately and the person can start work without waiting for approval.
  insert into public.project_members (project_id, user_id, role)
  select p.id, new.id, 'tester'
  from public.projects p
  on conflict (project_id, user_id) do nothing;

  return new;
end;
$function$;

-- Backfill: anyone who already signed up but never got added.
insert into project_members (project_id, user_id, role)
select p.id, pr.id, 'tester'
from profiles pr
cross join projects p
where not exists (
  select 1 from project_members pm where pm.project_id = p.id and pm.user_id = pr.id
)
on conflict (project_id, user_id) do nothing;

select pr.name, pr.email, p.name as project, pm.role
from profiles pr
left join project_members pm on pm.user_id = pr.id
left join projects p on p.id = pm.project_id
order by pr.created_at;

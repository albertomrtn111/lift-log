-- Prueba del alta de una sala, con los mismos pasos que hace la web.
-- Requiere 20261105200000_owner_invitations.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_admin uuid; v_owner uuid; v_space uuid; v_invitation uuid;
begin
  select cm.user_id into v_admin from public.coach_memberships cm where cm.role = 'owner' and cm.status = 'active' limit 1;
  select p.id into v_owner from public.profiles p where p.id not in (select user_id from public.coach_memberships) limit 1;

  insert into public.coaches (name, created_by, subscription_tier, billing_cycle, max_active_clients, onboarding_state)
    values ('Rollback sala', v_admin, 'studio', 'monthly', 250, '{"studio_pending": true}')
    returning id into v_space;
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle)
    values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_invitations (coach_id, email, role, invited_by)
    values (v_space, 'rollback@example.com', 'owner', v_admin) returning id into v_invitation;

  if not public.coach_has_feature(v_space, 'studio_mode') or not public.coach_has_feature(v_space, 'branding')
     or not public.coach_has_feature(v_space, 'team') then
    raise exception 'una sala nueva tiene Studio';
  end if;
  if (select count(*) from public.locations where coach_id = v_space) <> 1 then raise exception 'nace con su sede'; end if;

  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_owner, 'owner', 'active');
  begin
    insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_admin, 'owner', 'active');
    raise exception 'un espacio solo tiene un propietario';
  exception when unique_violation then null;
  end;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if public.active_coach_id() <> v_space then raise exception 'el propietario entra en su sala'; end if;
  insert into public.workspace_branding (coach_id, display_name) values (v_space, 'Rollback');
  insert into public.workspace_exercises (coach_id, catalog_exercise_id)
    select v_space, id from public.exercise_catalog where block_key = 'biceps';
  update public.locations set agenda_mode = 'own' where coach_id = v_space;
  if (select agenda_mode from public.locations where coach_id = v_space) <> 'own' then raise exception 'guarda la agenda'; end if;
end;
$tests$;
rollback;

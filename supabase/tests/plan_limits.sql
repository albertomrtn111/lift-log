-- Prueba de NXT-129 (plan de cada espacio y sus límites) con espacios temporales.
-- Requiere 20261120132000_planes_y_limites.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_owner uuid := gen_random_uuid();
  v_mate uuid := gen_random_uuid();
  v_athlete uuid := gen_random_uuid();
  v_space uuid;
  v_comped uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_client uuid;
  v_hint text;
  v_failed boolean;
  v_sql text;
begin
  insert into auth.users (id, email)
    select u, u::text || '@prueba.invalid' from unnest(array[v_owner, v_mate, v_athlete]) u;
  insert into public.profiles (id) values (v_owner), (v_mate), (v_athlete) on conflict (id) do nothing;

  -- El alta de un coach crea su prueba de 30 días con el plan elegido.
  v_space := public.create_coach_workspace(v_owner, 'Rollback límites', 'starter', 'monthly', 20);
  if not exists (
    select 1 from public.coach_subscriptions s
    where s.coach_id = v_space and s.status = 'trialing' and s.plan = 'starter'
      and s.trial_ends_at > now() + interval '29 days'
  ) then
    raise exception 'el alta crea la prueba';
  end if;
  if public.coach_effective_plan(v_space) is distinct from 'starter' then raise exception 'la prueba da su plan'; end if;
  if public.coach_feature_limit(v_space, 'max_active_clients') is distinct from 20 then raise exception 'starter: 20 atletas'; end if;

  -- Caben 20 atletas activos; el 21 no. La atleta de ejemplo no cuenta.
  insert into public.clients (coach_id, full_name, status)
    select v_space, 'Atleta ' || n, 'active' from generate_series(1, 20) n;
  insert into public.clients (coach_id, full_name, status, is_sample) values (v_space, 'Lucía', 'active', true);
  v_hint := null;
  begin
    insert into public.clients (coach_id, full_name, status) values (v_space, 'Atleta 21', 'active');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'athlete_limit' then raise exception 'el atleta 21 se rechaza (%)', v_hint; end if;

  -- De baja sí se puede guardar; reactivarlo con el cupo lleno, no.
  insert into public.clients (coach_id, full_name, status) values (v_space, 'De baja', 'inactive') returning id into v_client;
  v_hint := null;
  begin
    update public.clients set status = 'active' where id = v_client;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'athlete_limit' then raise exception 'reactivar con el cupo lleno se rechaza'; end if;

  -- Editar a un atleta que ya está activo no es un alta; dar de baja a uno deja sitio.
  update public.clients set status = 'active', full_name = 'Atleta 1 editado' where coach_id = v_space and full_name = 'Atleta 1';
  update public.clients set status = 'inactive' where coach_id = v_space and full_name = 'Atleta 2';
  update public.clients set status = 'active' where id = v_client;

  -- Miembros: Starter admite 1 (el propietario).
  v_hint := null;
  begin
    insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_mate, 'coach', 'active');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'member_limit' then raise exception 'el segundo miembro se rechaza (%)', v_hint; end if;

  -- Un atleta con acceso (rol client) y un miembro de baja no ocupan plaza.
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_athlete, 'client', 'active');
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_mate, 'coach', 'inactive');
  v_hint := null;
  begin
    update public.coach_memberships set status = 'active' where coach_id = v_space and user_id = v_mate;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'member_limit' then raise exception 'reactivar a un miembro de más se rechaza'; end if;

  -- Aceptar una invitación (upsert, como /unirse) tampoco se salta el límite.
  v_hint := null;
  begin
    insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_athlete, 'coach', 'active')
      on conflict (coach_id, user_id) do update set role = excluded.role, status = excluded.status;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'member_limit' then raise exception 'aceptar una invitación respeta el límite'; end if;

  -- Una excepción del espacio amplía el límite.
  insert into public.coach_feature_overrides (coach_id, feature, enabled, limit_value, reason)
    values (v_space, 'max_members', true, 2, 'prueba');
  update public.coach_memberships set status = 'active' where coach_id = v_space and user_id = v_mate;
  -- Cambiar de rol a quien ya está en el equipo no ocupa otra plaza.
  update public.coach_memberships set role = 'admin' where coach_id = v_space and user_id = v_mate;

  -- Desde la sesión del propietario: el plan no se cambia; el resto del espacio, sí.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  foreach v_sql in array array[
    'update public.coaches set subscription_tier = ''studio'' where id = $1',
    'update public.coaches set billing_cycle = ''yearly'' where id = $1',
    'update public.coaches set max_active_clients = 1000 where id = $1',
    'update public.coaches set created_by = null where id = $1'
  ] loop
    v_failed := false;
    begin
      execute v_sql using v_space;
    exception when insufficient_privilege then v_failed := true;
    end;
    if not v_failed then raise exception 'el propietario no puede: %', v_sql; end if;
  end loop;
  update public.coaches set name = 'Rollback límites editado', timezone = 'Europe/Madrid' where id = v_space;
  if not found then raise exception 'el propietario sigue editando su espacio'; end if;
  v_failed := false;
  begin
    insert into public.coaches (name, created_by, subscription_tier) values ('Rollback ajeno', v_owner, 'studio');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'desde la sesión no se crean espacios'; end if;
  execute 'reset role';
  if (select subscription_tier from public.coaches where id = v_space) <> 'starter' then raise exception 'el plan sigue igual'; end if;

  -- Cortesía Studio (como ClubØ): todas las funciones, sin límite de atletas ni de miembros.
  insert into public.coaches (id, name, subscription_tier) values (v_comped, 'Rollback cortesía', 'studio'), (v_other, 'Rollback cancelada', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values
    (v_comped, 'comped', 'studio', 'monthly'), (v_other, 'canceled', 'studio', 'monthly');
  if not public.coach_has_feature(v_comped, 'studio_mode') then raise exception 'la cortesía tiene sala'; end if;
  if public.coach_feature_limit(v_comped, 'max_active_clients') is not null then raise exception 'cortesía sin límite de atletas'; end if;
  if public.coach_feature_limit(v_comped, 'max_members') is not null then raise exception 'studio sin límite de miembros'; end if;

  -- Cancelada: sin funciones, sin altas.
  if public.coach_has_feature(v_other, 'studio_mode') then raise exception 'cancelada no tiene sala'; end if;
  if public.coach_feature_limit(v_other, 'max_active_clients') is distinct from 0 then raise exception 'cancelada: 0 atletas'; end if;
  v_hint := null;
  begin
    insert into public.clients (coach_id, full_name, status) values (v_other, 'Ana', 'active');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'subscription_inactive' then raise exception 'cancelada no da de alta (%)', v_hint; end if;

  -- Prueba caducada: sin funciones; con suscripción en Stripe manda Stripe.
  update public.coach_subscriptions set status = 'trialing', trial_ends_at = now() - interval '1 day' where coach_id = v_other;
  if public.coach_has_feature(v_other, 'studio_mode') then raise exception 'prueba caducada no tiene sala'; end if;
  update public.coach_subscriptions set stripe_subscription_id = 'sub_rollback_' || v_other where coach_id = v_other;
  if not public.coach_has_feature(v_other, 'studio_mode') then raise exception 'con Stripe manda Stripe'; end if;
  update public.coach_subscriptions set status = 'past_due' where coach_id = v_other;
  if not public.coach_has_feature(v_other, 'studio_mode') then raise exception 'cobro pendiente no corta'; end if;
  update public.coach_subscriptions set status = 'unpaid' where coach_id = v_other;
  if public.coach_has_feature(v_other, 'studio_mode') then raise exception 'impagada no tiene sala'; end if;

  -- Los espacios reales: todos con suscripción y las cortesías Studio con sala y sin límite de atletas.
  if exists (select 1 from public.coaches c where not exists (select 1 from public.coach_subscriptions s where s.coach_id = c.id)) then
    raise exception 'todo espacio tiene suscripción';
  end if;
  if exists (
    select 1 from public.coach_subscriptions s
    where s.status = 'comped' and s.plan = 'studio'
      and (not public.coach_has_feature(s.coach_id, 'studio_mode')
           or public.coach_feature_limit(s.coach_id, 'max_active_clients') is not null)
  ) then
    raise exception 'una cortesía Studio ha perdido algo';
  end if;

  -- Permisos
  if has_table_privilege('authenticated', 'public.coaches', 'insert') then raise exception 'authenticated no crea espacios'; end if;
  if not has_table_privilege('authenticated', 'public.coaches', 'update') then raise exception 'authenticated sigue editando'; end if;
  if has_function_privilege('authenticated', 'public.coach_effective_plan(uuid)', 'execute') then raise exception 'plan efectivo solo servidor'; end if;
  if has_function_privilege('anon', 'public.coach_has_feature(uuid, text)', 'execute') then raise exception 'anon no debe ejecutarla'; end if;
end;
$tests$;
rollback;
select 'ok' as plan_limits,
  not exists(select 1 from public.coaches where name like 'Rollback límites%') as sin_datos_de_prueba;

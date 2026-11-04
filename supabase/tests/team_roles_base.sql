-- Prueba de la base de roles con un espacio temporal y una sesión simulada por usuario.
-- Requiere 20261104110000_team_roles_base.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_coach_a uuid := gen_random_uuid();
  v_coach_b uuid := gen_random_uuid();
  v_reception uuid := gen_random_uuid();
  v_athlete uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_user uuid;
  v_failed boolean;
begin
  insert into auth.users (id, email)
    select u, u::text || '@prueba.invalid'
    from unnest(array[v_owner, v_admin, v_coach_a, v_coach_b, v_reception, v_athlete, v_stranger]) u;
  insert into public.profiles (id) values (v_owner), (v_admin), (v_coach_a), (v_coach_b), (v_reception), (v_athlete), (v_stranger)
    on conflict (id) do nothing;

  insert into public.coaches (id, name, created_by) values (v_space, 'Rollback roles', v_owner);
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_owner, 'owner', 'active'),
    (v_space, v_admin, 'admin', 'active'),
    (v_space, v_coach_a, 'coach', 'active'),
    (v_space, v_coach_b, 'coach', 'active'),
    (v_space, v_reception, 'reception', 'active');
  insert into public.clients (id, coach_id, auth_user_id, full_name, status) values
    (v_client, v_space, v_athlete, 'Atleta rollback', 'active'),
    (v_other, v_space, null, 'Otro rollback', 'active');
  insert into public.client_professionals (client_id, user_id) values (v_client, v_coach_a);

  -- Espacio en «todos»: todo el equipo accede, y recepción no ve entrenamiento.
  foreach v_user in array array[v_owner, v_admin, v_coach_a, v_coach_b, v_reception] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    if not public.can_access_client(v_client) then raise exception 'todos: % debería acceder', v_user; end if;
    if public.can_see_training(v_client) <> (v_user <> v_reception) then raise exception 'todos: can_see_training mal para %', v_user; end if;
    if public.is_client_self(v_client) then raise exception 'is_client_self mal para %', v_user; end if;
    if public.is_platform_admin() then raise exception 'is_platform_admin mal para %', v_user; end if;
  end loop;

  -- Atleta y ajeno no entran por estas funciones.
  foreach v_user in array array[v_athlete, v_stranger] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    if public.can_access_client(v_client) or public.can_see_training(v_client) then raise exception 'acceso indebido de %', v_user; end if;
  end loop;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  if not public.is_client_self(v_client) then raise exception 'el atleta debería ser él mismo'; end if;
  if public.is_client_self(v_other) then raise exception 'el atleta no es otro cliente'; end if;

  -- Espacio en «solo asignados».
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  foreach v_user in array array[v_owner, v_admin, v_coach_a, v_reception] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    if not public.can_access_client(v_client) then raise exception 'asignados: % debería acceder', v_user; end if;
  end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coach_b, 'role', 'authenticated')::text, true);
  if public.can_access_client(v_client) then raise exception 'asignados: profesional sin asignar no debería acceder'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coach_a, 'role', 'authenticated')::text, true);
  if public.can_access_client(v_other) then raise exception 'asignados: no asignado a este cliente'; end if;

  -- Restricciones de la tabla de miembros.
  v_failed := false;
  begin
    update public.coach_memberships set role = 'jefe' where coach_id = v_space and user_id = v_admin;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'debería rechazar un rol desconocido'; end if;

  v_failed := false;
  begin
    update public.coach_memberships set role = 'owner' where coach_id = v_space and user_id = v_admin;
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'debería rechazar un segundo propietario'; end if;

  -- Sin sesión no se pueden ejecutar las funciones nuevas.
  if has_function_privilege('anon', 'public.can_access_client(uuid)', 'execute') then raise exception 'anon no debe ejecutarla'; end if;
  if has_function_privilege('anon', 'public.can_see_training(uuid)', 'execute') then raise exception 'anon no debe ejecutarla'; end if;

  -- Los espacios existentes empiezan en «todos».
  if exists (select 1 from public.coaches where client_visibility <> 'all' and id <> v_space) then
    raise exception 'los espacios existentes deben quedar en todos';
  end if;
end;
$tests$;
rollback;
select 'ok' as team_roles_base,
  not exists(select 1 from public.coaches where name = 'Rollback roles') as sin_datos_de_prueba;

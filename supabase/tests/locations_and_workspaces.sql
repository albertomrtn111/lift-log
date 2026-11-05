-- Prueba de sedes y selector de espacio con un espacio temporal.
-- Requiere 20261105190000_locations_and_workspaces.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_owner uuid; v_space uuid; v_other uuid := gen_random_uuid(); v_foreign uuid := gen_random_uuid();
  v_loc uuid; v_n integer;
begin
  select cm.user_id, cm.coach_id into v_owner, v_space
  from public.coach_memberships cm where cm.role = 'owner' and cm.status = 'active' limit 1;

  if exists (select 1 from public.coaches c where not exists (select 1 from public.locations l where l.coach_id = c.id)) then
    raise exception 'todo espacio necesita sede';
  end if;

  insert into public.coaches (id, name, subscription_tier) values (v_other, 'Rollback sala', 'starter');
  insert into public.coaches (id, name, subscription_tier) values (v_foreign, 'Rollback ajeno', 'starter');
  if (select count(*) from public.locations where coach_id = v_other) <> 1 then raise exception 'un espacio nuevo nace con sede'; end if;
  select id into v_loc from public.locations where coach_id = v_foreign;

  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_other, v_owner, 'coach', 'active');
  update public.profiles set last_coach_id = null where id = v_owner;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  if public.active_coach_id() <> v_space then raise exception 'sin elegir, el primero'; end if;
  if (select count(*) from public.my_workspaces()) <> 2 then raise exception 'lista los dos espacios'; end if;

  update public.profiles set last_coach_id = v_other where id = v_owner;
  if public.active_coach_id() <> v_other then raise exception 'recuerda el elegido'; end if;
  if (select name from public.my_workspaces() where is_active) <> 'Rollback sala' then raise exception 'marca el activo'; end if;

  -- Elegir un espacio ajeno no da acceso a él.
  update public.profiles set last_coach_id = v_foreign where id = v_owner;
  if public.active_coach_id() = v_foreign then raise exception 'un espacio ajeno no cuenta'; end if;
  if exists (select 1 from public.locations where id = v_loc) then raise exception 'no se leen sedes ajenas'; end if;

  -- Dejar de ser miembro devuelve al otro espacio.
  execute 'reset role';
  update public.coach_memberships set status = 'inactive' where coach_id = v_other and user_id = v_owner;
  update public.profiles set last_coach_id = v_other where id = v_owner;
  execute 'set local role authenticated';
  if public.active_coach_id() <> v_space then raise exception 'una baja devuelve al otro espacio'; end if;

  -- Un profesional no cambia sedes.
  execute 'reset role';
  update public.coach_memberships set status = 'active' where coach_id = v_other and user_id = v_owner;
  execute 'set local role authenticated';
  update public.locations set name = 'No' where coach_id = v_other;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'un profesional no cambia la sede'; end if;

  if has_function_privilege('anon', 'public.active_coach_id()', 'execute') then raise exception 'anon no'; end if;
end;
$tests$;
rollback;

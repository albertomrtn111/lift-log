-- Prueba del grupos Comunicación y Herramientas sobre las filas reales del primer espacio, con miembros
-- temporales y una sesión simulada por usuario. Requiere
-- 20261105120000_team_roles_communication_group.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
create temp table _visible (tabla text, quien text, filas bigint) on commit drop;
grant insert, select on _visible to authenticated;
do $tests$
declare
  v_space uuid;
  v_owner uuid;
  v_coach uuid := gen_random_uuid();
  v_reception uuid := gen_random_uuid();
  v_member_client uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_people jsonb;
  v_who text;
  v_table text;
  v_total bigint;
  v_owner_rows bigint;
  v_rows bigint;
  v_tables text[] := array['messages','nextia_chat_messages','coach_ai_profiles','calendar_notes','coach_tasks','coach_notifications'];
  v_client_tables text[] := v_tables;
begin
  select coach_id, user_id into v_space, v_owner from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_space is null then raise exception 'Se necesita un espacio con propietario.'; end if;

  insert into auth.users (id, email)
    select u, u::text || '@prueba.invalid' from unnest(array[v_coach, v_reception, v_member_client, v_stranger]) u;
  insert into public.profiles (id) values (v_coach), (v_reception), (v_member_client), (v_stranger)
    on conflict (id) do nothing;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_coach, 'coach', 'active'),
    (v_space, v_reception, 'reception', 'active'),
    (v_space, v_member_client, 'client', 'active');

  v_people := jsonb_build_object('owner', v_owner, 'coach', v_coach, 'reception', v_reception,
    'member_client', v_member_client, 'stranger', v_stranger);

  for v_who in select jsonb_object_keys(v_people) loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_people ->> v_who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach v_table in array v_tables loop
      execute format('insert into _visible select %L, %L, count(*) from public.%I', v_table, v_who, v_table);
    end loop;
    execute 'reset role';
  end loop;

  foreach v_table in array v_tables loop
    execute format('select count(*) from public.%I', v_table) into v_total;
    select filas into v_owner_rows from _visible where tabla = v_table and quien = 'owner';
    if v_total > 0 and v_owner_rows = 0 then
      raise exception 'el propietario debería ver filas en %', v_table;
    end if;
    select filas into v_rows from _visible where tabla = v_table and quien = 'coach';
    if v_rows <> v_owner_rows then raise exception 'el profesional debería ver lo mismo en %', v_table; end if;
    select filas into v_rows from _visible where tabla = v_table and quien = 'member_client';
    if v_rows <> 0 then raise exception 'una membresía client no debería ver % (%)', v_table, v_rows; end if;
    select filas into v_rows from _visible where tabla = v_table and quien = 'stranger';
    if v_rows <> 0 then raise exception 'un ajeno no debería ver % (%)', v_table, v_rows; end if;
  end loop;

  foreach v_table in array v_client_tables loop
    select filas into v_rows from _visible where tabla = v_table and quien = 'reception';
    if v_rows <> 0 then raise exception 'recepción no debería ver % (%)', v_table, v_rows; end if;
  end loop;

  -- Una membresía client tampoco puede borrar.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member_client, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.messages;
  get diagnostics v_rows = row_count;
  execute 'reset role';
  if v_rows <> 0 then raise exception 'una membresía client no debería borrar messages'; end if;

  -- Con «solo asignados», un profesional sin asignar deja de ver los datos de clientes.
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_rows from public.messages;
  execute 'reset role';
  if v_rows <> 0 then raise exception 'sin asignar no debería ver mensajes'; end if;
end;
$tests$;
select json_object_agg(tabla || ':' || quien, filas) as visibles from _visible;
rollback;

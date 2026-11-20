-- Prueba de las comidas extra del atleta (NXT-154), con espacios temporales.
-- Requiere 20261120133000_nutrition_meal_slots.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid(); v_pro uuid := gen_random_uuid(); v_athlete uuid := gen_random_uuid();
  v_mate uuid := gen_random_uuid(); v_outsider uuid := gen_random_uuid();
  v_client uuid; v_mate_client uuid; v_slot uuid; v_n integer;
begin
  insert into auth.users (id, email, aud, role)
    select u, u || '@example.com', 'authenticated', 'authenticated' from unnest(array[v_owner, v_pro, v_athlete, v_mate, v_outsider]) u;
  insert into public.profiles (id, email)
    select u, u || '@example.com' from unnest(array[v_owner, v_pro, v_athlete, v_mate, v_outsider]) u on conflict (id) do nothing;
  -- El espacio solo enseña a cada profesional sus atletas asignados.
  insert into public.coaches (id, name, client_visibility) values (v_space, 'Rollback comidas', 'assigned'), (v_other, 'Rollback otro', 'all');
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_owner, 'owner', 'active'), (v_space, v_pro, 'coach', 'active'), (v_other, v_outsider, 'owner', 'active');
  insert into public.clients (coach_id, full_name, email, user_id, auth_user_id, status)
    values (v_space, 'Ana', 'ana@example.com', v_athlete, v_athlete, 'active') returning id into v_client;
  insert into public.clients (coach_id, full_name, email, user_id, auth_user_id, status)
    values (v_space, 'Luis', 'luis@example.com', v_mate, v_mate, 'active') returning id into v_mate_client;

  execute 'set local role authenticated';

  -- El atleta crea, ve, cambia y quita las suyas.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  insert into public.nutrition_meal_slots (client_id, label, order_index, effective_from)
    values (v_client, 'Pre-entreno', 4, current_date) returning id into v_slot;
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 1 then raise exception 'el atleta ve sus comidas: %', v_n; end if;
  begin
    insert into public.nutrition_meal_slots (client_id, label) values (v_client, '  pre-ENTRENO ');
    raise exception 'nombre repetido';
  exception when unique_violation then null;
  end;
  begin
    insert into public.nutrition_meal_slots (client_id, label) values (v_client, '   ');
    raise exception 'nombre vacío';
  exception when check_violation then null;
  end;
  begin
    insert into public.nutrition_meal_slots (client_id, label) values (v_mate_client, 'Ajena');
    raise exception 'escribe en otro atleta';
  exception when insufficient_privilege then null;
  end;
  update public.nutrition_meal_slots set deleted_from = current_date where id = v_slot;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'quitar la suya'; end if;
  begin
    update public.nutrition_meal_slots set deleted_from = current_date - 1 where id = v_slot;
    raise exception 'quitada antes de empezar';
  exception when check_violation then null;
  end;
  -- Quitada, el nombre vuelve a estar libre.
  insert into public.nutrition_meal_slots (client_id, label, order_index) values (v_client, 'Pre-entreno', 5);

  -- Otro atleta del mismo espacio no ve ni toca las de Ana.
  perform set_config('request.jwt.claims', json_build_object('sub', v_mate, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 0 then raise exception 'otro atleta ve %', v_n; end if;
  update public.nutrition_meal_slots set label = 'Cambiada' where client_id = v_client;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'otro atleta cambia %', v_n; end if;

  -- El propietario las lee, pero no las escribe.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 2 then raise exception 'el propietario ve %', v_n; end if;
  update public.nutrition_meal_slots set label = 'Cambiada' where client_id = v_client;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el equipo cambia %', v_n; end if;
  begin
    insert into public.nutrition_meal_slots (client_id, label) values (v_client, 'Del coach');
    raise exception 'el equipo crea';
  exception when insufficient_privilege then null;
  end;

  -- El profesional, solo si Ana es suya; otro espacio, nunca.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 0 then raise exception 'profesional sin asignar ve %', v_n; end if;
  execute 'reset role';
  insert into public.client_professionals (client_id, user_id) values (v_client, v_pro);
  execute 'set local role authenticated';
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 2 then raise exception 'profesional asignado ve %', v_n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 0 then raise exception 'otro espacio ve %', v_n; end if;

  -- Un atleta dado de baja deja de verlas.
  execute 'reset role';
  update public.clients set status = 'inactive' where id = v_client;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.nutrition_meal_slots where client_id = v_client;
  if v_n <> 0 then raise exception 'atleta inactivo ve %', v_n; end if;

  execute 'reset role';
  raise notice 'nutrition_meal_slots: todo correcto';
end;
$tests$;
rollback;

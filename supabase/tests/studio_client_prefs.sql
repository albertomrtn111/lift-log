-- Prueba de las preferencias por cliente con un espacio temporal.
-- Requiere 20261106010000_studio_client_prefs.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_outsider uuid; v_client uuid; v_a uuid; v_block text; v_block2 text;
  v_session public.studio_sessions; v_section public.studio_session_sections; v_n integer; v_recent text[];
begin
  select (array_agg(id))[1], (array_agg(id))[2] into v_pro, v_outsider
  from (select p.id from public.profiles p order by p.id limit 2) x;
  select id, block_key into v_a, v_block from public.exercise_catalog where is_active and block_key is not null order by id limit 1;
  select key into v_block2 from public.exercise_blocks where key <> v_block limit 1;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values (v_space, v_pro, 'coach', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Rollback atleta', 'rollback@example.com') returning id into v_client;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  perform public.studio_set_block_collapsed(v_client, v_block, true);
  perform public.studio_set_block_order(v_client, array[v_block2, v_block]);
  if not (select collapsed from public.client_block_prefs where client_id = v_client and block_key = v_block) then
    raise exception 'guardar el orden no toca el plegado';
  end if;
  if (select sort_order from public.client_block_prefs where client_id = v_client and block_key = v_block2) <> 10 then
    raise exception 'el orden se guarda por cliente';
  end if;

  v_session := public.studio_create_session(v_client, current_date);
  perform public.studio_add_items(v_session.id, jsonb_build_array(jsonb_build_object('catalog_exercise_id', v_a, 'section_title', 'Bloque 1')));
  v_recent := public.studio_recent_blocks(v_space);
  if not (v_block = any (v_recent)) then raise exception 'el bloque usado sale como reciente'; end if;

  select * into v_section from public.studio_session_sections where session_id = v_session.id;
  perform public.studio_set_section_parent(v_section.id, ' FUERZA ');
  if (select parent_title from public.studio_session_sections where id = v_section.id) <> 'FUERZA' then raise exception 'título superior'; end if;
  perform public.studio_set_section_parent(v_section.id, '');
  if (select parent_title from public.studio_session_sections where id = v_section.id) is not null then raise exception 'se puede quitar'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.client_block_prefs where client_id = v_client;
  if v_n <> 0 then raise exception 'de fuera no se ve'; end if;
  begin
    perform public.studio_set_block_collapsed(v_client, v_block, false);
    raise exception 'de fuera no se cambia';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_recent_blocks(v_space);
    raise exception 'de fuera no se consulta';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_set_section_parent(v_section.id, 'No');
    raise exception 'de fuera no se toca';
  exception when insufficient_privilege then null;
  end;

  execute 'reset role';
  raise notice 'studio_client_prefs OK';
end;
$tests$;
rollback;

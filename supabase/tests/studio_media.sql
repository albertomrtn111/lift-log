-- Prueba de los medios de sala con un espacio temporal.
-- Requiere 20261106090000_studio_media.sql y 20261106091000_studio_media_access.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_other_space uuid := gen_random_uuid(); v_pro uuid; v_colleague uuid; v_unassigned uuid; v_reception uuid;
  v_client uuid; v_a uuid; v_media public.exercise_media; v_image public.exercise_media; v_session public.studio_sessions; v_item public.studio_session_items; v_n integer;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4] into v_pro, v_colleague, v_unassigned, v_reception
  from (select p.id from public.profiles p order by p.id limit 4) x;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active'), (v_space, v_unassigned, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_client;
  select id into v_a from public.exercise_catalog where is_active limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Enlace de la sala y enlace del cliente.
  v_media := public.studio_add_exercise_media(v_space, v_a, null, 'youtube', 'https://youtu.be/abc', null, ' Técnica ');
  if v_media.title <> 'Técnica' then raise exception 'título'; end if;
  perform public.studio_add_exercise_media(v_space, v_a, v_client, 'link', 'https://example.com/x', null, null);

  -- Solo enlaces seguros.
  begin
    perform public.studio_add_exercise_media(v_space, v_a, null, 'link', 'javascript:alert(1)', null, null);
    raise exception 'enlace peligroso';
  exception when check_violation then null;
  end;

  -- Sin consentimiento no entra una foto de un cliente, ni se puede abrir su carpeta.
  if public.studio_can_use_media(v_space, v_client) then raise exception 'carpeta sin consentimiento'; end if;
  if not public.studio_can_use_media(v_space, v_space) then raise exception 'carpeta de la sala'; end if;
  begin
    perform public.studio_add_exercise_media(v_space, v_a, v_client, 'image', null, 'studio-media/' || v_space || '/' || v_client || '/f.webp', null);
    raise exception 'sin consentimiento no';
  exception when invalid_parameter_value then null;
  end;
  perform public.studio_set_image_consent(v_client, true);
  if not public.studio_can_use_media(v_space, v_client) then raise exception 'carpeta con consentimiento'; end if;
  v_image := public.studio_add_exercise_media(v_space, v_a, v_client, 'image', null, 'studio-media/' || v_space || '/' || v_client || '/f.webp', null);

  -- Nadie enlaza un archivo de otro espacio.
  begin
    perform public.studio_add_exercise_media(v_space, v_a, null, 'image', null, 'studio-media/' || v_other_space || '/x/f.webp', null);
    raise exception 'archivo ajeno';
  exception when invalid_parameter_value then null;
  end;

  -- Celda: imagen y enlace, y quitarlos.
  v_session := public.studio_create_session(v_client, current_date);
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a));
  perform public.studio_save_item_attachment(v_item.id, 'studio-media/' || v_space || '/' || v_client || '/g.webp', 'https://example.com');
  if not exists (select 1 from public.studio_item_attachments where item_id = v_item.id) then raise exception 'adjunto'; end if;
  perform public.studio_save_item_attachment(v_item.id, null, null);
  if exists (select 1 from public.studio_item_attachments where item_id = v_item.id) then raise exception 'quitar adjunto'; end if;

  -- Retirar el consentimiento oculta la foto sin borrarla, y su archivo deja de servirse.
  perform public.studio_set_image_consent(v_client, false);
  select count(*) into v_n from public.exercise_media where id = v_image.id;
  if v_n <> 0 then raise exception 'la foto se oculta'; end if;
  if public.studio_can_use_media(v_space, v_client) then raise exception 'el archivo se deja de servir'; end if;
  perform public.studio_set_image_consent(v_client, true);

  -- Un compañero no quita lo de otro.
  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_remove_exercise_media(v_media.id);
    raise exception 'no es suyo';
  exception when insufficient_privilege then null;
  end;

  -- Con «solo asignados», lo del cliente no se ve; lo de la sala, sí.
  execute 'reset role';
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  insert into public.client_professionals (client_id, user_id) values (v_client, v_pro);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_unassigned, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercise_media where coach_id = v_space;
  if v_n <> 1 then raise exception 'solo lo de la sala, hay %', v_n; end if;
  if public.studio_can_use_media(v_space, v_client) then raise exception 'archivo de un cliente que no lleva'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.exercise_media where coach_id = v_space;
  if v_n <> 0 then raise exception 'recepción no ve medios'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  perform public.studio_remove_exercise_media(v_media.id);
  execute 'reset role';
  raise notice 'studio_media OK';
end;
$tests$;
rollback;

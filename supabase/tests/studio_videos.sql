-- Prueba de la carpeta de vídeos con un espacio temporal.
-- Requiere 20261106100000_studio_videos.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_pro uuid; v_colleague uuid; v_unassigned uuid; v_reception uuid;
  v_client uuid; v_other uuid; v_a uuid; v_b uuid; v_room public.media_assets; v_own public.media_assets;
  v_keys text[]; v_n integer; v_room_key text; v_client_key text; v_session public.studio_sessions; v_item public.studio_session_items;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4] into v_pro, v_colleague, v_unassigned, v_reception
  from (select p.id from public.profiles p order by p.id limit 4) x;
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_colleague, 'coach', 'active'), (v_space, v_unassigned, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Ana', 'a@example.com') returning id into v_client;
  insert into public.clients (coach_id, full_name, email) values (v_space, 'Luis', 'l@example.com') returning id into v_other;
  select (array_agg(id))[1], (array_agg(id))[2] into v_a, v_b from (select id from public.exercise_catalog where is_active limit 2) x;
  v_room_key := 'studio-media/' || v_space || '/' || v_space || '/';
  v_client_key := 'studio-media/' || v_space || '/' || v_client || '/';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Un vídeo de la sala va a varios ejercicios, sin repetirse.
  v_room := public.studio_add_media_asset(v_space, null, v_room_key || 'a.mp4', v_room_key || 'a.webp', ' Sentadilla ', 30, 1000, 'video/mp4');
  if v_room.title <> 'Sentadilla' then raise exception 'título'; end if;
  perform public.studio_assign_video(v_room.id, v_a, null);
  perform public.studio_assign_video(v_room.id, v_a, null);
  perform public.studio_assign_video(v_room.id, v_b, null);
  select count(*) into v_n from public.exercise_media where asset_id = v_room.id;
  if v_n <> 2 then raise exception 'asignaciones, hay %', v_n; end if;

  -- Una clave de otra carpeta no entra.
  begin
    perform public.studio_add_media_asset(v_space, null, v_client_key || 'x.mp4', null, 'x', 1, 1, 'video/mp4');
    raise exception 'carpeta ajena';
  exception when invalid_parameter_value then null;
  end;

  -- Sin consentimiento no entra su vídeo, ni se le asigna uno de la sala.
  begin
    perform public.studio_add_media_asset(v_space, v_client, v_client_key || 'b.mp4', null, 'Ana', 10, 1, 'video/mp4');
    raise exception 'sin consentimiento no';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_assign_video(v_room.id, v_a, v_client);
    raise exception 'asignar sin consentimiento no';
  exception when invalid_parameter_value then null;
  end;

  perform public.studio_set_image_consent(v_client, true);
  perform public.studio_set_image_consent(v_other, true);
  v_own := public.studio_add_media_asset(v_space, v_client, v_client_key || 'b.mp4', v_client_key || 'b.webp', 'Ana', 10, 1, 'video/mp4');
  perform public.studio_assign_video(v_own.id, v_a, v_client);

  -- El vídeo de un cliente no se enseña a otro ni a toda la sala.
  begin
    perform public.studio_assign_video(v_own.id, v_a, v_other);
    raise exception 'a otro cliente no';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.studio_assign_video(v_own.id, v_a, null);
    raise exception 'a toda la sala no';
  exception when invalid_parameter_value then null;
  end;

  -- Un compañero no toca lo de otro.
  perform set_config('request.jwt.claims', json_build_object('sub', v_colleague, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_remove_media_asset(v_room.id);
    raise exception 'no es suyo';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.studio_rename_media_asset(v_room.id, 'Otro');
    raise exception 'no es suyo';
  exception when insufficient_privilege then null;
  end;

  -- Recepción no ve vídeos ni sube.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.media_assets where coach_id = v_space;
  if v_n <> 0 then raise exception 'recepción no ve vídeos'; end if;
  begin
    perform public.studio_add_media_asset(v_space, null, v_room_key || 'c.mp4', null, 'x', 1, 1, 'video/mp4');
    raise exception 'recepción no sube';
  exception when insufficient_privilege then null;
  end;

  -- Con «solo asignados», el vídeo del cliente no se ve; el de la sala, sí.
  execute 'reset role';
  update public.coaches set client_visibility = 'assigned' where id = v_space;
  insert into public.client_professionals (client_id, user_id) values (v_client, v_pro);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_unassigned, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.media_assets where coach_id = v_space;
  if v_n <> 1 then raise exception 'solo el de la sala, hay %', v_n; end if;

  -- Con el consentimiento vigente no se borra nada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);
  begin
    perform public.studio_purge_client_media(v_client);
    raise exception 'consentimiento vigente';
  exception when invalid_parameter_value then null;
  end;

  -- Imagen de ficha y de celda, para el borrado.
  perform public.studio_add_exercise_media(v_space, v_a, v_client, 'image', null, v_client_key || 'c.webp', null);
  v_session := public.studio_create_session(v_client, current_date);
  v_item := public.studio_save_item(v_session.id, null, null, jsonb_build_object('catalog_exercise_id', v_a));
  perform public.studio_save_item_attachment(v_item.id, v_client_key || 'd.webp', 'https://example.com');

  -- Al retirarlo se oculta, se cuenta lo oculto y se puede borrar con sus archivos.
  perform public.studio_set_image_consent(v_client, false);
  select count(*) into v_n from public.media_assets where id = v_own.id;
  if v_n <> 0 then raise exception 'se oculta'; end if;
  if public.studio_count_client_media(v_client) <> 3 then raise exception 'cuenta %', public.studio_count_client_media(v_client); end if;
  v_keys := public.studio_purge_client_media(v_client);
  if cardinality(v_keys) <> 4 then raise exception 'archivos %', v_keys; end if;
  if public.studio_count_client_media(v_client) <> 0 then raise exception 'queda algo'; end if;
  if not exists (select 1 from public.studio_item_attachments where item_id = v_item.id and image_key is null and link_url = 'https://example.com') then
    raise exception 'el enlace se queda';
  end if;

  -- Borrar un vídeo quita sus asignaciones y devuelve sus archivos.
  v_keys := public.studio_remove_media_asset(v_room.id);
  if cardinality(v_keys) <> 2 then raise exception 'archivos del vídeo %', v_keys; end if;
  select count(*) into v_n from public.exercise_media where asset_id = v_room.id;
  if v_n <> 0 then raise exception 'asignaciones sueltas'; end if;

  execute 'reset role';
  raise notice 'studio_videos OK';
end;
$tests$;
rollback;

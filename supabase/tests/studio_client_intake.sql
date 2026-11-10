-- Prueba del alta y la ficha de clientes de la sala con un espacio temporal.
-- Requiere 20261110100000_studio_client_intake.sql y 20261110101000_studio_intake_reception_link.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
  v_pro uuid; v_other uuid; v_reception uuid; v_outsider uuid;
  v_ana uuid; v_luis uuid; v_marta_patient uuid; v_pilar_patient uuid; v_r jsonb; v_client uuid; v_pedro uuid; v_failed boolean;
begin
  select (array_agg(id))[1], (array_agg(id))[2], (array_agg(id))[3], (array_agg(id))[4]
  into v_pro, v_other, v_reception, v_outsider
  from (select p.id from public.profiles p order by p.id limit 4) x;

  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback sala', 'studio');
  insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle) values (v_space, 'comped', 'studio', 'monthly')
    on conflict (coach_id) do update set status = excluded.status, plan = excluded.plan;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_pro, 'coach', 'active'), (v_space, v_other, 'coach', 'active'), (v_space, v_reception, 'reception', 'active');
  insert into public.clients (coach_id, full_name, email, status) values (v_space, 'Ana López García', 'ana@rollback.example', 'active') returning id into v_ana;
  insert into public.client_professionals (client_id, user_id) values (v_ana, v_other);
  insert into public.clients (coach_id, full_name, email, phone, status) values (v_space, 'Luis Pérez', 'luis@rollback.example', '+34 600 111 222', 'inactive') returning id into v_luis;
  insert into public.external_patients (coach_id, provider, external_id, full_name, birth_date, email)
    values (v_space, 'fisiotrack', 'm1', 'Marta Ruiz', date '1990-03-14', 'marta@rollback.example') returning id into v_marta_patient;
  insert into public.external_patients (coach_id, provider, external_id, full_name)
    values (v_space, 'fisiotrack', 'p1', 'Pilar Vela') returning id into v_pilar_patient;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_pro, 'role', 'authenticated')::text, true);

  -- Buscar: los clientes de otros, los de baja y los pacientes sin vincular.
  v_r := public.studio_find_people(v_space, 'ANA lopez');
  if jsonb_array_length(v_r->'clients') <> 1 or (v_r->'clients'->0->>'mine')::boolean then raise exception 'Ana es de otro profesional %', v_r; end if;
  if jsonb_array_length(v_r->'clients'->0->'professionals') <> 1 then raise exception 'se sabe quién la lleva'; end if;
  v_r := public.studio_find_people(v_space, 'luis');
  if (v_r->'clients'->0->>'active')::boolean then raise exception 'Luis está de baja'; end if;
  v_r := public.studio_find_people(v_space, 'marta');
  if jsonb_array_length(v_r->'patients') <> 1 then raise exception 'Marta está en FisioTrack'; end if;
  if jsonb_array_length(public.studio_find_people(v_space, 'a')->'clients') <> 0 then raise exception 'una letra no busca'; end if;

  -- Duplicados: por nombre, por email y por teléfono.
  v_r := public.studio_create_client(v_space, ' Ana   López ');
  if v_r->>'status' <> 'duplicates' or v_r->'matches'->0->>'reason' <> 'name' then raise exception 'Ana ya existe %', v_r; end if;
  v_r := public.studio_create_client(v_space, 'Otro nombre', 'LUIS@rollback.example');
  if v_r->>'status' <> 'duplicates' or v_r->'matches'->0->>'reason' <> 'email' then raise exception 'mismo email %', v_r; end if;
  v_r := public.studio_create_client(v_space, 'Otro nombre', null, '600111222');
  if v_r->>'status' <> 'duplicates' or v_r->'matches'->0->>'reason' <> 'phone' then raise exception 'mismo teléfono %', v_r; end if;
  if exists (select 1 from public.clients where coach_id = v_space and full_name = 'Otro nombre') then raise exception 'con duplicados no se crea'; end if;

  -- Usar el que ya existe: se reactiva y queda compartido.
  perform public.studio_use_client(v_luis);
  if (select status from public.clients where id = v_luis) <> 'active' then raise exception 'Luis vuelve'; end if;
  if not exists (select 1 from public.client_professionals where client_id = v_luis and user_id = v_pro) then raise exception 'Luis queda compartido'; end if;

  -- Alta nueva: activa y con quien la crea.
  v_r := public.studio_create_client(v_space, 'Pedro Nuevo', 'Pedro@Rollback.example', null, date '1985-06-01');
  v_pedro := (v_r->>'client_id')::uuid;
  if v_r->>'status' <> 'created' then raise exception 'Pedro se crea %', v_r; end if;
  if (select email from public.clients where id = v_pedro) <> 'pedro@rollback.example' then raise exception 'email en minúsculas'; end if;
  if not exists (select 1 from public.client_professionals where client_id = v_pedro and user_id = v_pro) then raise exception 'Pedro es mío'; end if;
  v_r := public.studio_create_client(v_space, 'Ana López', null, null, null, null, true);
  if v_r->>'status' <> 'created' then raise exception 'crear igualmente'; end if;

  -- Desde FisioTrack: se crea, se vincula y trae su cumpleaños.
  v_r := public.studio_create_client(v_space, 'Marta Ruiz', null, null, null, v_marta_patient);
  v_client := (v_r->>'client_id')::uuid;
  if (select client_id from public.external_patients where id = v_marta_patient) <> v_client then raise exception 'Marta vinculada'; end if;
  if (select birthday from public.clients where id = v_client) <> date '1990-03-14' then raise exception 'cumpleaños de FisioTrack'; end if;
  if (select email from public.clients where id = v_client) <> 'marta@rollback.example' then raise exception 'email de FisioTrack'; end if;
  if public.studio_create_client(v_space, 'Marta Ruiz', null, null, null, v_marta_patient)->>'status' <> 'linked' then raise exception 'no se duplica'; end if;

  -- Ficha: objetivos limpios y cumpleaños.
  perform public.studio_save_client_profile(v_pedro, array[' Bajar peso ', '', 'Correr 10 km'], date '1985-06-02');
  if (select objectives from public.clients where id = v_pedro) <> array['Bajar peso', 'Correr 10 km'] then raise exception 'objetivos limpios'; end if;
  if (select birthday from public.clients where id = v_pedro) <> date '1985-06-02' then raise exception 'cumpleaños'; end if;

  -- Vincular: un paciente por cliente; desvincular lo suelta.
  v_failed := false;
  begin
    perform public.studio_link_patient(v_pedro, v_marta_patient);
  exception when invalid_parameter_value then v_failed := true;
  end;
  if not v_failed then raise exception 'Marta ya es de otro cliente'; end if;
  perform public.studio_link_patient(v_client, null);
  if (select client_id from public.external_patients where id = v_marta_patient) is not null then raise exception 'desvinculada'; end if;
  perform public.studio_link_patient(v_pedro, v_marta_patient);
  if (select client_id from public.external_patients where id = v_marta_patient) <> v_pedro then raise exception 'cambiada a Pedro'; end if;

  -- Recepción da de alta, pero no se queda el cliente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  v_r := public.studio_create_client(v_space, 'Rosa Recepción');
  if exists (select 1 from public.client_professionals where client_id = (v_r->>'client_id')::uuid) then raise exception 'recepción no se asigna'; end if;
  v_r := public.studio_create_client(v_space, 'Pilar Vela', null, null, null, v_pilar_patient);
  if (select client_id from public.external_patients where id = v_pilar_patient) <> (v_r->>'client_id')::uuid then raise exception 'recepción da de alta desde FisioTrack'; end if;

  -- Quien no es del espacio no busca ni crea.
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  v_failed := false;
  begin
    perform public.studio_find_people(v_space, 'ana');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'fuera del espacio no se busca'; end if;

  raise notice 'studio_client_intake OK';
end;
$tests$;
rollback;

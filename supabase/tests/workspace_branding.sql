-- Prueba del look & feel con un espacio temporal.
-- Requiere 20261105180000_workspace_branding.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_owner uuid; v_space uuid; v_athlete uuid; v_outsider uuid; v_n integer;
begin
  select cm.user_id, cm.coach_id into v_owner, v_space
  from public.coach_memberships cm where cm.role = 'owner' and cm.status = 'active' limit 1;
  select c.auth_user_id into v_athlete from public.clients c
  where c.coach_id = v_space and c.auth_user_id is not null
    and c.auth_user_id not in (select user_id from public.coach_memberships) limit 1;
  select p.id into v_outsider from public.profiles p
  where p.id not in (select user_id from public.coach_memberships)
    and p.id not in (select auth_user_id from public.clients where auth_user_id is not null)
    and p.id not in (select user_id from public.clients where user_id is not null) limit 1;
  if v_athlete is null then raise exception 'falta un atleta para la prueba'; end if;

  delete from public.coach_feature_overrides where coach_id = v_space and feature = 'branding';
  execute 'set local role authenticated';

  -- Sin el plan, ni el propietario guarda.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if not public.coach_has_feature(v_space, 'branding') then
    begin
      insert into public.workspace_branding (coach_id, display_name) values (v_space, 'No');
      raise exception 'sin el plan no se guarda';
    exception when insufficient_privilege then null;
    end;
  end if;

  execute 'reset role';
  insert into public.coach_feature_overrides (coach_id, feature, enabled, reason)
    values (v_space, 'branding', true, 'Rollback')
    on conflict do nothing;
  execute 'set local role authenticated';

  insert into public.workspace_branding (coach_id, display_name, primary_color)
    values (v_space, 'Sala rollback', '#112233');

  begin
    update public.workspace_branding set primary_color = 'red;}' where coach_id = v_space;
    raise exception 'el color tiene que ser hexadecimal';
  exception when check_violation then null;
  end;

  if (select display_name from public.my_workspace_branding()) <> 'Sala rollback' then
    raise exception 'el propietario ve su marca';
  end if;

  -- El atleta la ve por la función, no por la tabla.
  perform set_config('request.jwt.claims', json_build_object('sub', v_athlete, 'role', 'authenticated')::text, true);
  if (select display_name from public.my_workspace_branding()) <> 'Sala rollback' then
    raise exception 'el atleta ve la marca de su entrenador';
  end if;
  update public.workspace_branding set display_name = 'Hackeado' where coach_id = v_space;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'el atleta no cambia la marca'; end if;

  if v_outsider is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
    if exists (select 1 from public.my_workspace_branding()) then raise exception 'otra persona no ve nada'; end if;
  end if;

  -- Si el plan deja de incluirlo, vuelve la marca NexTrain.
  execute 'reset role';
  update public.coach_feature_overrides set enabled = false where coach_id = v_space and feature = 'branding';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.my_workspace_branding()) then raise exception 'sin el plan no se aplica'; end if;
end;
$tests$;
rollback;

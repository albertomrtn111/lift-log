-- Prueba de los profesionales de un cliente.
-- Requiere 20261105220000_client_professionals_list.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_owner uuid; v_client uuid; v_space uuid; v_outsider uuid;
begin
  select c.id, c.coach_id into v_client, v_space from public.clients c limit 1;
  select cm.user_id into v_owner from public.coach_memberships cm
  where cm.coach_id = v_space and cm.role = 'owner' and cm.status = 'active';
  select p.id into v_outsider from public.profiles p where p.id not in (select user_id from public.coach_memberships) limit 1;
  insert into public.client_professionals (client_id, user_id) values (v_client, v_owner);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  if (select count(*) from public.client_professionals_list(v_client) where role = 'owner') <> 1 then
    raise exception 'lista al profesional con su rol';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  begin
    perform * from public.client_professionals_list(v_client);
    raise exception 'otro usuario no lo ve';
  exception when insufficient_privilege then null;
  end;
end;
$tests$;
rollback;

-- Prueba de los permisos finales de F0-1 con miembros temporales y sesiones simuladas.
-- Requiere 20261105130000_team_roles_final_functions.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid; v_owner uuid;
  v_admin uuid := gen_random_uuid(); v_coach uuid := gen_random_uuid();
  v_reception uuid := gen_random_uuid(); v_member_client uuid := gen_random_uuid();
  v_rows bigint; v_total bigint; v_pay bigint;
begin
  select coach_id, user_id into v_space, v_owner from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  select count(*) into v_total from public.clients where coach_id = v_space;
  select count(*) into v_pay from public.payment_records where coach_id = v_space;
  insert into auth.users (id, email)
    select u, u::text || '@prueba.invalid' from unnest(array[v_admin, v_coach, v_reception, v_member_client]) u;
  insert into public.profiles (id) values (v_admin), (v_coach), (v_reception), (v_member_client) on conflict (id) do nothing;
  insert into public.coach_memberships (coach_id, user_id, role, status) values
    (v_space, v_admin, 'admin', 'active'), (v_space, v_coach, 'coach', 'active'),
    (v_space, v_reception, 'reception', 'active'), (v_space, v_member_client, 'client', 'active');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if not public.is_coach_member(v_space) or not public.is_coach_admin(v_space) then raise exception 'admin mal'; end if;
  execute 'set local role authenticated';
  select count(*) into v_rows from public.clients where coach_id = v_space;
  if v_rows <> v_total then raise exception 'el administrador debería ver a todos'; end if;
  select count(*) into v_rows from public.payment_records where coach_id = v_space;
  if v_rows <> v_pay then raise exception 'el administrador debería ver los cobros'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  if not public.is_coach_member(v_space) or public.is_coach_admin(v_space) then raise exception 'profesional mal'; end if;
  execute 'set local role authenticated';
  select count(*) into v_rows from public.clients where coach_id = v_space;
  if v_rows <> v_total then raise exception 'el profesional debería ver a sus clientes'; end if;
  select count(*) into v_rows from public.payment_records;
  if v_rows <> 0 then raise exception 'el profesional no debería ver cobros'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  if public.is_coach_member(v_space) or public.is_coach_admin(v_space) then raise exception 'recepción mal'; end if;
  execute 'set local role authenticated';
  select count(*) into v_rows from public.clients;
  if v_rows <> 0 then raise exception 'recepción aún no debería leer clients'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member_client, 'role', 'authenticated')::text, true);
  if public.is_coach_member(v_space) then raise exception 'una membresía client no es equipo'; end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~ $q$'owner', *'coach'$q$
  ) then raise exception 'queda alguna función sin admin'; end if;
end;
$tests$;
rollback;
select 'ok' as team_roles_final_functions;

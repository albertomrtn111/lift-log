-- Prueba de planes y excepciones con un espacio temporal.
-- Requiere 20261105140000_plan_features.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid();
begin
  insert into public.coaches (id, name, subscription_tier) values (v_space, 'Rollback planes', 'starter');
  if public.coach_has_feature(v_space, 'studio_mode') then raise exception 'starter no tiene sala'; end if;
  if public.coach_feature_limit(v_space, 'max_active_clients') <> 20 then raise exception 'límite de starter mal'; end if;
  if public.coach_has_feature(v_space, 'no_existe') then raise exception 'función desconocida'; end if;

  insert into public.coach_subscriptions (coach_id, status, plan) values (v_space, 'comped', 'studio');
  if not public.coach_has_feature(v_space, 'studio_mode') then raise exception 'studio tiene sala'; end if;
  if public.coach_feature_limit(v_space, 'max_members') is not null then raise exception 'studio sin límite de miembros'; end if;

  insert into public.coach_feature_overrides (coach_id, feature, enabled, reason) values (v_space, 'studio_mode', false, 'prueba');
  if public.coach_has_feature(v_space, 'studio_mode') then raise exception 'manda la excepción'; end if;

  update public.coach_feature_overrides set expires_at = now() - interval '1 day' where coach_id = v_space;
  if not public.coach_has_feature(v_space, 'studio_mode') then raise exception 'una excepción caducada no cuenta'; end if;

  insert into public.coach_feature_overrides (coach_id, feature, enabled, limit_value) values (v_space, 'max_members', true, 5);
  if public.coach_feature_limit(v_space, 'max_members') <> 5 then raise exception 'límite de la excepción mal'; end if;

  if exists (select 1 from public.coaches c left join public.coach_subscriptions s on s.coach_id = c.id where s.coach_id is null and c.id <> v_space) then
    raise exception 'todo espacio existente debe tener suscripción';
  end if;
  if has_function_privilege('anon', 'public.coach_has_feature(uuid, text)', 'execute') then raise exception 'anon no debe ejecutarla'; end if;
end;
$tests$;
rollback;
select 'ok' as plan_features;

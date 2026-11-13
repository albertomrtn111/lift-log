-- Prueba de los tableros por entorno. Requiere 20261113090000_analytics_environment.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_space uuid := gen_random_uuid(); v_failed boolean;
begin
  insert into public.coaches (id, name) values (v_space, 'Rollback analítica');
  insert into public.analytics_pages (coach_id, name, is_home) values (v_space, 'Cartera', true);
  if (select environment from public.analytics_pages where coach_id = v_space) <> 'online' then raise exception 'lo de antes es Online'; end if;

  -- Un inicio en Online y otro en Sala.
  insert into public.analytics_pages (coach_id, name, is_home, environment) values (v_space, 'Sala', true, 'sala');
  v_failed := false;
  begin
    insert into public.analytics_pages (coach_id, name, is_home, environment) values (v_space, 'Otra', true, 'sala');
  exception when unique_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'un solo inicio por entorno'; end if;

  v_failed := false;
  begin
    insert into public.analytics_pages (coach_id, name, environment) values (v_space, 'Mal', 'otro');
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'solo online o sala'; end if;
  raise notice 'analytics_environment OK';
end;
$tests$;
rollback;

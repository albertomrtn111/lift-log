-- Prueba de 20261030100000_analytics_boards con el rol authenticated: RLS por
-- equipo del coach, tableros de ejemplo no borrables, un solo tablero de inicio y
-- gráficos que no pueden apuntar al tablero de otro coach. Termina con ROLLBACK.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_other_coach uuid;
  v_page uuid;
  v_system uuid;
  v_other_page uuid := gen_random_uuid();
  v_count bigint;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  select id into v_other_coach from public.coaches
    where id <> v_coach
      and not exists (select 1 from public.coach_memberships m where m.coach_id = coaches.id and m.user_id = v_user and m.status = 'active')
    limit 1;

  -- Tablero de otro coach (temporal si no hay otro), creado sin RLS
  if v_other_coach is null then
    insert into public.coaches (name) values ('Analytics RLS test') returning id into v_other_coach;
  end if;
  insert into public.analytics_pages (id, coach_id, name) values (v_other_page, v_other_coach, 'Ajeno');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  execute 'set local role authenticated';

  -- 1. El coach crea un tablero y un gráfico.
  insert into public.analytics_pages (coach_id, name, default_filters)
    values (v_coach, 'Test analítica', '{"period":"12w"}') returning id into v_page;
  insert into public.analytics_widgets (page_id, coach_id, title, metric_key, visual, dimensions, filters, layout)
    values (v_page, v_coach, 'e1RM sentadilla', 'e1rm', 'line', '{week,exercise}', '{"exerciseKeys":["x"]}', '{"w":6,"h":"md"}');
  select count(*) into v_count from public.analytics_widgets where page_id = v_page;
  if v_count <> 1 then raise exception 'El coach no ve su gráfico.'; end if;
  v_assertions := v_assertions + 1;

  -- 2. No ve ni puede usar el tablero de otro coach.
  select count(*) into v_count from public.analytics_pages where id = v_other_page;
  if v_count <> 0 then raise exception 'Se ve el tablero de otro coach.'; end if;
  begin
    insert into public.analytics_widgets (page_id, coach_id, metric_key, visual) values (v_other_page, v_other_coach, 'e1rm', 'line');
    raise exception 'Se puede crear un gráfico en el tablero de otro coach.';
  exception when insufficient_privilege then null;
  end;
  v_assertions := v_assertions + 1;

  -- 3. Un gráfico no puede apuntar a un tablero de otro coach con su propio coach_id.
  begin
    insert into public.analytics_widgets (page_id, coach_id, metric_key, visual) values (v_other_page, v_coach, 'e1rm', 'line');
    raise exception 'Un gráfico apunta a un tablero de otro coach.';
  exception when foreign_key_violation then null;
  end;
  v_assertions := v_assertions + 1;

  -- 4. Los tableros de ejemplo no se borran; los propios sí, con sus gráficos.
  insert into public.analytics_pages (coach_id, name, is_system, scope)
    values (v_coach, 'Cartera test', true, 'portfolio') returning id into v_system;
  delete from public.analytics_pages where id = v_system;
  if not exists (select 1 from public.analytics_pages where id = v_system) then raise exception 'Se borra un tablero de ejemplo.'; end if;
  delete from public.analytics_pages where id = v_page;
  select count(*) into v_count from public.analytics_widgets where page_id = v_page;
  if v_count <> 0 then raise exception 'Borrar el tablero no borra sus gráficos.'; end if;
  v_assertions := v_assertions + 1;

  -- 5. Un solo tablero de inicio por coach.
  update public.analytics_pages set is_home = false where coach_id = v_coach;
  update public.analytics_pages set is_home = true where id = v_system;
  begin
    insert into public.analytics_pages (coach_id, name, is_home) values (v_coach, 'Otro inicio', true);
    raise exception 'Hay dos tableros de inicio.';
  exception when unique_violation then null;
  end;
  v_assertions := v_assertions + 1;

  -- 6. Visual desconocido.
  begin
    insert into public.analytics_widgets (page_id, coach_id, metric_key, visual) values (v_system, v_coach, 'e1rm', 'pie');
    raise exception 'Se acepta un visual desconocido.';
  exception when check_violation then null;
  end;
  v_assertions := v_assertions + 1;

  if v_assertions <> 6 then raise exception 'Solo % de 6 comprobaciones.', v_assertions; end if;
end;
$tests$;
rollback;

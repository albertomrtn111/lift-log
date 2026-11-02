-- Prueba de integración del historial de nutrición con un cliente temporal y
-- el rol authenticated. Requiere 20261103100000_nutrition_plan_history.sql.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_today date;
  v_payload jsonb;
  v_old jsonb;
  v_new jsonb;
  v_same jsonb;
  v_diet jsonb;
  v_row record;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
  v_today := public.nexttrain_coach_today(v_coach);
  insert into public.clients (id, coach_id, user_id, full_name, status)
    values (v_client, v_coach, v_user, 'Nutrition history rollback test', 'active');
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  -- created_by toma auth.uid(), así que va después de fijar el usuario.
  insert into public.client_metrics (coach_id, client_id, metric_date, weight_kg) values
    (v_coach, v_client, v_today - 30, 82.0), (v_coach, v_client, v_today - 1, 80.5);
  execute 'set local role authenticated';

  v_payload := jsonb_build_object('kcal',2380,'protein_g',160,'carbs_g',300,'fat_g',60);

  -- 1. Un plan nuevo cierra el anterior el día previo y lo marca como sustituido.
  v_old := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,
    v_payload || jsonb_build_object('effective_from',v_today - 30),null);
  v_new := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,
    v_payload || jsonb_build_object('effective_from',v_today,'kcal',2530,'carbs_g',337,'change_note','+150 kcal'),null);
  if not exists(select 1 from public.macro_plans where id=(v_old->>'id')::uuid
      and effective_to = v_today - 1 and archived_at is not null) then
    raise exception 'El plan anterior no quedó cerrado y archivado.';
  end if;
  if v_new->>'change_note' <> '+150 kcal' then raise exception 'No se guardó el motivo del cambio.'; end if;
  v_assertions := v_assertions + 1;

  -- 2. Sin replace_same_day (MCP), otro plan el mismo día sigue dando error.
  begin
    perform public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,
      v_payload || jsonb_build_object('effective_from',v_today),null);
    raise exception 'Se permitió un segundo plan el mismo día sin sustituir.';
  exception when raise_exception then
    if sqlerrm not like 'Ya hay otro plan de macros%' then raise; end if;
    v_assertions := v_assertions + 1;
  end;

  -- 3. Con replace_same_day (app), el del mismo día queda con cero días.
  v_same := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,
    v_payload || jsonb_build_object('effective_from',v_today,'replace_same_day',true),null);
  if not exists(select 1 from public.macro_plans where id=(v_new->>'id')::uuid
      and effective_to = v_today - 1 and archived_at is not null) then
    raise exception 'El plan del mismo día no quedó sustituido.';
  end if;
  v_assertions := v_assertions + 1;

  -- 4. Un plan de cero días no bloquea editar el vigente.
  perform public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,(v_same->>'id')::uuid,
    (v_same - 'replaced_plan_ids') || jsonb_build_object('notes','Editado'),null);
  v_assertions := v_assertions + 1;

  -- 5. La vista da estado, duración y peso de cada momento.
  select * into v_row from public.nutrition_plan_history where id = (v_old->>'id')::uuid;
  if v_row.status <> 'archived' or v_row.days <> 30 or v_row.start_weight_kg <> 82.0 or v_row.end_weight_kg <> 80.5 then
    raise exception 'Historial de macros incorrecto: %', row_to_json(v_row);
  end if;
  select * into v_row from public.nutrition_plan_history where id = (v_new->>'id')::uuid;
  if v_row.days <> 0 then raise exception 'El plan sustituido el mismo día debería durar 0 días.'; end if;
  select * into v_row from public.nutrition_plan_history where id = (v_same->>'id')::uuid;
  if v_row.status <> 'active' then raise exception 'El plan vigente no aparece como activo.'; end if;
  v_assertions := v_assertions + 1;

  -- 6. Dietas: al activar otra, la anterior recibe archived_at; el motivo se guarda.
  v_diet := public.save_nexttrain_nutrition_plan('options',v_coach,v_client,null,
    jsonb_build_object('name','Dieta A','status','active','effective_from',v_today,
      'legacy_meals',jsonb_build_object('days',jsonb_build_object('default','{}'::jsonb)),
      'meals',jsonb_build_array(jsonb_build_object('name','Comida','day_type','default','order_index',0,
        'options',jsonb_build_array(jsonb_build_object('name','A','order_index',0,'items',jsonb_build_array(
          jsonb_build_object('name','Arroz','item_type','free_text','order_index',0)))))))
    ,null);
  perform public.save_nexttrain_nutrition_plan('options',v_coach,v_client,null,
    (jsonb_build_object('name','Dieta B','status','active','effective_from',v_today,'change_note','Más hidratos',
      'legacy_meals',jsonb_build_object('days',jsonb_build_object('default','{}'::jsonb)),
      'meals',jsonb_build_array(jsonb_build_object('name','Comida','day_type','default','order_index',0,
        'options',jsonb_build_array(jsonb_build_object('name','A','order_index',0,'items',jsonb_build_array(
          jsonb_build_object('name','Pasta','item_type','free_text','order_index',0)))))))),null);
  if not exists(select 1 from public.diet_plans where id=(v_diet->>'id')::uuid and status='archived' and archived_at is not null)
    or not exists(select 1 from public.diet_plans where client_id=v_client and status='active' and change_note='Más hidratos') then
    raise exception 'Dietas sin archived_at o sin motivo.';
  end if;
  v_assertions := v_assertions + 1;

  execute 'reset role';
  if v_assertions <> 6 then raise exception 'No se han completado las 6 verificaciones.'; end if;
end;
$tests$;
rollback;
select 6 as assertions_completed_before_rollback,
  not exists(select 1 from public.clients where full_name='Nutrition history rollback test') as temporary_data_rolled_back;

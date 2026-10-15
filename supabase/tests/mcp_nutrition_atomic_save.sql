-- Prueba de integración con un cliente temporal y el rol authenticated.
-- La transacción termina con ROLLBACK explícito: no deja datos de prueba.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_food public.foods%rowtype;
  v_first jsonb;
  v_macro jsonb;
  v_diet jsonb;
  v_payload jsonb;
  v_meal uuid;
  v_option uuid;
  v_before integer;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador para verificar RLS.'; end if;
    insert into public.clients (id, coach_id, user_id, full_name, status)
      values (v_client, v_coach, v_user, 'MCP nutrition rollback test', 'active');
    perform set_config('request.jwt.claims', jsonb_build_object('sub',v_user,'role','authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    execute 'set local role authenticated';
    v_payload := jsonb_build_object('name','Test macros','kcal',2380,'protein_g',160,'carbs_g',300,'fat_g',60,
      'effective_from',current_date - 7);
    v_first := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,v_payload,null);
    v_macro := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,null,
      v_payload || jsonb_build_object('effective_from',current_date,'day_type_config',jsonb_build_object(
        'training',jsonb_build_object('kcal',2380,'protein_g',160,'carbs_g',300,'fat_g',60),
        'rest',jsonb_build_object('kcal',1980,'protein_g',160,'carbs_g',200,'fat_g',60))),null);
    if not exists(select 1 from public.macro_plans where id=(v_first->>'id')::uuid and effective_to=current_date-1) then
      raise exception 'No se ha conservado la vigencia anterior.';
    end if;
    v_assertions := v_assertions + 1;
    v_macro := public.save_nexttrain_nutrition_plan('macros',v_coach,v_client,(v_macro->>'id')::uuid,
      v_macro || jsonb_build_object('notes','Edited','day_type_config',(v_macro->>'day_type_config')::jsonb,
        'expected_macro',v_macro - 'replaced_plan_ids'),null);
    if v_macro->>'notes' <> 'Edited' or v_macro->>'day_type_config' is null then raise exception 'Edición de macros incorrecta.'; end if;
    v_assertions := v_assertions + 1;
    begin
      perform public.save_nexttrain_nutrition_plan('macros',gen_random_uuid(),v_client,null,v_payload,null);
      raise exception 'Se permitió escribir en otro coach.';
    exception when insufficient_privilege then v_assertions := v_assertions + 1; end;
    begin
      perform public.save_nexttrain_nutrition_plan('macros',v_coach,gen_random_uuid(),null,v_payload,null);
      raise exception 'Se permitió escribir en otro cliente.';
    exception when insufficient_privilege then v_assertions := v_assertions + 1; end;

    select * into v_food from public.foods where is_public and serving_size_g > 0 order by id limit 1;
    if v_food.id is null then raise exception 'Se necesita un alimento público para verificar los macros.'; end if;
    v_payload := jsonb_build_object('name','Test diet','status','active','effective_from',current_date,
      'legacy_meals',jsonb_build_object('days',jsonb_build_object('default','{}'::jsonb)),
      'meals',jsonb_build_array(jsonb_build_object('name','Comida','day_type','default','order_index',0,
        'options',jsonb_build_array(
          jsonb_build_object('name','A','order_index',0,'items',jsonb_build_array(jsonb_build_object(
            'name',v_food.name,'food_id',v_food.id,'quantity_g',100,'quantity_value',100,'quantity_unit','g','order_index',0,'kcal',9999))),
          jsonb_build_object('name','B','order_index',1,'items',jsonb_build_array(jsonb_build_object(
            'name',v_food.name,'food_id',v_food.id,'quantity_g',150,'quantity_value',150,'quantity_unit','g','order_index',0)))
        ))));
    v_diet := public.save_nexttrain_nutrition_plan('options',v_coach,v_client,null,v_payload,null);
    select id into v_meal from public.diet_meals where diet_plan_id=(v_diet->>'id')::uuid;
    select id into v_option from public.diet_meal_options where meal_id=v_meal and order_index=0;
    if not exists(select 1 from public.diet_meal_items where option_id=v_option and kcal=round(v_food.kcal*100/v_food.serving_size_g,1)) then
      raise exception 'Se aceptaron macros inventados en lugar del catálogo.';
    end if;
    v_assertions := v_assertions + 1;
    v_diet := public.save_nexttrain_nutrition_plan('options',v_coach,v_client,(v_diet->>'id')::uuid,
      v_payload || jsonb_build_object('name','Edited diet'),(v_diet->>'updated_at')::timestamptz);
    if not exists(select 1 from public.diet_meals where id=v_meal) or not exists(select 1 from public.diet_meal_options where id=v_option) then
      raise exception 'Se perdieron los IDs de comidas/opciones al editar.';
    end if;
    v_assertions := v_assertions + 1;
    begin
      perform public.save_nexttrain_nutrition_plan('options',v_coach,v_client,(v_diet->>'id')::uuid,v_payload,
        (v_diet->>'updated_at')::timestamptz - interval '1 day');
      raise exception 'No se ha detectado una edición obsoleta.';
    exception when raise_exception then
      if sqlerrm not like 'La dieta cambió%' then raise; end if;
      v_assertions := v_assertions + 1;
    end;
    select count(*) into v_before from public.diet_plans where client_id=v_client;
    begin
      perform public.save_nexttrain_nutrition_plan('options',v_coach,v_client,null,
        jsonb_set(v_payload,'{meals,0,options,0,items,0,food_id}',to_jsonb(gen_random_uuid()::text)),null);
      raise exception 'Se aceptó un alimento inaccesible.';
    exception when insufficient_privilege then v_assertions := v_assertions + 1; end;
    if (select count(*) from public.diet_plans where client_id=v_client) <> v_before
      or not exists(select 1 from public.diet_plans where id=(v_diet->>'id')::uuid and status='active') then
      raise exception 'Un error dejó una dieta parcial o archivó la anterior.';
    end if;
    v_assertions := v_assertions + 1;
    insert into public.diet_choice_logs (client_id,log_date,diet_meal_id,chosen_option_id)
      values(v_client,current_date,v_meal,v_option);
    begin
      perform public.save_nexttrain_nutrition_plan('options',v_coach,v_client,(v_diet->>'id')::uuid,
        jsonb_set(v_payload,'{meals,0,options}',jsonb_build_array((v_payload->'meals'->0->'options'->1) || jsonb_build_object('id',
          (select id from public.diet_meal_options where meal_id=v_meal and order_index=1),'order_index',0))),
        (v_diet->>'updated_at')::timestamptz);
      raise exception 'Se borraron opciones con histórico.';
    exception when raise_exception then
      if sqlerrm not like 'Hay registros del atleta%' then raise; end if;
      v_assertions := v_assertions + 1;
    end;
    if not exists(select 1 from public.diet_choice_logs where client_id=v_client and chosen_option_id=v_option)
      or not exists(select 1 from public.diet_meal_options where id=v_option and order_index=0) then
      raise exception 'El fallo alteró el histórico del atleta.';
    end if;
    v_assertions := v_assertions + 1;
    v_first := public.save_nexttrain_nutrition_plan('options',v_coach,v_client,null,v_payload,null);
    if not exists(select 1 from public.diet_plans where id=(v_diet->>'id')::uuid and status='archived')
      or not exists(select 1 from public.diet_plans where id=(v_first->>'id')::uuid and status='active') then
      raise exception 'Activación sin archivar el bloque anterior.';
    end if;
    v_assertions := v_assertions + 1;
  execute 'reset role';
  if v_assertions <> 12 then raise exception 'No se han completado las 12 verificaciones.'; end if;
end;
$tests$;
rollback;
select 12 as assertions_completed_before_rollback,
  not exists(select 1 from public.clients where full_name='MCP nutrition rollback test') as temporary_data_rolled_back;

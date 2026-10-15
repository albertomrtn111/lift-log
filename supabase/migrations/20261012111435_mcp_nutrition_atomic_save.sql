-- Todas las escrituras se ejecutan con el usuario OAuth y las RLS existentes.
-- Una excepción revierte cabecera, estructura y cambios de estado anteriores.
create or replace function public.save_nexttrain_nutrition_plan(
  p_kind text, p_coach_id uuid, p_client_id uuid, p_plan_id uuid,
  p_payload jsonb, p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_plan public.diet_plans%rowtype;
  v_macro public.macro_plans%rowtype;
  v_other public.macro_plans%rowtype;
  v_from date := (p_payload->>'effective_from')::date;
  v_to date := (p_payload->>'effective_to')::date;
  v_meal jsonb;
  v_option jsonb;
  v_item jsonb;
  v_mid uuid;
  v_oid uuid;
  v_iid uuid;
  v_order integer;
  v_meal_ids uuid[] := '{}';
  v_option_ids uuid[] := '{}';
  v_item_ids uuid[] := '{}';
  v_changed_ids uuid[] := '{}';
  v_food public.foods%rowtype;
  v_grams numeric;
  v_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.coach_memberships m
    where m.coach_id = p_coach_id and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'coach')
  ) then
    raise exception 'No tienes acceso de entrenador a este espacio.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id) then
    raise exception 'Cliente no encontrado en este espacio.' using errcode = '42501';
  end if;
  if v_from is null or (v_to is not null and v_to < v_from) then
    raise exception 'El periodo de vigencia no es válido.';
  end if;
  -- Serializa activaciones y sustituciones dentro del cliente, también si dos
  -- asistentes intentan crear una dieta al mismo tiempo.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text, 0));

  if p_kind = 'macros' then
    if p_plan_id is not null then
      select * into v_macro from public.macro_plans
      where id = p_plan_id and coach_id = p_coach_id and client_id = p_client_id for update;
      if not found then raise exception 'Plan de macros no encontrado.' using errcode = '42501'; end if;
      if p_payload ? 'expected_macro' and not (pg_catalog.to_jsonb(v_macro) @> p_payload->'expected_macro') then
        raise exception 'El plan de macros cambió desde la última lectura. Vuelve a consultarlo.';
      end if;
    end if;
    if (p_payload->>'kcal')::numeric not between 0 and 20000
      or (p_payload->>'protein_g')::numeric not between 0 and 1000
      or (p_payload->>'carbs_g')::numeric not between 0 and 3000
      or (p_payload->>'fat_g')::numeric not between 0 and 1000
      or not (p_payload ?& array['kcal','protein_g','carbs_g','fat_g']) then
      raise exception 'Macros inválidos.';
    end if;
    for v_other in select * from public.macro_plans
      where coach_id = p_coach_id and client_id = p_client_id
        and id is distinct from p_plan_id
        and effective_from <= coalesce(v_to, 'infinity'::date)
        and coalesce(effective_to, 'infinity'::date) >= v_from for update
    loop
      if p_plan_id is not null or v_other.effective_from >= v_from then
        raise exception 'Ya hay otro plan de macros en este periodo. Edita ese plan o cambia las fechas.';
      end if;
      update public.macro_plans set effective_to = v_from - 1 where id = v_other.id;
      v_changed_ids := array_append(v_changed_ids, v_other.id);
    end loop;
    if p_plan_id is null then
      insert into public.macro_plans (coach_id, client_id, name, kcal, protein_g, carbs_g, fat_g, steps, cardio_target,
        notes, day_type_config, effective_from, effective_to)
      values (p_coach_id, p_client_id, p_payload->>'name', (p_payload->>'kcal')::integer,
        (p_payload->>'protein_g')::integer, (p_payload->>'carbs_g')::integer, (p_payload->>'fat_g')::integer,
        (p_payload->>'steps')::bigint, p_payload->'cardio_target', p_payload->>'notes',
        case when jsonb_typeof(p_payload->'day_type_config') = 'object' then (p_payload->'day_type_config')::text else null end,
        v_from, v_to) returning * into v_macro;
    else
      update public.macro_plans set name = p_payload->>'name', kcal = (p_payload->>'kcal')::integer,
        protein_g = (p_payload->>'protein_g')::integer, carbs_g = (p_payload->>'carbs_g')::integer,
        fat_g = (p_payload->>'fat_g')::integer, steps = (p_payload->>'steps')::bigint,
        cardio_target = p_payload->'cardio_target', notes = p_payload->>'notes',
        day_type_config = case when jsonb_typeof(p_payload->'day_type_config') = 'object' then (p_payload->'day_type_config')::text else null end,
        effective_from = v_from, effective_to = v_to
      where id = p_plan_id and coach_id = p_coach_id and client_id = p_client_id returning * into v_macro;
    end if;
    return pg_catalog.to_jsonb(v_macro) || jsonb_build_object('replaced_plan_ids', v_changed_ids);
  end if;
  if p_kind <> 'options' then raise exception 'Tipo de plan no admitido.'; end if;
  if nullif(btrim(p_payload->>'name'), '') is null then raise exception 'Indica un nombre para la dieta.'; end if;
  if p_payload->>'status' not in ('draft','active','archived') then raise exception 'Estado de dieta inválido.'; end if;
  if p_payload->>'status' = 'active' and v_from > current_date then
    raise exception 'Guarda las dietas futuras como borrador y actívalas al empezar.';
  end if;
  if p_plan_id is not null then
    select * into v_plan from public.diet_plans
    where id = p_plan_id and coach_id = p_coach_id and client_id = p_client_id for update;
    if not found then raise exception 'Dieta no encontrada.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or v_plan.updated_at is distinct from p_expected_updated_at then
      raise exception 'La dieta cambió desde la última lectura. Vuelve a leer get_diet_plan.';
    end if;
  else
    if jsonb_typeof(p_payload->'meals') is distinct from 'array' then raise exception 'Indica las comidas de la dieta.'; end if;
  end if;
  if p_payload->>'status' = 'active' then
    with archived as (
      update public.diet_plans set status = 'archived', effective_to = current_date
      where coach_id = p_coach_id and client_id = p_client_id and status = 'active' and id is distinct from p_plan_id
      returning id
    ) select coalesce(array_agg(id), '{}') into v_changed_ids from archived;
  end if;
  if p_plan_id is null then
    insert into public.diet_plans (coach_id, client_id, name, type, status, effective_from, effective_to, notes, meals)
    values (p_coach_id, p_client_id, p_payload->>'name', 'options', p_payload->>'status', v_from, v_to,
      p_payload->>'notes', p_payload->'legacy_meals') returning * into v_plan;
  else
    update public.diet_plans set name = p_payload->>'name', status = p_payload->>'status',
      effective_from = v_from, effective_to = v_to, notes = p_payload->>'notes',
      meals = case when p_payload ? 'legacy_meals' then p_payload->'legacy_meals' else meals end
    where id = p_plan_id and coach_id = p_coach_id and client_id = p_client_id returning * into v_plan;
  end if;

  if jsonb_typeof(p_payload->'meals') = 'array' then
    if jsonb_array_length(p_payload->'meals') not between 1 and 28 then raise exception 'Número de comidas inválido.'; end if;
    -- Libera temporalmente los índices únicos para permitir reordenar IDs.
    -- Los índices originales quedan recuperables como -order_index-1.
    update public.diet_meals set order_index = -order_index - 1 where diet_plan_id = v_plan.id;
    update public.diet_meal_options set order_index = -order_index - 1 where diet_plan_id = v_plan.id;
    update public.diet_meal_items set order_index = -order_index - 1 where diet_plan_id = v_plan.id;
    for v_meal in select value from jsonb_array_elements(p_payload->'meals') loop
      v_mid := (v_meal->>'id')::uuid;
      v_order := (v_meal->>'order_index')::integer;
      if v_mid is not null and not exists (select 1 from public.diet_meals where id = v_mid and diet_plan_id = v_plan.id) then
        raise exception 'La comida indicada no pertenece a esta dieta.' using errcode = '42501';
      end if;
      if v_mid is null then
        select id into v_mid from public.diet_meals where diet_plan_id = v_plan.id
          and day_type = v_meal->>'day_type' and order_index = -v_order - 1;
      end if;
      v_mid := coalesce(v_mid, gen_random_uuid());
      if v_mid = any(v_meal_ids) then raise exception 'Comida repetida.'; end if;
      v_meal_ids := array_append(v_meal_ids, v_mid);
      insert into public.diet_meals (id, coach_id, client_id, plan_id, diet_plan_id, name, day_type, order_index,
        target_kcal, target_protein_g, target_carbs_g, target_fat_g)
      values (v_mid, p_coach_id, p_client_id, v_plan.id, v_plan.id, v_meal->>'name', v_meal->>'day_type', v_order,
        (v_meal->'target'->>'kcal')::numeric, (v_meal->'target'->>'protein_g')::numeric,
        (v_meal->'target'->>'carbs_g')::numeric, (v_meal->'target'->>'fat_g')::numeric)
      on conflict (id) do update set name = excluded.name, day_type = excluded.day_type, order_index = excluded.order_index,
        target_kcal = excluded.target_kcal, target_protein_g = excluded.target_protein_g,
        target_carbs_g = excluded.target_carbs_g, target_fat_g = excluded.target_fat_g;
      if jsonb_array_length(v_meal->'options') not between 1 and 10 then raise exception 'Número de opciones inválido.'; end if;
      for v_option in select value from jsonb_array_elements(v_meal->'options') loop
        v_oid := (v_option->>'id')::uuid;
        v_order := (v_option->>'order_index')::integer;
        if v_oid is not null and not exists (select 1 from public.diet_meal_options where id = v_oid and meal_id = v_mid) then
          raise exception 'La opción indicada no pertenece a esta comida.' using errcode = '42501';
        end if;
        if v_oid is null then
          select id into v_oid from public.diet_meal_options where meal_id = v_mid and order_index = -v_order - 1;
        end if;
        v_oid := coalesce(v_oid, gen_random_uuid());
        if v_oid = any(v_option_ids) then raise exception 'Opción repetida.'; end if;
        v_option_ids := array_append(v_option_ids, v_oid);
        insert into public.diet_meal_options (id, coach_id, client_id, plan_id, diet_plan_id, meal_id, diet_meal_id, title, name, notes, order_index)
        values (v_oid, p_coach_id, p_client_id, v_plan.id, v_plan.id, v_mid, v_mid, v_option->>'name', v_option->>'name', v_option->>'notes', v_order)
        on conflict (id) do update set title = excluded.title, name = excluded.name, notes = excluded.notes, order_index = excluded.order_index;
        if jsonb_array_length(v_option->'items') not between 1 and 20 then raise exception 'Número de alimentos inválido.'; end if;
        for v_item in select value from jsonb_array_elements(v_option->'items') loop
          v_count := v_count + 1;
          if v_count > 800 then raise exception 'Demasiados alimentos en la dieta.'; end if;
          v_iid := (v_item->>'id')::uuid;
          v_order := (v_item->>'order_index')::integer;
          if v_iid is not null and not exists (select 1 from public.diet_meal_items where id = v_iid and option_id = v_oid) then
            raise exception 'El alimento indicado no pertenece a esta opción.' using errcode = '42501';
          end if;
          if v_iid is null then
            select id into v_iid from public.diet_meal_items where option_id = v_oid and order_index = -v_order - 1;
          end if;
          v_iid := coalesce(v_iid, gen_random_uuid());
          if v_iid = any(v_item_ids) then raise exception 'Alimento repetido.'; end if;
          v_item_ids := array_append(v_item_ids, v_iid);
          v_food := null;
          v_grams := (v_item->>'quantity_g')::numeric;
          if nullif(v_item->>'food_id','') is not null then
            select * into v_food from public.foods where id = (v_item->>'food_id')::uuid;
            if not found then raise exception 'Alimento no disponible en el catálogo.' using errcode = '42501'; end if;
            if v_grams is null or v_grams <= 0 or v_grams > 10000 then raise exception 'Cantidad de alimento inválida.'; end if;
          end if;
          insert into public.diet_meal_items (id, coach_id, client_id, plan_id, diet_plan_id, meal_id, option_id, diet_meal_option_id,
            item_type, food_name, quantity, unit, details, order_index, food_id, quantity_g,
            kcal, protein_g, carbs_g, fat_g, alternative_group, is_alternative, equivalence_basis)
          values (v_iid, p_coach_id, p_client_id, v_plan.id, v_plan.id, v_mid, v_oid, v_oid,
            coalesce(v_item->>'item_type','food'), v_item->>'name', (v_item->>'quantity_value')::numeric, v_item->>'quantity_unit',
            v_item->>'notes', v_order, v_food.id, v_grams,
            round(v_food.kcal * v_grams / v_food.serving_size_g, 1), round(v_food.protein_g * v_grams / v_food.serving_size_g, 1),
            round(v_food.carbs_g * v_grams / v_food.serving_size_g, 1), round(v_food.fat_g * v_grams / v_food.serving_size_g, 1),
            (v_item->>'alternative_group')::integer, coalesce((v_item->>'is_alternative')::boolean,false), v_item->>'equivalence_basis')
          on conflict (id) do update set item_type = excluded.item_type, food_name = excluded.food_name,
            quantity = excluded.quantity, unit = excluded.unit, details = excluded.details, order_index = excluded.order_index,
            food_id = excluded.food_id, quantity_g = excluded.quantity_g, kcal = excluded.kcal,
            protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
            alternative_group = excluded.alternative_group, is_alternative = excluded.is_alternative, equivalence_basis = excluded.equivalence_basis;
        end loop;
      end loop;
    end loop;
    if exists (select 1 from public.diet_choice_logs l join public.diet_meals m on m.id = l.diet_meal_id
      where m.diet_plan_id = v_plan.id and (not m.id = any(v_meal_ids)
        or (l.chosen_option_id is not null and not l.chosen_option_id = any(v_option_ids)))) then
      raise exception 'Hay registros del atleta en comidas u opciones que intentas quitar. Crea una dieta nueva para conservar el histórico.';
    end if;
    delete from public.diet_meal_items where diet_plan_id = v_plan.id and not id = any(v_item_ids);
    delete from public.diet_meal_options where diet_plan_id = v_plan.id and not id = any(v_option_ids);
    delete from public.diet_meals where diet_plan_id = v_plan.id and not id = any(v_meal_ids);
  end if;
  return pg_catalog.to_jsonb(v_plan) || jsonb_build_object('replaced_plan_ids', v_changed_ids);
end;
$function$;

revoke all on function public.save_nexttrain_nutrition_plan(text, uuid, uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_nexttrain_nutrition_plan(text, uuid, uuid, uuid, jsonb, timestamptz) to authenticated;

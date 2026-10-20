-- «Hoy» en la zona del espacio de trabajo también en SQL. No se aplica automáticamente.
--
-- create_nexttrain_strength_program y save_nexttrain_nutrition_plan usaban current_date,
-- que en Supabase es el día en UTC. Entre las 00:00 y las 02:00 en España rechazaban un
-- programa o una dieta activos que empezaban hoy, y la dieta archivada se cerraba con el
-- día anterior. El MCP ya calcula «hoy» con coaches.timezone (todayIn en shared.ts).

-- Día actual en la zona del espacio; sin zona o con una zona desconocida, Europe/Madrid,
-- igual que la app (src/data/billing.ts) y el MCP.
create or replace function public.nexttrain_coach_today(p_coach_id uuid)
returns date
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_zone text;
begin
  select nullif(pg_catalog.btrim(c.timezone), '') into v_zone from public.coaches c where c.id = p_coach_id;
  begin
    return (pg_catalog.now() at time zone coalesce(v_zone, 'Europe/Madrid'))::date;
  exception when invalid_parameter_value then
    return (pg_catalog.now() at time zone 'Europe/Madrid')::date;
  end;
end;
$function$;

revoke all on function public.nexttrain_coach_today(uuid) from public, anon;
grant execute on function public.nexttrain_coach_today(uuid) to authenticated;

-- Se parchea la definición instalada en lugar de copiarla entera, como en
-- 20261012143804_mcp_nutrition_macro_concurrency_fix.sql. Así sirve tanto con la versión
-- de create_nexttrain_strength_program de esta rama como con la de la biblioteca de
-- ejercicios (20261016090000), si ya está aplicada. Si el texto esperado no aparece el
-- número de veces previsto, la migración falla sin cambiar nada; si ya está parcheada,
-- no hace nada.
do $patch$
declare
  v_target record;
  v_definition text;
  v_occurrences integer;
begin
  for v_target in
    select * from (values
      ('public.create_nexttrain_strength_program(uuid,uuid,jsonb)',
        'v_from > current_date', 'v_from > public.nexttrain_coach_today(p_coach_id)', 1),
      ('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)',
        'v_from > current_date', 'v_from > public.nexttrain_coach_today(p_coach_id)', 1),
      ('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)',
        'effective_to = current_date', 'effective_to = public.nexttrain_coach_today(p_coach_id)', 1)
    ) as t(signature, old_text, new_text, expected)
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_target.signature::regprocedure);
    v_occurrences := (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_target.old_text, '')))
      / pg_catalog.length(v_target.old_text);
    if v_occurrences = 0 and pg_catalog.strpos(v_definition, v_target.new_text) > 0 then
      raise notice '% ya usa nexttrain_coach_today.', v_target.signature;
      continue;
    end if;
    if v_occurrences <> v_target.expected then
      raise exception 'En % se esperaban % apariciones de «%» y hay %.', v_target.signature, v_target.expected, v_target.old_text, v_occurrences;
    end if;
    execute pg_catalog.replace(v_definition, v_target.old_text, v_target.new_text);
  end loop;

  -- Ninguna de las dos funciones debe seguir usando current_date.
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.create_nexttrain_strength_program(uuid,uuid,jsonb)'::regprocedure), 'current_date') > 0
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)'::regprocedure), 'current_date') > 0 then
    raise exception 'Queda current_date en las funciones del MCP.';
  end if;
end;
$patch$;

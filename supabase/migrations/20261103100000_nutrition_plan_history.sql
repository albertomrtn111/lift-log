-- Historial de planes de nutrición (macros y dieta por opciones).
-- Un plan sustituido por otro queda cerrado con sus fechas reales, la hora en
-- que se sustituyó (archived_at) y el motivo del cambio que escribió el coach
-- en el plan nuevo (change_note).
-- El peso de cada momento no se copia: la vista lo calcula a partir del
-- registro diario y los check-ins, así se corrige solo si el atleta apunta el
-- peso tarde.
--
-- Macros: el plan vigente se sigue decidiendo por fechas. Uno sustituido el
-- mismo día que empezó queda con effective_to = effective_from - 1 (cero días),
-- así ninguna consulta por fechas lo considera vigente.

-- 1. Columnas nuevas ---------------------------------------------------------
alter table public.macro_plans
  add column if not exists archived_at timestamptz,
  add column if not exists change_note text;

alter table public.diet_plans
  add column if not exists archived_at timestamptz,
  add column if not exists change_note text;

comment on column public.macro_plans.archived_at is 'Cuándo lo sustituyó otro plan. Null = no sustituido.';
comment on column public.macro_plans.change_note is 'Motivo del cambio que escribió el coach al crear este plan.';
comment on column public.diet_plans.archived_at is 'Cuándo pasó a status = archived.';
comment on column public.diet_plans.change_note is 'Motivo del cambio que escribió el coach al crear esta dieta.';

-- 2. Dietas: archived_at sigue al estado, se archiven desde la app o el MCP ----
create or replace function public.diet_plans_track_archived_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and (tg_op = 'INSERT' or old.status is distinct from 'archived') then
    new.archived_at := coalesce(new.archived_at, pg_catalog.now());
  elsif new.status <> 'archived' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_diet_plans_archived_at on public.diet_plans;
create trigger trg_diet_plans_archived_at
before insert or update of status on public.diet_plans
for each row execute function public.diet_plans_track_archived_at();

-- 3. Rellenar lo que ya existe -------------------------------------------------
-- Macros: hasta ahora un plan nuevo creado desde la app no cerraba el anterior
-- y se quedaban varios abiertos. Cada plan seguido de otro posterior queda
-- sustituido y, si se solapa con el siguiente, termina el día anterior.
with ordered as (
  select id, lead(effective_from) over w as next_from, lead(created_at) over w as next_created_at
  from public.macro_plans
  window w as (partition by coach_id, client_id order by effective_from, created_at, id)
)
update public.macro_plans m
set archived_at = coalesce(m.archived_at, o.next_created_at),
    effective_to = case
      when m.effective_to is null or m.effective_to >= o.next_from then o.next_from - 1
      else m.effective_to
    end
from ordered o
where m.id = o.id and o.next_from is not null;

update public.diet_plans
set archived_at = coalesce(updated_at, effective_to::timestamptz, created_at)
where status = 'archived' and archived_at is null;

-- 4. save_nexttrain_nutrition_plan --------------------------------------------
-- Se parchea la definición instalada, como en 20261016180000. Cambios:
--  * los planes de cero días (sustituidos el mismo día) no cuentan como solape;
--  * con replace_same_day = true (la app al pulsar «Nuevo») un plan que empieza
--    el mismo día se sustituye en vez de dar error; el MCP no lo envía;
--  * el plan cerrado recibe archived_at;
--  * change_note se guarda en el plan nuevo (macros y dietas).
do $patch$
declare
  v_signature constant text := 'public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)';
  v_target record;
  v_definition text;
  v_occurrences integer;
begin
  v_definition := pg_catalog.pg_get_functiondef(v_signature::regprocedure);
  if pg_catalog.strpos(v_definition, 'replace_same_day') > 0 then
    raise notice '% ya guarda el historial.', v_signature;
    return;
  end if;
  for v_target in
    select * from (values
      (E'        and id is distinct from p_plan_id\n        and effective_from <= coalesce(v_to, ''infinity''::date)',
       E'        and id is distinct from p_plan_id\n        and coalesce(effective_to, ''infinity''::date) >= effective_from\n        and effective_from <= coalesce(v_to, ''infinity''::date)'),
      ('if p_plan_id is not null or v_other.effective_from >= v_from then',
       'if p_plan_id is not null or v_other.effective_from > v_from or (v_other.effective_from = v_from and not coalesce((p_payload->>''replace_same_day'')::boolean, false)) then'),
      ('update public.macro_plans set effective_to = v_from - 1 where id = v_other.id;',
       'update public.macro_plans set effective_to = v_from - 1, archived_at = pg_catalog.now() where id = v_other.id;'),
      ('notes, day_type_config, effective_from, effective_to)',
       'notes, day_type_config, effective_from, effective_to, change_note)'),
      ('v_from, v_to) returning * into v_macro;',
       'v_from, v_to, nullif(btrim(p_payload->>''change_note''), '''')) returning * into v_macro;'),
      ('insert into public.diet_plans (coach_id, client_id, name, type, status, effective_from, effective_to, notes, meals)',
       'insert into public.diet_plans (coach_id, client_id, name, type, status, effective_from, effective_to, notes, meals, change_note)'),
      ('p_payload->>''notes'', p_payload->''legacy_meals'') returning * into v_plan;',
       'p_payload->>''notes'', p_payload->''legacy_meals'', nullif(btrim(p_payload->>''change_note''), '''')) returning * into v_plan;')
    ) as t(old_text, new_text)
  loop
    v_occurrences := (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_target.old_text, '')))
      / pg_catalog.length(v_target.old_text);
    if v_occurrences <> 1 then
      raise exception 'En % se esperaba una aparición de «%» y hay %.', v_signature, v_target.old_text, v_occurrences;
    end if;
    v_definition := pg_catalog.replace(v_definition, v_target.old_text, v_target.new_text);
  end loop;
  execute v_definition;
end;
$patch$;

-- 5. Peso del atleta en una fecha ---------------------------------------------
-- El peso registrado más cercano entre 10 días antes y 2 después de la fecha:
-- primero el registro diario y, si no hay, la media del check-in.
create or replace function public.client_weight_near(p_client_id uuid, p_date date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select w.kg from (
    select cm.weight_kg as kg, cm.metric_date as d, 0 as pri
    from public.client_metrics cm
    where cm.client_id = p_client_id and cm.weight_kg > 0
      and cm.metric_date between p_date - 10 and p_date + 2
    union all
    select coalesce(c.weight_avg_kg, c.weight_kg), coalesce(c.submitted_at::date, c.period_end), 1
    from public.checkins c
    where c.client_id = p_client_id and coalesce(c.weight_avg_kg, c.weight_kg) > 0
      and coalesce(c.submitted_at::date, c.period_end) between p_date - 10 and p_date + 2
  ) w
  order by w.pri, abs(w.d - p_date), w.d desc
  limit 1
$$;

revoke all on function public.client_weight_near(uuid, date) from public, anon;
grant execute on function public.client_weight_near(uuid, date) to authenticated;

-- 6. Vista unificada del historial --------------------------------------------
-- security_invoker: respeta las RLS de macro_plans y diet_plans.
-- status: active (vigente hoy), scheduled (empieza más adelante) o archived.
-- Los borradores de dieta no forman parte del historial.
create or replace view public.nutrition_plan_history
with (security_invoker = true) as
with plans as (
  select
    'macros'::text as kind, m.id, m.coach_id, m.client_id, m.name,
    m.effective_from, m.effective_to, m.archived_at, m.change_note, m.notes,
    case
      when m.effective_from > public.nexttrain_coach_today(m.coach_id) then 'scheduled'
      when m.effective_to is null or m.effective_to >= public.nexttrain_coach_today(m.coach_id) then 'active'
      else 'archived'
    end as status,
    m.kcal, m.protein_g, m.carbs_g, m.fat_g, m.steps,
    case when m.day_type_config like '{%' then m.day_type_config::jsonb end as day_type_config,
    null::integer as meals_count,
    m.created_at
  from public.macro_plans m
  union all
  select
    'options'::text, d.id, d.coach_id, d.client_id, d.name,
    d.effective_from, d.effective_to, d.archived_at, d.change_note, d.notes,
    d.status,
    null, null, null, null, null, null,
    (select count(*)::integer from public.diet_meals dm where dm.diet_plan_id = d.id),
    d.created_at
  from public.diet_plans d
  where d.status <> 'draft'
)
select p.*,
  greatest(0, coalesce(least(p.effective_to, public.nexttrain_coach_today(p.coach_id)), public.nexttrain_coach_today(p.coach_id)) - p.effective_from + 1) as days,
  public.client_weight_near(p.client_id, p.effective_from) as start_weight_kg,
  case when p.status <> 'scheduled' then public.client_weight_near(p.client_id,
    greatest(p.effective_from, least(coalesce(p.effective_to, public.nexttrain_coach_today(p.coach_id)), public.nexttrain_coach_today(p.coach_id))))
  end as end_weight_kg
from plans p;

grant select on public.nutrition_plan_history to authenticated;

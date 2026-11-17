-- Calendario de nutrición: plan base + días planificados.
--
-- El plan base sigue siendo macro_plans (y la dieta por opciones activa). Encima, el
-- coach planifica días concretos agrupados en bloques («Semana maratón», «Volumen
-- noviembre»). Un día planificado manda sobre el plan base solo en su fecha; al
-- acabar el bloque, el atleta vuelve solo al plan base.
--
-- Las progresiones (+100 kcal por semana, subida dentro de la semana) se convierten
-- en días concretos al guardar; el bloque guarda la regla usada para poder regenerarlo.
--
-- nutrition_targets_for() es la regla única para saber qué toca cada día. La usan la
-- app del atleta, el seguimiento del coach, el MCP y Analítica.

-- 1. Bloques -------------------------------------------------------------------
create table if not exists public.nutrition_blocks (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null,
    client_id uuid not null references public.clients(id) on delete cascade,
    name text not null check (length(btrim(name)) between 1 and 160),
    kind text not null default 'days' check (kind in ('week', 'days', 'block')),
    start_date date not null,
    end_date date not null,
    progression jsonb,
    notes text,
    change_note text,
    archived_at timestamptz,
    created_by uuid default auth.uid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_date >= start_date)
);

comment on table public.nutrition_blocks is 'Tramo planificado del calendario de nutrición. Sus días están en nutrition_planned_days.';
comment on column public.nutrition_blocks.kind is 'Cómo se creó: week (una semana), days (días sueltos) o block (varias semanas, con o sin progresión).';
comment on column public.nutrition_blocks.progression is 'Regla usada para generar los días, p. ej. {"type":"weekly","step_kcal":100,"to":"carbs"}.';
comment on column public.nutrition_blocks.archived_at is 'Cuándo dejó de tener días vigentes porque otro bloque los sustituyó o se quitaron.';

create index if not exists idx_nutrition_blocks_client on public.nutrition_blocks (client_id, start_date);

-- 2. Días planificados ---------------------------------------------------------
create table if not exists public.nutrition_planned_days (
    id uuid primary key default gen_random_uuid(),
    block_id uuid not null references public.nutrition_blocks(id) on delete cascade,
    coach_id uuid not null,
    client_id uuid not null references public.clients(id) on delete cascade,
    plan_date date not null,
    kcal integer not null check (kcal between 0 and 20000),
    protein_g integer not null check (protein_g between 0 and 1000),
    carbs_g integer not null check (carbs_g between 0 and 3000),
    fat_g integer not null check (fat_g between 0 and 1000),
    day_type_config jsonb,
    steps integer check (steps between 0 and 100000),
    label text check (length(label) <= 60),
    diet_plan_id uuid references public.diet_plans(id) on delete set null,
    notes text,
    archived_at timestamptz,
    created_at timestamptz not null default now()
);

comment on table public.nutrition_planned_days is 'Objetivos de un día concreto. Manda sobre el plan base en su fecha mientras archived_at sea null.';
comment on column public.nutrition_planned_days.day_type_config is 'Opcional: {"training":{kcal,protein_g,carbs_g,fat_g},"rest":{…}}. Sin él, el día tiene un objetivo único.';

create unique index if not exists uq_nutrition_planned_days_vigente
    on public.nutrition_planned_days (client_id, plan_date) where archived_at is null;
create index if not exists idx_nutrition_planned_days_block on public.nutrition_planned_days (block_id);

drop trigger if exists nutrition_blocks_set_updated_at on public.nutrition_blocks;
create trigger nutrition_blocks_set_updated_at
    before update on public.nutrition_blocks
    for each row execute function public.set_updated_at();

-- 3. Permisos: como macro_plans (equipo que entrena al atleta; el atleta lee lo suyo)
alter table public.nutrition_blocks enable row level security;
alter table public.nutrition_planned_days enable row level security;

drop policy if exists nutrition_blocks_team_all on public.nutrition_blocks;
create policy nutrition_blocks_team_all on public.nutrition_blocks
    for all to authenticated
    using (client_id in (select public.training_client_ids()))
    with check (
        client_id in (select public.training_client_ids())
        and exists (select 1 from public.clients c where c.id = nutrition_blocks.client_id and c.coach_id = nutrition_blocks.coach_id)
    );

drop policy if exists nutrition_blocks_client_select on public.nutrition_blocks;
create policy nutrition_blocks_client_select on public.nutrition_blocks
    for select to authenticated
    using (exists (select 1 from public.clients c where c.id = nutrition_blocks.client_id and c.user_id = auth.uid()));

drop policy if exists nutrition_planned_days_team_all on public.nutrition_planned_days;
create policy nutrition_planned_days_team_all on public.nutrition_planned_days
    for all to authenticated
    using (client_id in (select public.training_client_ids()))
    with check (
        client_id in (select public.training_client_ids())
        and exists (select 1 from public.clients c where c.id = nutrition_planned_days.client_id and c.coach_id = nutrition_planned_days.coach_id)
    );

drop policy if exists nutrition_planned_days_client_select on public.nutrition_planned_days;
create policy nutrition_planned_days_client_select on public.nutrition_planned_days
    for select to authenticated
    using (exists (select 1 from public.clients c where c.id = nutrition_planned_days.client_id and c.user_id = auth.uid()));

-- 4. Dietas «programadas»: solo se usan en días concretos y no sustituyen a la activa
alter table public.diet_plans drop constraint if exists diet_plans_status_check;
alter table public.diet_plans add constraint diet_plans_status_check
    check (status in ('draft', 'active', 'archived', 'scheduled'));

-- 5. Regla única: qué toca cada día ------------------------------------------------
-- Día planificado vigente > plan base vigente en esa fecha. La dieta por opciones:
-- la del día planificado si tiene; si no, la dieta activa (o archivada) que cubre la fecha.
create or replace function public.nutrition_targets_for(p_client_id uuid, p_from date, p_to date)
returns table (
    day date,
    source text,
    block_id uuid,
    block_name text,
    planned_day_id uuid,
    label text,
    kcal integer,
    protein_g integer,
    carbs_g integer,
    fat_g integer,
    steps bigint,
    day_type_config jsonb,
    macro_plan_id uuid,
    diet_plan_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        d::date,
        case when pd.id is not null then 'planned' when mp.id is not null then 'base' else 'none' end,
        pd.block_id,
        b.name,
        pd.id,
        pd.label,
        case when pd.id is not null then pd.kcal else mp.kcal end,
        case when pd.id is not null then pd.protein_g else mp.protein_g end,
        case when pd.id is not null then pd.carbs_g else mp.carbs_g end,
        case when pd.id is not null then pd.fat_g else mp.fat_g end,
        case when pd.id is not null then pd.steps::bigint else mp.steps end,
        case when pd.id is not null then pd.day_type_config
             when mp.day_type_config like '{%' then mp.day_type_config::jsonb end,
        case when pd.id is null then mp.id end,
        coalesce(pd.diet_plan_id, bd.id)
    from pg_catalog.generate_series(p_from, least(p_to, p_from + 400), interval '1 day') as d
    left join public.nutrition_planned_days pd
        on pd.client_id = p_client_id and pd.plan_date = d::date and pd.archived_at is null
    left join public.nutrition_blocks b on b.id = pd.block_id
    left join lateral (
        select m.id, m.kcal, m.protein_g, m.carbs_g, m.fat_g, m.steps, m.day_type_config
        from public.macro_plans m
        where m.client_id = p_client_id
          and m.effective_from <= d::date
          and coalesce(m.effective_to, 'infinity'::date) >= d::date
          and coalesce(m.effective_to, 'infinity'::date) >= m.effective_from
        order by m.effective_from desc, m.created_at desc
        limit 1
    ) mp on true
    left join lateral (
        select dp.id
        from public.diet_plans dp
        where dp.client_id = p_client_id
          and dp.status in ('active', 'archived')
          and coalesce(dp.effective_from, '-infinity'::date) <= d::date
          and coalesce(dp.effective_to, 'infinity'::date) >= d::date
        order by (dp.status = 'active') desc, dp.effective_from desc nulls last, dp.created_at desc
        limit 1
    ) bd on true
    order by 1
$$;

revoke all on function public.nutrition_targets_for(uuid, date, date) from public, anon;
grant execute on function public.nutrition_targets_for(uuid, date, date) to authenticated;

-- 6. Guardar un bloque y sus días de golpe -----------------------------------------
-- p_days: [{date, kcal, protein_g, carbs_g, fat_g, day_type_config?, steps?, label?, diet_plan_id?, notes?}]
-- Con p_block_id se rehace ese bloque: sus días futuros se sustituyen y los pasados se quedan.
-- Si otros bloques ya tienen esas fechas, falla salvo p_replace_conflicts = true; entonces
-- esos días quedan archivados (siguen en el historial).
-- Nunca cambia días pasados.
create or replace function public.save_nutrition_block(
    p_coach_id uuid, p_client_id uuid, p_block_id uuid, p_block jsonb, p_days jsonb,
    p_replace_conflicts boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_today date;
    v_block public.nutrition_blocks%rowtype;
    v_day jsonb;
    v_date date;
    v_cfg jsonb;
    v_part text;
    v_dates date[] := '{}';
    v_conflicts date[];
    v_touched uuid[] := '{}';
    v_archived uuid[] := '{}';
begin
    if auth.uid() is null or not public.is_coach_member(p_coach_id) then
        raise exception 'No tienes acceso de entrenador a este espacio.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id)
       or p_client_id not in (select public.training_client_ids()) then
        raise exception 'Cliente no encontrado en este espacio.' using errcode = '42501';
    end if;
    -- El mismo cerrojo que save_nexttrain_nutrition_plan: un cambio de nutrición por atleta a la vez.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text, 0));
    v_today := public.nexttrain_coach_today(p_coach_id);

    if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 62 then
        raise exception 'Indica entre 1 y 62 días.';
    end if;
    if nullif(btrim(p_block->>'name'), '') is null then
        raise exception 'Ponle un nombre al bloque.';
    end if;

    for v_day in select value from jsonb_array_elements(p_days) loop
        v_date := (v_day->>'date')::date;
        if v_date is null then raise exception 'Cada día necesita su fecha.'; end if;
        if v_date < v_today then raise exception 'No se pueden planificar días pasados (%).', v_date; end if;
        if v_date = any(v_dates) then raise exception 'Fecha repetida: %.', v_date; end if;
        if not (v_day ?& array['kcal', 'protein_g', 'carbs_g', 'fat_g']) then
            raise exception 'Faltan kcal o macros el %.', v_date;
        end if;
        v_cfg := v_day->'day_type_config';
        if v_cfg is not null and jsonb_typeof(v_cfg) <> 'null' then
            if jsonb_typeof(v_cfg) <> 'object' then raise exception 'Entreno/descanso inválido el %.', v_date; end if;
            foreach v_part in array array['training', 'rest'] loop
                if jsonb_typeof(v_cfg->v_part) is distinct from 'object'
                   or not ((v_cfg->v_part) ?& array['kcal', 'protein_g', 'carbs_g', 'fat_g']) then
                    raise exception 'Entreno/descanso incompleto el %.', v_date;
                end if;
            end loop;
        end if;
        if nullif(v_day->>'diet_plan_id', '') is not null and not exists (
            select 1 from public.diet_plans dp
            where dp.id = (v_day->>'diet_plan_id')::uuid and dp.client_id = p_client_id and dp.coach_id = p_coach_id
        ) then
            raise exception 'La dieta indicada no es de este atleta.' using errcode = '42501';
        end if;
        v_dates := array_append(v_dates, v_date);
    end loop;

    if p_block_id is not null then
        select * into v_block from public.nutrition_blocks
        where id = p_block_id and coach_id = p_coach_id and client_id = p_client_id for update;
        if not found then raise exception 'Bloque no encontrado.' using errcode = '42501'; end if;
        update public.nutrition_planned_days set archived_at = pg_catalog.now()
        where block_id = p_block_id and archived_at is null and plan_date >= v_today;
    end if;

    select array_agg(pd.plan_date order by pd.plan_date) into v_conflicts
    from public.nutrition_planned_days pd
    where pd.client_id = p_client_id and pd.archived_at is null and pd.plan_date = any(v_dates);
    if v_conflicts is not null then
        if not coalesce(p_replace_conflicts, false) then
            raise exception 'Ya hay días planificados el %. Confírmalo para sustituirlos.',
                array_to_string(v_conflicts, ', ') using errcode = 'P0001', hint = 'replace_conflicts';
        end if;
        with replaced as (
            update public.nutrition_planned_days set archived_at = pg_catalog.now()
            where client_id = p_client_id and archived_at is null and plan_date = any(v_dates)
            returning block_id
        ) select coalesce(array_agg(distinct block_id), '{}') into v_touched from replaced;
    end if;

    if p_block_id is null then
        insert into public.nutrition_blocks (coach_id, client_id, name, kind, start_date, end_date, progression, notes, change_note)
        values (p_coach_id, p_client_id, btrim(p_block->>'name'), coalesce(p_block->>'kind', 'days'),
            (select min(x) from unnest(v_dates) x), (select max(x) from unnest(v_dates) x),
            case when jsonb_typeof(p_block->'progression') = 'object' then p_block->'progression' end,
            nullif(btrim(p_block->>'notes'), ''), nullif(btrim(p_block->>'change_note'), ''))
        returning * into v_block;
    else
        update public.nutrition_blocks set
            name = btrim(p_block->>'name'),
            kind = coalesce(p_block->>'kind', kind),
            progression = case when jsonb_typeof(p_block->'progression') = 'object' then p_block->'progression' else progression end,
            notes = nullif(btrim(p_block->>'notes'), ''),
            change_note = coalesce(nullif(btrim(p_block->>'change_note'), ''), change_note),
            archived_at = null
        where id = p_block_id returning * into v_block;
    end if;

    insert into public.nutrition_planned_days (block_id, coach_id, client_id, plan_date, kcal, protein_g, carbs_g, fat_g,
        day_type_config, steps, label, diet_plan_id, notes)
    select v_block.id, p_coach_id, p_client_id, (e->>'date')::date,
        round((e->>'kcal')::numeric)::integer, round((e->>'protein_g')::numeric)::integer,
        round((e->>'carbs_g')::numeric)::integer, round((e->>'fat_g')::numeric)::integer,
        case when jsonb_typeof(e->'day_type_config') = 'object' then e->'day_type_config' end,
        nullif(e->>'steps', '')::integer, nullif(btrim(e->>'label'), ''),
        nullif(e->>'diet_plan_id', '')::uuid, nullif(btrim(e->>'notes'), '')
    from jsonb_array_elements(p_days) e;

    -- Fechas reales de cada bloque tocado; el que se queda sin días vigentes, archivado.
    v_touched := array_append(v_touched, v_block.id);
    update public.nutrition_blocks b set
        start_date = s.first_day,
        end_date = s.last_day
    from (
        select block_id, min(plan_date) first_day, max(plan_date) last_day
        from public.nutrition_planned_days where block_id = any(v_touched) and archived_at is null group by block_id
    ) s where b.id = s.block_id;
    with emptied as (
        update public.nutrition_blocks b set archived_at = pg_catalog.now()
        where b.id = any(v_touched) and b.id <> v_block.id and b.archived_at is null
          and not exists (select 1 from public.nutrition_planned_days pd where pd.block_id = b.id and pd.archived_at is null)
        returning b.id
    ) select coalesce(array_agg(id), '{}') into v_archived from emptied;

    select * into v_block from public.nutrition_blocks where id = v_block.id;
    return pg_catalog.to_jsonb(v_block) || jsonb_build_object(
        'days', (select count(*) from public.nutrition_planned_days where block_id = v_block.id and archived_at is null),
        'replaced_dates', coalesce(to_jsonb(v_conflicts), '[]'::jsonb),
        'archived_block_ids', to_jsonb(v_archived));
end;
$function$;

revoke all on function public.save_nutrition_block(uuid, uuid, uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_nutrition_block(uuid, uuid, uuid, jsonb, jsonb, boolean) to authenticated;

-- 7. Volver al plan base unos días -------------------------------------------------
-- Archiva los días planificados de esas fechas (los pasados no se tocan). Un bloque que
-- se queda sin días vigentes también se archiva.
create or replace function public.clear_nutrition_planned_days(p_coach_id uuid, p_client_id uuid, p_dates date[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
    v_today date;
    v_cleared date[];
    v_blocks uuid[];
    v_archived uuid[];
begin
    if auth.uid() is null or not public.is_coach_member(p_coach_id) then
        raise exception 'No tienes acceso de entrenador a este espacio.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id)
       or p_client_id not in (select public.training_client_ids()) then
        raise exception 'Cliente no encontrado en este espacio.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_coach_id::text || ':' || p_client_id::text, 0));
    v_today := public.nexttrain_coach_today(p_coach_id);

    with cleared as (
        update public.nutrition_planned_days set archived_at = pg_catalog.now()
        where client_id = p_client_id and coach_id = p_coach_id and archived_at is null
          and plan_date = any(p_dates) and plan_date >= v_today
        returning plan_date, block_id
    ) select array_agg(plan_date order by plan_date), array_agg(distinct block_id) into v_cleared, v_blocks from cleared;

    with emptied as (
        update public.nutrition_blocks b set archived_at = pg_catalog.now()
        where b.id = any(coalesce(v_blocks, '{}')) and b.archived_at is null
          and not exists (select 1 from public.nutrition_planned_days pd where pd.block_id = b.id and pd.archived_at is null)
        returning b.id
    ) select coalesce(array_agg(id), '{}') into v_archived from emptied;

    update public.nutrition_blocks b set start_date = s.first_day, end_date = s.last_day
    from (
        select block_id, min(plan_date) first_day, max(plan_date) last_day
        from public.nutrition_planned_days where block_id = any(coalesce(v_blocks, '{}')) and archived_at is null group by block_id
    ) s where b.id = s.block_id;

    return jsonb_build_object('cleared_dates', coalesce(to_jsonb(v_cleared), '[]'::jsonb),
        'archived_block_ids', to_jsonb(v_archived));
end;
$function$;

revoke all on function public.clear_nutrition_planned_days(uuid, uuid, date[]) from public, anon;
grant execute on function public.clear_nutrition_planned_days(uuid, uuid, date[]) to authenticated;

-- 8. Historial: los bloques entran en la línea de tiempo --------------------------
-- Se rehace la vista de 20261103100000 con una columna más (planned_days) y la rama
-- de bloques. Las dietas programadas no salen sueltas: van dentro de su bloque.
drop view if exists public.nutrition_plan_history;
create view public.nutrition_plan_history
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
        null::integer as planned_days,
        m.created_at
    from public.macro_plans m
    union all
    select
        'options'::text, d.id, d.coach_id, d.client_id, d.name,
        d.effective_from, d.effective_to, d.archived_at, d.change_note, d.notes,
        d.status,
        null, null, null, null, null, null,
        (select count(*)::integer from public.diet_meals dm where dm.diet_plan_id = d.id),
        null,
        d.created_at
    from public.diet_plans d
    where d.status not in ('draft', 'scheduled')
    union all
    select
        'block'::text, b.id, b.coach_id, b.client_id, b.name,
        b.start_date, b.end_date, b.archived_at, b.change_note, b.notes,
        case
            when b.archived_at is not null then 'archived'
            when b.start_date > public.nexttrain_coach_today(b.coach_id) then 'scheduled'
            when b.end_date >= public.nexttrain_coach_today(b.coach_id) then 'active'
            else 'archived'
        end,
        null, null, null, null, null, null,
        null,
        (select count(*)::integer from public.nutrition_planned_days pd where pd.block_id = b.id and pd.archived_at is null),
        b.created_at
    from public.nutrition_blocks b
)
select p.*,
    greatest(0, coalesce(least(p.effective_to, public.nexttrain_coach_today(p.coach_id)), public.nexttrain_coach_today(p.coach_id)) - p.effective_from + 1) as days,
    public.client_weight_near(p.client_id, p.effective_from) as start_weight_kg,
    case when p.status <> 'scheduled' then public.client_weight_near(p.client_id,
        greatest(p.effective_from, least(coalesce(p.effective_to, public.nexttrain_coach_today(p.coach_id)), public.nexttrain_coach_today(p.coach_id))))
    end as end_weight_kg
from plans p;

grant select on public.nutrition_plan_history to authenticated;

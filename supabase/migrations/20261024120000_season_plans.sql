-- Plan de temporada: objetivo de volumen por semana y disciplina, previo a las
-- sesiones. El coach decide primero "semana 12: 3 h correr, 5 h bici,
-- descarga" y después rellena la semana en Planificación.
--
-- Solo guarda el objetivo. Lo programado y lo realizado se calculan en la app
-- desde cardio_sessions, strava_activities y scheduled_strength_sessions, con
-- la misma clasificación de disciplina que el resto de vistas
-- (src/lib/cardio/discipline.js), para que las cifras cuadren con Progreso.
--
-- Acceso: solo el equipo del coach (is_coach_member), como client_events.
-- Las tablas hijas heredan el permiso de su temporada.

create table if not exists public.season_plans (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    start_date date not null check (extract(isodow from start_date) = 1),
    end_date date not null,
    target_event_id uuid references public.client_events(id) on delete set null,
    primary_unit text not null default 'time' check (primary_unit in ('time', 'distance')),
    disciplines text[] not null default array['run', 'bike', 'swim', 'strength']
        check (disciplines <@ array['run', 'bike', 'swim', 'strength', 'other'] and cardinality(disciplines) > 0),
    status text not null default 'active' check (status in ('draft', 'active', 'archived')),
    notes text,
    created_by uuid default auth.uid() references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_date >= start_date + 6)
);

comment on table public.season_plans is
    'Temporada de un atleta: objetivos de volumen por semana y disciplina (season_weeks, season_week_targets).';
comment on column public.season_plans.primary_unit is
    'time: objetivo en minutos (comparable entre disciplinas); distance: en km, para planes solo de carrera. La fuerza siempre en sesiones.';

-- Una sola temporada activa por atleta: la que leen Planificación y Progreso
create unique index if not exists season_plans_one_active_per_client
    on public.season_plans (client_id) where status = 'active';

create index if not exists idx_season_plans_coach_client
    on public.season_plans (coach_id, client_id, start_date desc);

create table if not exists public.season_phases (
    id uuid primary key default gen_random_uuid(),
    season_plan_id uuid not null references public.season_plans(id) on delete cascade,
    name text not null,
    phase_type text not null check (phase_type in ('base', 'construccion', 'especifico', 'taper', 'competicion', 'transicion')),
    start_date date not null,
    end_date date not null,
    focus text,
    sort_order smallint not null default 0,
    check (end_date >= start_date)
);

create index if not exists idx_season_phases_plan
    on public.season_phases (season_plan_id, start_date);

create table if not exists public.season_weeks (
    id uuid primary key default gen_random_uuid(),
    season_plan_id uuid not null references public.season_plans(id) on delete cascade,
    week_start date not null check (extract(isodow from week_start) = 1),
    week_type text not null default 'carga' check (week_type in ('carga', 'descarga', 'test', 'competicion', 'transicion')),
    notes text,
    unique (season_plan_id, week_start)
);

create table if not exists public.season_week_targets (
    id uuid primary key default gen_random_uuid(),
    season_week_id uuid not null references public.season_weeks(id) on delete cascade,
    discipline text not null check (discipline in ('run', 'bike', 'swim', 'strength', 'other')),
    target_minutes integer check (target_minutes >= 0),
    target_km numeric(6, 1) check (target_km >= 0),
    target_sessions smallint check (target_sessions >= 0),
    intensity_split jsonb,
    unique (season_week_id, discipline)
);

comment on column public.season_week_targets.intensity_split is
    'Reparto opcional de intensidad en %, p. ej. {"low":80,"mid":5,"high":15}.';

drop trigger if exists season_plans_set_updated_at on public.season_plans;
create trigger season_plans_set_updated_at
    before update on public.season_plans
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.season_plans enable row level security;
alter table public.season_phases enable row level security;
alter table public.season_weeks enable row level security;
alter table public.season_week_targets enable row level security;

drop policy if exists "season_plans_coach_select" on public.season_plans;
create policy "season_plans_coach_select"
    on public.season_plans for select
    using (public.is_coach_member(coach_id));

drop policy if exists "season_plans_coach_insert" on public.season_plans;
create policy "season_plans_coach_insert"
    on public.season_plans for insert
    with check (
        public.is_coach_member(coach_id)
        and exists (
            select 1 from public.clients c
            where c.id = season_plans.client_id and c.coach_id = season_plans.coach_id
        )
    );

drop policy if exists "season_plans_coach_update" on public.season_plans;
create policy "season_plans_coach_update"
    on public.season_plans for update
    using (public.is_coach_member(coach_id))
    with check (
        public.is_coach_member(coach_id)
        and exists (
            select 1 from public.clients c
            where c.id = season_plans.client_id and c.coach_id = season_plans.coach_id
        )
    );

drop policy if exists "season_plans_coach_delete" on public.season_plans;
create policy "season_plans_coach_delete"
    on public.season_plans for delete
    using (public.is_coach_member(coach_id));

drop policy if exists "season_phases_coach_all" on public.season_phases;
create policy "season_phases_coach_all"
    on public.season_phases for all
    using (exists (
        select 1 from public.season_plans sp
        where sp.id = season_phases.season_plan_id and public.is_coach_member(sp.coach_id)
    ))
    with check (exists (
        select 1 from public.season_plans sp
        where sp.id = season_phases.season_plan_id and public.is_coach_member(sp.coach_id)
    ));

drop policy if exists "season_weeks_coach_all" on public.season_weeks;
create policy "season_weeks_coach_all"
    on public.season_weeks for all
    using (exists (
        select 1 from public.season_plans sp
        where sp.id = season_weeks.season_plan_id and public.is_coach_member(sp.coach_id)
    ))
    with check (exists (
        select 1 from public.season_plans sp
        where sp.id = season_weeks.season_plan_id and public.is_coach_member(sp.coach_id)
    ));

drop policy if exists "season_week_targets_coach_all" on public.season_week_targets;
create policy "season_week_targets_coach_all"
    on public.season_week_targets for all
    using (exists (
        select 1 from public.season_weeks sw
        join public.season_plans sp on sp.id = sw.season_plan_id
        where sw.id = season_week_targets.season_week_id and public.is_coach_member(sp.coach_id)
    ))
    with check (exists (
        select 1 from public.season_weeks sw
        join public.season_plans sp on sp.id = sw.season_plan_id
        where sw.id = season_week_targets.season_week_id and public.is_coach_member(sp.coach_id)
    ));

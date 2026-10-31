-- Analítica: tableros (analytics_pages) y gráficos (analytics_widgets) que arma el
-- coach. Un gráfico es siempre métrica + eje + desglose + filtros + visual; las
-- métricas y sus cálculos viven en código (src/lib/analytics/), aquí solo se
-- guarda la configuración. Los datos se siguen leyendo con la RLS de cada tabla.
--
-- Acceso: solo el equipo del coach (is_coach_member), como season_plans.

create table if not exists public.analytics_pages (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    name text not null check (length(trim(name)) > 0),
    scope text not null default 'custom' check (scope in ('portfolio', 'athlete', 'custom')),
    is_system boolean not null default false,
    is_home boolean not null default false,
    default_filters jsonb not null default '{}'::jsonb,
    sort_order smallint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (id, coach_id)
);

comment on table public.analytics_pages is
    'Tableros de Analítica. is_system: tableros de ejemplo creados por la app (Cartera, Atleta), editables pero no borrables.';
comment on column public.analytics_pages.default_filters is
    'Filtros del tablero: {"period":"12w","from":null,"to":null,"status":"active","athleteIds":[],"athleteMode":"all"|"single"}.';

create unique index if not exists analytics_pages_one_home_per_coach
    on public.analytics_pages (coach_id) where is_home;

create index if not exists idx_analytics_pages_coach
    on public.analytics_pages (coach_id, sort_order);

create table if not exists public.analytics_widgets (
    id uuid primary key default gen_random_uuid(),
    page_id uuid not null,
    coach_id uuid not null,
    title text not null default '',
    metric_key text not null,
    visual text not null check (visual in ('kpi', 'line', 'bar', 'heatmap', 'scatter', 'table')),
    dimensions text[] not null default '{}',
    filters jsonb not null default '{}'::jsonb,
    options jsonb not null default '{}'::jsonb,
    layout jsonb not null default '{"w":6,"h":"md"}'::jsonb,
    sort_order smallint not null default 0,
    created_by text not null default 'coach' check (created_by in ('coach', 'system', 'nextia')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (page_id, coach_id) references public.analytics_pages (id, coach_id) on delete cascade
);

comment on column public.analytics_widgets.dimensions is
    'Eje y desglose: {eje} o {eje, desglose}. Eje: day, week, month, athlete, exercise, muscle_group, discipline o none.';
comment on column public.analytics_widgets.filters is
    'Filtros propios del gráfico, que se suman a los del tablero: {"exerciseKeys":[],"groups":[],"disciplines":[],"athleteIds":[]}.';
comment on column public.analytics_widgets.options is
    'Opciones del visual: métricas extra de tabla, segunda métrica de dispersión, comparación con el periodo anterior, top N.';

create index if not exists idx_analytics_widgets_page
    on public.analytics_widgets (page_id, sort_order);

drop trigger if exists analytics_pages_set_updated_at on public.analytics_pages;
create trigger analytics_pages_set_updated_at
    before update on public.analytics_pages
    for each row execute function public.set_updated_at();

drop trigger if exists analytics_widgets_set_updated_at on public.analytics_widgets;
create trigger analytics_widgets_set_updated_at
    before update on public.analytics_widgets
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.analytics_pages enable row level security;
alter table public.analytics_widgets enable row level security;

drop policy if exists "analytics_pages_coach_select" on public.analytics_pages;
create policy "analytics_pages_coach_select"
    on public.analytics_pages for select
    using (public.is_coach_member(coach_id));

drop policy if exists "analytics_pages_coach_insert" on public.analytics_pages;
create policy "analytics_pages_coach_insert"
    on public.analytics_pages for insert
    with check (public.is_coach_member(coach_id));

drop policy if exists "analytics_pages_coach_update" on public.analytics_pages;
create policy "analytics_pages_coach_update"
    on public.analytics_pages for update
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

-- Los tableros de ejemplo no se borran
drop policy if exists "analytics_pages_coach_delete" on public.analytics_pages;
create policy "analytics_pages_coach_delete"
    on public.analytics_pages for delete
    using (public.is_coach_member(coach_id) and not is_system);

drop policy if exists "analytics_widgets_coach_all" on public.analytics_widgets;
create policy "analytics_widgets_coach_all"
    on public.analytics_widgets for all
    using (public.is_coach_member(coach_id))
    with check (public.is_coach_member(coach_id));

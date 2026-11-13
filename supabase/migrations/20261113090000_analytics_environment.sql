-- Analítica en Sala: los tableros de Sala van aparte de los de Online.
--
-- Cada tablero dice de qué entorno es. Los que ya existen son de Online. Cada entorno tiene su
-- tablero de inicio. En Sala no se siembran ejemplos: se empieza con un tablero vacío.

alter table public.analytics_pages
    add column environment text not null default 'online' check (environment in ('online', 'sala'));

drop index if exists public.analytics_pages_one_home_per_coach;
create unique index analytics_pages_one_home_per_coach
    on public.analytics_pages (coach_id, environment) where is_home;

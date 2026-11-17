-- Días de fuerza quitados por el coach en una semana concreta del programa.
--
-- Una fila = «este día del programa no toca en la semana N». Las demás semanas no cambian.
-- Deshacer es borrar la fila: el día vuelve a aparecer tal como estaba.
-- La semana es la del programa (1 = la semana del lunes de effective_from), igual que
-- training_exercise_logs.week_index y la pantalla Fuerza del atleta.

create table if not exists public.strength_day_week_skips (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches(id) on delete cascade,
    client_id uuid not null references public.clients(id) on delete cascade,
    program_id uuid not null references public.training_programs(id) on delete cascade,
    day_id uuid not null references public.training_days(id) on delete cascade,
    week_index integer not null check (week_index >= 1 and week_index <= 52),
    reason text check (reason is null or char_length(reason) <= 300),
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint strength_day_week_skips_unique unique (program_id, day_id, week_index)
);

create index if not exists strength_day_week_skips_client_idx
    on public.strength_day_week_skips (client_id, program_id);

alter table public.strength_day_week_skips enable row level security;

-- Equipo del espacio (propietario y profesionales): lee y escribe los de sus atletas.
-- Al escribir, el programa tiene que ser de ese mismo cliente y espacio, y el día de ese programa.
create policy strength_day_week_skips_team_all on public.strength_day_week_skips
    for all to authenticated
    using (client_id in (select public.training_client_ids()))
    with check (
        client_id in (select public.training_client_ids())
        and exists (
            select 1
            from public.training_programs p
            join public.training_days d on d.program_id = p.id
            where p.id = strength_day_week_skips.program_id
              and d.id = strength_day_week_skips.day_id
              and p.client_id = strength_day_week_skips.client_id
              and p.coach_id = strength_day_week_skips.coach_id
        )
    );

-- Atleta: solo lee los suyos (para no mostrar el día). No puede crearlos ni quitarlos.
create policy strength_day_week_skips_client_select on public.strength_day_week_skips
    for select to authenticated
    using (exists (
        select 1 from public.clients c
        where c.id = strength_day_week_skips.client_id
          and (c.user_id = auth.uid() or c.auth_user_id = auth.uid())
          and c.status = 'active'
    ));

revoke all on public.strength_day_week_skips from anon;

-- Modo Sala F5: evaluaciones de rendimiento.
--
-- Una evaluación por cliente y fecha con los resultados de cada test ({clave: número}), los datos del
-- deportista que acompañan a las evaluaciones (deporte, posición, peso…) y los tests propios u ocultos
-- de cada espacio. Lo ve y lo toca quien lleva el entrenamiento del cliente.

create or replace function public.evaluation_results_valid(p_results jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
    select jsonb_typeof(p_results) = 'object'
       and (select count(*) from jsonb_object_keys(p_results)) <= 200
       and coalesce((
           select bool_and(e.key ~ '^[a-z0-9_]{1,60}$' and jsonb_typeof(e.value) = 'number')
           from jsonb_each(p_results) e
       ), true);
$$;

create table public.client_evaluations (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    eval_date date,
    label text check (length(label) <= 80),
    results jsonb not null default '{}'::jsonb check (public.evaluation_results_valid(results)),
    source text not null default 'manual' check (source in ('manual', 'excel')),
    version integer not null default 1,
    created_by uuid default auth.uid() references public.profiles (id) on delete set null,
    updated_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index client_evaluations_client_idx on public.client_evaluations (client_id, eval_date);
create unique index client_evaluations_one_per_day on public.client_evaluations (client_id, eval_date)
    where eval_date is not null;

create table public.client_evaluation_profiles (
    client_id uuid primary key references public.clients (id) on delete cascade,
    coach_id uuid not null references public.coaches (id) on delete cascade,
    info jsonb not null default '{}'::jsonb check (jsonb_typeof(info) = 'object'),
    test_names jsonb not null default '{}'::jsonb check (jsonb_typeof(test_names) = 'object'),
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now()
);

create table public.evaluation_tests (
    coach_id uuid not null references public.coaches (id) on delete cascade,
    test_key text not null check (test_key ~ '^[a-z0-9_]{1,60}$'),
    name text check (length(name) between 1 and 80),
    unit text check (length(unit) <= 12),
    direction smallint not null default 0 check (direction in (-1, 0, 1)),
    group_name text check (length(group_name) <= 60),
    hidden boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (coach_id, test_key)
);

-- El cliente es de ese espacio y quien entra lleva su entrenamiento.
create or replace function public.evaluation_client_ok(p_coach_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
    select exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = p_coach_id)
       and public.can_see_training(p_client_id);
$$;

-- Profesionales del espacio (sin recepción): los que pueden crear o esconder tests.
create or replace function public.evaluation_staff(p_coach_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
    select exists (
        select 1 from public.coach_memberships cm
        where cm.coach_id = p_coach_id and cm.user_id = auth.uid() and cm.status = 'active'
          and cm.role in ('owner', 'admin', 'coach')
    );
$$;

alter table public.client_evaluations enable row level security;
alter table public.client_evaluation_profiles enable row level security;
alter table public.evaluation_tests enable row level security;

create policy client_evaluations_team on public.client_evaluations
    for all to authenticated
    using (public.evaluation_client_ok(coach_id, client_id))
    with check (public.evaluation_client_ok(coach_id, client_id));

create policy client_evaluation_profiles_team on public.client_evaluation_profiles
    for all to authenticated
    using (public.evaluation_client_ok(coach_id, client_id))
    with check (public.evaluation_client_ok(coach_id, client_id));

create policy evaluation_tests_read on public.evaluation_tests
    for select to authenticated using (public.is_coach_member(coach_id));
create policy evaluation_tests_write on public.evaluation_tests
    for all to authenticated
    using (public.evaluation_staff(coach_id))
    with check (public.evaluation_staff(coach_id));

revoke all on public.client_evaluations, public.client_evaluation_profiles, public.evaluation_tests from anon;

-- Guardar resultados de una fecha: lo nuevo se suma a lo que ya hubiera ese día (lo nuevo manda).
create or replace function public.evaluation_merge(
    p_client_id uuid,
    p_eval_date date,
    p_results jsonb,
    p_source text default 'manual'
)
returns public.client_evaluations
language plpgsql
security definer
set search_path to ''
as $$
declare
    v_coach_id uuid;
    v_row public.client_evaluations;
begin
    select c.coach_id into v_coach_id from public.clients c where c.id = p_client_id;
    if v_coach_id is null or not public.can_see_training(p_client_id) then
        raise exception 'No tienes acceso a este cliente.' using errcode = '42501';
    end if;
    if not public.evaluation_results_valid(coalesce(p_results, '{}'::jsonb)) then
        raise exception 'Hay resultados que no son números.' using errcode = '22023';
    end if;
    if p_eval_date is not null and (p_eval_date > current_date + 1 or p_eval_date < date '2000-01-01') then
        raise exception 'La fecha de la evaluación no es válida.' using errcode = '22023';
    end if;

    if p_eval_date is not null then
        select * into v_row from public.client_evaluations e
        where e.client_id = p_client_id and e.eval_date = p_eval_date
        for update;
    end if;

    if v_row.id is null then
        insert into public.client_evaluations (coach_id, client_id, eval_date, results, source, created_by, updated_by)
        values (v_coach_id, p_client_id, p_eval_date, coalesce(p_results, '{}'::jsonb),
                case when p_source = 'excel' then 'excel' else 'manual' end, auth.uid(), auth.uid())
        returning * into v_row;
    else
        update public.client_evaluations e
        set results = e.results || coalesce(p_results, '{}'::jsonb),
            version = e.version + 1,
            updated_by = auth.uid(),
            updated_at = now()
        where e.id = v_row.id
        returning * into v_row;
    end if;
    return v_row;
end;
$$;

revoke all on function public.evaluation_merge(uuid, date, jsonb, text) from public, anon;
grant execute on function public.evaluation_merge(uuid, date, jsonb, text) to authenticated;
revoke all on function public.evaluation_client_ok(uuid, uuid) from public, anon;
revoke all on function public.evaluation_staff(uuid) from public, anon;
grant execute on function public.evaluation_client_ok(uuid, uuid) to authenticated;
grant execute on function public.evaluation_staff(uuid) to authenticated;

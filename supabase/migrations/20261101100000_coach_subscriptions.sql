-- Suscripción del coach a NexTrain: prueba gratis de 30 días con Pro (sin tarjeta)
-- y cobro con Stripe Billing. Además se aplica el límite de atletas activos del plan.
-- Cambios aditivos salvo create_coach_workspace, que gana un parámetro con valor por
-- defecto (las llamadas con los cinco parámetros de antes siguen funcionando).

-- 1. Estado de la suscripción de cada espacio. Solo lo escribe el servidor
--    (service role: alta, Checkout y webhooks de Stripe); los miembros lo leen.
create table if not exists public.coach_subscriptions (
    coach_id uuid primary key references public.coaches(id) on delete cascade,
    -- comped = acceso sin pagar concedido a mano (espacios anteriores a la prueba, acuerdos)
    -- trialing sin stripe_subscription_id = prueba gratis de la app, sin tarjeta
    -- el resto son los estados de la suscripción en Stripe
    status text not null,
    -- Plan que paga o pagará (en la prueba, el elegido en el registro)
    plan public.subscription_tier not null,
    billing_cycle public.billing_cycle not null default 'monthly',
    trial_ends_at timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    stripe_customer_id text unique,
    stripe_subscription_id text unique,
    stripe_price_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint coach_subscriptions_status_check check (status in (
        'comped', 'trialing', 'active', 'past_due', 'unpaid', 'canceled',
        'incomplete', 'incomplete_expired', 'paused'
    ))
);

alter table public.coach_subscriptions enable row level security;

drop policy if exists coach_subscriptions_select_member on public.coach_subscriptions;
create policy coach_subscriptions_select_member
    on public.coach_subscriptions
    for select
    to authenticated
    using (public.is_coach_member(coach_id));

-- Supabase da por defecto todos los privilegios (también TRUNCATE, que ignora RLS)
revoke all on public.coach_subscriptions from anon, authenticated;
grant select on public.coach_subscriptions to authenticated;

-- Los espacios que ya existen siguen con acceso, sin prueba ni cobro
insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle)
select c.id, 'comped', c.subscription_tier, c.billing_cycle
from public.coaches c
on conflict (coach_id) do nothing;

-- ...y sin límite de atletas, como hasta ahora (nadie lo aplicaba). Si un día
-- cambian de plan, trg_sync_coach_max_active_clients vuelve a fijar el del plan.
update public.coaches c
set max_active_clients = null
where exists (
    select 1 from public.coach_subscriptions s
    where s.coach_id = c.id and s.status = 'comped'
);

-- 2. El plan del espacio (y con él el límite de atletas) solo lo cambia el servidor.
--    Hasta ahora un admin del espacio podía cambiar subscription_tier desde la API.
create or replace function public.protect_coach_plan_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user in ('anon', 'authenticated') and (
        new.subscription_tier is distinct from old.subscription_tier
        or new.billing_cycle is distinct from old.billing_cycle
        or new.max_active_clients is distinct from old.max_active_clients
    ) then
        raise exception 'El plan solo se cambia desde la suscripción' using errcode = '42501';
    end if;
    return new;
end;
$$;

-- Va antes que trg_sync_coach_max_active_clients (los BEFORE se ejecutan por orden alfabético)
drop trigger if exists trg_protect_coach_plan_columns on public.coaches;
create trigger trg_protect_coach_plan_columns
    before update on public.coaches
    for each row execute function public.protect_coach_plan_columns();

-- 3. Límite de atletas activos del plan (coaches.max_active_clients; NULL = sin límite).
--    La atleta de ejemplo no cuenta. Cubre altas, reactivaciones y cualquier otra vía (MCP).
create or replace function public.enforce_coach_client_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_limit integer;
    v_active integer;
begin
    if new.status is distinct from 'active' or coalesce(new.is_sample, false) then
        return new;
    end if;
    if tg_op = 'UPDATE'
        and old.status = 'active'
        and old.coach_id = new.coach_id
        and not coalesce(old.is_sample, false) then
        return new;
    end if;

    select c.max_active_clients into v_limit
    from public.coaches c
    where c.id = new.coach_id;

    if v_limit is null then
        return new;
    end if;

    -- Dos altas a la vez no pueden pasarse del límite
    perform pg_advisory_xact_lock(hashtext('coach_client_limit:' || new.coach_id::text));

    select count(*) into v_active
    from public.clients cl
    where cl.coach_id = new.coach_id
      and cl.status = 'active'
      and not coalesce(cl.is_sample, false)
      and cl.id is distinct from new.id;

    if v_active >= v_limit then
        raise exception 'Has llegado al límite de % atletas activos de tu plan.', v_limit
            using errcode = 'P0001', hint = 'athlete_limit';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_coach_client_limit on public.clients;
create trigger trg_enforce_coach_client_limit
    before insert or update of status, coach_id, is_sample on public.clients
    for each row execute function public.enforce_coach_client_limit();

-- 4. El alta del espacio arranca la prueba: Pro durante p_trial_days días.
--    p_subscription_tier es el plan elegido en el registro, el que se ofrecerá al pagar.
drop function if exists public.create_coach_workspace(uuid, text, text, text, integer);

create or replace function public.create_coach_workspace(
    p_user_id uuid,
    p_name text,
    p_subscription_tier text,
    p_billing_cycle text,
    p_max_active_clients integer,
    p_trial_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_coach_id uuid;
begin
    -- Evita dos espacios si /welcome se carga dos veces a la vez
    perform pg_advisory_xact_lock(hashtext('create_coach_workspace:' || p_user_id::text));

    select m.coach_id into v_coach_id
    from public.coach_memberships m
    where m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner', 'coach')
    order by m.created_at
    limit 1;

    if v_coach_id is not null then
        return v_coach_id;
    end if;

    -- max_active_clients lo fija trg_sync_coach_max_active_clients según el plan
    insert into public.coaches (
        name, created_by, subscription_tier, billing_cycle, max_active_clients, onboarding_state
    )
    values (
        coalesce(nullif(trim(p_name), ''), 'Mi espacio'),
        p_user_id,
        'pro'::public.subscription_tier,
        p_billing_cycle::public.billing_cycle,
        p_max_active_clients,
        jsonb_build_object('guided', true, 'welcome_pending', true, 'created_via', 'signup')
    )
    returning id into v_coach_id;

    insert into public.coach_memberships (coach_id, user_id, role, status)
    values (v_coach_id, p_user_id, 'owner', 'active');

    insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle, trial_ends_at)
    values (
        v_coach_id,
        'trialing',
        p_subscription_tier::public.subscription_tier,
        p_billing_cycle::public.billing_cycle,
        now() + make_interval(days => greatest(coalesce(p_trial_days, 30), 1))
    );

    return v_coach_id;
end;
$$;

revoke execute on function public.create_coach_workspace(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.create_coach_workspace(uuid, text, text, text, integer, integer) to service_role;

select pg_notify('pgrst', 'reload schema');

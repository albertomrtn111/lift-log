-- Modo Sala F0-2: qué incluye cada plan, excepciones por espacio y coach_subscriptions.
--
-- Solo añade. coach_subscriptions es la misma tabla que trae la prueba gratis con Stripe,
-- que la crea con «if not exists», pero sin nada de Stripe ni límites nuevos: aquí sirve para
-- que un espacio pueda estar en cortesía. Los límites no se aplican todavía en ningún sitio.

create table if not exists public.coach_subscriptions (
    coach_id uuid primary key references public.coaches(id) on delete cascade,
    -- comped = acceso sin pagar concedido a mano (espacios anteriores a la prueba, acuerdos)
    status text not null,
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
create policy coach_subscriptions_select_member on public.coach_subscriptions
    for select to authenticated
    using (public.is_coach_member(coach_id));

-- Supabase da por defecto todos los privilegios (también TRUNCATE, que ignora RLS).
revoke all on public.coach_subscriptions from anon, authenticated;
grant select on public.coach_subscriptions to authenticated;

-- Los espacios que ya existen siguen con su acceso, sin cobro.
insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle)
select c.id, 'comped', c.subscription_tier, c.billing_cycle
from public.coaches c
on conflict (coach_id) do nothing;

-- Funciones y límites de cada plan. limit_value null = sin límite.
create table public.plan_features (
    plan public.subscription_tier not null,
    feature text not null,
    enabled boolean not null default false,
    limit_value integer check (limit_value is null or limit_value >= 0),
    primary key (plan, feature)
);

alter table public.plan_features enable row level security;

create policy plan_features_read on public.plan_features
    for select to authenticated
    using (true);

revoke all on public.plan_features from anon, authenticated;
grant select on public.plan_features to authenticated;

insert into public.plan_features (plan, feature, enabled, limit_value) values
    ('starter', 'studio_mode', false, null),
    ('starter', 'team', false, null),
    ('starter', 'branding', false, null),
    ('starter', 'white_label', false, null),
    ('starter', 'max_members', true, 1),
    ('starter', 'max_active_clients', true, 20),
    ('pro', 'studio_mode', false, null),
    ('pro', 'team', false, null),
    ('pro', 'branding', false, null),
    ('pro', 'white_label', false, null),
    ('pro', 'max_members', true, 1),
    ('pro', 'max_active_clients', true, 75),
    ('studio', 'studio_mode', true, null),
    ('studio', 'team', true, null),
    ('studio', 'branding', true, null),
    ('studio', 'white_label', false, null),
    ('studio', 'max_members', true, null),
    ('studio', 'max_active_clients', true, 250),
    ('concierge', 'studio_mode', true, null),
    ('concierge', 'team', true, null),
    ('concierge', 'branding', true, null),
    ('concierge', 'white_label', false, null),
    ('concierge', 'max_members', true, null),
    ('concierge', 'max_active_clients', true, null);

-- Excepciones por espacio: un extra contratado, una prueba o un cliente especial.
create table public.coach_feature_overrides (
    coach_id uuid not null references public.coaches(id) on delete cascade,
    feature text not null,
    enabled boolean not null,
    limit_value integer check (limit_value is null or limit_value >= 0),
    reason text,
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (coach_id, feature)
);

alter table public.coach_feature_overrides enable row level security;

create policy coach_feature_overrides_select_member on public.coach_feature_overrides
    for select to authenticated
    using (public.is_coach_member(coach_id));

revoke all on public.coach_feature_overrides from anon, authenticated;
grant select on public.coach_feature_overrides to authenticated;

-- ¿Este espacio tiene esta función? Manda la excepción vigente; si no, su plan.
create or replace function public.coach_has_feature(p_coach_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
    select coalesce(
        (select o.enabled from public.coach_feature_overrides o
         where o.coach_id = p_coach_id and o.feature = p_feature
           and (o.expires_at is null or o.expires_at > now())),
        (select pf.enabled
         from public.coaches c
         left join public.coach_subscriptions s on s.coach_id = c.id
         join public.plan_features pf
           on pf.plan = coalesce(s.plan, c.subscription_tier) and pf.feature = p_feature
         where c.id = p_coach_id),
        false
    );
$$;

-- Límite de una función para este espacio. null = sin límite.
create or replace function public.coach_feature_limit(p_coach_id uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
    select case
        when exists (
            select 1 from public.coach_feature_overrides o
            where o.coach_id = p_coach_id and o.feature = p_feature
              and (o.expires_at is null or o.expires_at > now())
        ) then (
            select o.limit_value from public.coach_feature_overrides o
            where o.coach_id = p_coach_id and o.feature = p_feature
        )
        else (
            select pf.limit_value
            from public.coaches c
            left join public.coach_subscriptions s on s.coach_id = c.id
            join public.plan_features pf
              on pf.plan = coalesce(s.plan, c.subscription_tier) and pf.feature = p_feature
            where c.id = p_coach_id
        )
    end;
$$;

revoke all on function public.coach_has_feature(uuid, text) from public, anon;
revoke all on function public.coach_feature_limit(uuid, text) from public, anon;
grant execute on function public.coach_has_feature(uuid, text) to authenticated, service_role;
grant execute on function public.coach_feature_limit(uuid, text) to authenticated, service_role;

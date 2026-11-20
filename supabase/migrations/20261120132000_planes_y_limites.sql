-- NXT-129: el plan de cada espacio y sus límites se aplican en la base.
--
-- 1. El plan con el que trabaja un espacio sale de coach_subscriptions, y solo mientras la
--    suscripción da acceso (los mismos estados que la prueba gratis con Stripe). Un espacio
--    sin fila (creado a mano por el servidor) sigue con coaches.subscription_tier.
-- 2. Las columnas del plan en coaches (subscription_tier, billing_cycle, max_active_clients y
--    created_by) solo las cambia el servidor, y los espacios solo se crean desde el servidor.
-- 3. create_coach_workspace crea siempre la suscripción: prueba de 30 días con el plan elegido.
-- 4. Límite de atletas activos y de miembros del equipo, comprobado al dar de alta, reactivar,
--    aceptar una invitación o por cualquier otra vía (MCP, agenda, importaciones).
--
-- Compatible con la web desplegada: la web no cambia esas columnas ni crea espacios con la
-- sesión del coach (usa la clave de servicio o funciones de la base). Las cortesías (comped)
-- siguen sin límite de atletas, como hasta ahora, salvo que una excepción diga otra cosa.

-- 1. ¿La suscripción da acceso? Igual que subscriptionAccess() de la web:
--    cortesía, activa, cobro pendiente (Stripe reintenta) y prueba en curso.
create or replace function public.coach_subscription_allows(
    p_status text,
    p_trial_ends_at timestamptz,
    p_stripe_subscription_id text
)
returns boolean
language sql
stable
set search_path to 'public'
as $$
    select case p_status
        when 'comped' then true
        when 'active' then true
        when 'past_due' then true
        -- Con suscripción en Stripe, Stripe decide cuándo acaba la prueba
        when 'trialing' then p_stripe_subscription_id is not null or coalesce(p_trial_ends_at > now(), false)
        else false
    end;
$$;

-- Plan con el que trabaja el espacio; null si su suscripción no da acceso (cancelada,
-- prueba caducada, impagada...). Sin fila de suscripción, el plan guardado en coaches.
create or replace function public.coach_effective_plan(p_coach_id uuid)
returns public.subscription_tier
language sql
stable
security definer
set search_path to 'public'
as $$
    select case
        when s.coach_id is null then c.subscription_tier
        when public.coach_subscription_allows(s.status, s.trial_ends_at, s.stripe_subscription_id) then s.plan
    end
    from public.coaches c
    left join public.coach_subscriptions s on s.coach_id = c.id
    where c.id = p_coach_id;
$$;

revoke all on function public.coach_subscription_allows(text, timestamptz, text) from public, anon;
grant execute on function public.coach_subscription_allows(text, timestamptz, text) to authenticated, service_role;
revoke all on function public.coach_effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.coach_effective_plan(uuid) to service_role;

-- 2. Funciones del plan: manda la excepción vigente; si no, el plan efectivo.
--    Una suscripción cancelada o caducada ya no da funciones.
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
         from (select public.coach_effective_plan(p_coach_id) as plan) e
         join public.plan_features pf on pf.plan = e.plan and pf.feature = p_feature),
        false
    );
$$;

-- Límite de una función para este espacio. null = sin límite; 0 si la suscripción no da acceso.
-- Las cortesías no tienen límite de atletas activos (como hasta ahora); una excepción manda.
create or replace function public.coach_feature_limit(p_coach_id uuid, p_feature text)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_override_limit integer;
    v_plan public.subscription_tier;
    v_status text;
begin
    select o.limit_value into v_override_limit
    from public.coach_feature_overrides o
    where o.coach_id = p_coach_id and o.feature = p_feature
      and (o.expires_at is null or o.expires_at > now());
    if found then
        return v_override_limit;
    end if;

    v_plan := public.coach_effective_plan(p_coach_id);
    if v_plan is null then
        return 0;
    end if;

    select s.status into v_status from public.coach_subscriptions s where s.coach_id = p_coach_id;
    if p_feature = 'max_active_clients' and v_status = 'comped' then
        return null;
    end if;

    return (
        select pf.limit_value from public.plan_features pf
        where pf.plan = v_plan and pf.feature = p_feature
    );
end;
$$;

revoke all on function public.coach_has_feature(uuid, text) from public, anon;
revoke all on function public.coach_feature_limit(uuid, text) from public, anon;
grant execute on function public.coach_has_feature(uuid, text) to authenticated, service_role;
grant execute on function public.coach_feature_limit(uuid, text) to authenticated, service_role;

-- 3. Las columnas del plan solo las cambia el servidor (clave de servicio o funciones de la base).
--    El resto de columnas (nombre, zona horaria, visibilidad...) se siguen editando igual.
create or replace function public.protect_coach_plan_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
    if current_user in ('anon', 'authenticated') and (
        new.subscription_tier is distinct from old.subscription_tier
        or new.billing_cycle is distinct from old.billing_cycle
        or new.max_active_clients is distinct from old.max_active_clients
        or new.created_by is distinct from old.created_by
    ) then
        raise exception 'El plan del espacio solo se cambia desde la suscripción.' using errcode = '42501';
    end if;
    return new;
end;
$$;

revoke all on function public.protect_coach_plan_columns() from public, anon, authenticated;

-- Va antes que trg_sync_coach_max_active_clients (los BEFORE se ejecutan por orden alfabético)
drop trigger if exists trg_protect_coach_plan_columns on public.coaches;
create trigger trg_protect_coach_plan_columns
    before update on public.coaches
    for each row execute function public.protect_coach_plan_columns();

-- Los espacios se crean desde el servidor: create_coach_workspace (alta) o el panel de salas.
revoke insert on public.coaches from anon, authenticated;

-- 4. El alta crea la suscripción: prueba de 30 días con el plan elegido en el registro.
--    Misma firma que antes: la web desplegada la sigue llamando igual.
create or replace function public.create_coach_workspace(
    p_user_id uuid,
    p_name text,
    p_subscription_tier text,
    p_billing_cycle text,
    p_max_active_clients integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
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
      and m.role in ('owner', 'admin', 'coach')
    order by m.created_at
    limit 1;

    if v_coach_id is not null then
        return v_coach_id;
    end if;

    insert into public.coaches (
        name, created_by, subscription_tier, billing_cycle, max_active_clients, onboarding_state
    )
    values (
        coalesce(nullif(trim(p_name), ''), 'Mi espacio'),
        p_user_id,
        p_subscription_tier::public.subscription_tier,
        p_billing_cycle::public.billing_cycle,
        p_max_active_clients,
        jsonb_build_object('guided', true, 'welcome_pending', true, 'created_via', 'signup')
    )
    returning id into v_coach_id;

    -- Antes que la membresía: el límite de miembros ya cuenta con la suscripción
    insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle, trial_ends_at)
    values (
        v_coach_id,
        'trialing',
        p_subscription_tier::public.subscription_tier,
        p_billing_cycle::public.billing_cycle,
        now() + interval '30 days'
    )
    on conflict (coach_id) do nothing;

    insert into public.coach_memberships (coach_id, user_id, role, status)
    values (v_coach_id, p_user_id, 'owner', 'active');

    return v_coach_id;
end;
$$;

revoke all on function public.create_coach_workspace(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_coach_workspace(uuid, text, text, text, integer) to service_role;

-- Espacios que aún no tengan suscripción: los del alta empiezan su prueba desde que se crearon;
-- el resto quedan en cortesía, con el plan que ya tenían.
insert into public.coach_subscriptions (coach_id, status, plan, billing_cycle, trial_ends_at)
select
    c.id,
    case when c.onboarding_state ->> 'created_via' = 'signup' then 'trialing' else 'comped' end,
    c.subscription_tier,
    c.billing_cycle,
    case when c.onboarding_state ->> 'created_via' = 'signup'
        then coalesce(c.created_at, now()) + interval '30 days' end
from public.coaches c
where not exists (select 1 from public.coach_subscriptions s where s.coach_id = c.id)
on conflict (coach_id) do nothing;

-- 5. Límite de atletas activos del plan. La atleta de ejemplo no cuenta. Cubre altas,
--    reactivaciones y cualquier otra vía. Ve todos los atletas del espacio, no solo los
--    que la persona tiene asignados.
create or replace function public.enforce_coach_client_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

    v_limit := public.coach_feature_limit(new.coach_id, 'max_active_clients');
    if v_limit is null then
        return new;
    end if;

    -- Dos altas a la vez no pueden pasarse del límite
    perform pg_advisory_xact_lock(hashtext('coach_client_limit:' || new.coach_id::text));

    select count(*) into v_active
    from public.clients c
    where c.coach_id = new.coach_id
      and c.status = 'active'
      and not coalesce(c.is_sample, false)
      and c.id is distinct from new.id;

    if v_active >= v_limit then
        if v_limit = 0 and public.coach_effective_plan(new.coach_id) is null then
            raise exception 'La suscripción de este espacio no está activa: no se pueden dar de alta ni reactivar atletas.'
                using errcode = 'P0001', hint = 'subscription_inactive';
        end if;
        raise exception 'Has llegado al límite de atletas activos de tu plan (%).', v_limit
            using errcode = 'P0001', hint = 'athlete_limit', detail = v_limit::text;
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_coach_client_limit() from public, anon, authenticated;

drop trigger if exists trg_enforce_coach_client_limit on public.clients;
create trigger trg_enforce_coach_client_limit
    before insert or update of status, coach_id, is_sample on public.clients
    for each row execute function public.enforce_coach_client_limit();

-- 6. Límite de miembros del equipo (propietario, administradores, profesionales y recepción).
--    Los atletas (rol client) no cuentan. Las invitaciones pendientes las cuenta la web al invitar.
create or replace function public.enforce_coach_member_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_team constant text[] := array['owner', 'admin', 'coach', 'reception'];
    v_limit integer;
    v_active integer;
begin
    if new.status is distinct from 'active' or not (new.role = any (v_team)) then
        return new;
    end if;
    if tg_op = 'UPDATE'
        and old.status = 'active'
        and old.role = any (v_team)
        and old.coach_id = new.coach_id then
        return new;
    end if;

    v_limit := public.coach_feature_limit(new.coach_id, 'max_members');
    if v_limit is null then
        return new;
    end if;

    perform pg_advisory_xact_lock(hashtext('coach_member_limit:' || new.coach_id::text));

    -- Sin contar a la propia persona: al aceptar una invitación su fila puede existir ya
    select count(*) into v_active
    from public.coach_memberships m
    where m.coach_id = new.coach_id
      and m.status = 'active'
      and m.role = any (v_team)
      and m.user_id is distinct from new.user_id;

    if v_active >= v_limit then
        if v_limit = 0 and public.coach_effective_plan(new.coach_id) is null then
            raise exception 'La suscripción de este espacio no está activa: no se pueden añadir miembros al equipo.'
                using errcode = 'P0001', hint = 'subscription_inactive';
        end if;
        raise exception 'Este espacio ha llegado al límite de miembros del equipo de su plan (%).', v_limit
            using errcode = 'P0001', hint = 'member_limit', detail = v_limit::text;
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_coach_member_limit() from public, anon, authenticated;

drop trigger if exists trg_enforce_coach_member_limit on public.coach_memberships;
create trigger trg_enforce_coach_member_limit
    before insert or update of status, role, coach_id on public.coach_memberships
    for each row execute function public.enforce_coach_member_limit();

select pg_notify('pgrst', 'reload schema');

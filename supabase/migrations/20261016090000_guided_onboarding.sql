-- Onboarding guiado del coach y del atleta.
-- Solo cambios aditivos: columnas nuevas con valor por defecto y una función
-- que crea el espacio del coach al entrar por primera vez tras el registro.

-- 1. Coach: respuestas de bienvenida y estado de "Primeros pasos"
alter table public.coaches
    add column if not exists disciplines text[] not null default '{}'::text[],
    add column if not exists expected_athletes text,
    add column if not exists onboarding_state jsonb not null default '{}'::jsonb;

alter table public.coaches
    drop constraint if exists coaches_disciplines_check;
alter table public.coaches
    add constraint coaches_disciplines_check
    check (disciplines <@ array['strength', 'running', 'hybrid', 'nutrition']::text[]);

alter table public.coaches
    drop constraint if exists coaches_expected_athletes_check;
alter table public.coaches
    add constraint coaches_expected_athletes_check
    check (expected_athletes is null or expected_athletes in ('1-10', '11-25', '26-50', '50+'));

-- 2. Atleta de ejemplo: no cuenta en facturación ni en el límite del plan,
--    y nunca dispara emails, avisos ni revisiones automáticas.
alter table public.clients
    add column if not exists is_sample boolean not null default false;

create index if not exists clients_coach_sample_idx
    on public.clients (coach_id)
    where is_sample;

-- 3. Alta automática del espacio del coach.
--    Solo la llama el servidor (service role) desde /welcome. Es idempotente:
--    si el usuario ya es owner/coach activo de un espacio, devuelve ese.
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

    insert into public.coach_memberships (coach_id, user_id, role, status)
    values (v_coach_id, p_user_id, 'owner', 'active');

    return v_coach_id;
end;
$$;

revoke execute on function public.create_coach_workspace(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_coach_workspace(uuid, text, text, text, integer) to service_role;

select pg_notify('pgrst', 'reload schema');

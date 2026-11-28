-- NXT-144: la ficha del atleta (public.clients) se enlaza con su cuenta de Auth
-- solo cuando el email de la cuenta está confirmado.
--
-- Hasta ahora handle_new_auth_user (AFTER INSERT en auth.users) y
-- link_client_on_profile_insert (AFTER INSERT en public.profiles) enlazaban por
-- email al crearse la cuenta, confirmada o no. Desde esta migración:
--   * Al crearse la cuenta solo se enlaza si ya nace confirmada.
--   * Al confirmarse (email_confirmed_at pasa de null a una fecha: enlace de
--     invitación, de confirmación del registro, mágico o de recuperar la
--     contraseña, o alta del panel con email_confirm) enlaza el disparador nuevo
--     on_auth_user_email_confirmed.
--   * El email que cuenta es el de auth.users, no el del perfil.
--   * Nunca se toca una ficha enlazada con una cuenta que existe, ni se cambia
--     un user_id que apunte a otra cuenta. Una ficha cuyo auth_user_id apunta a
--     una cuenta borrada (user_id ya es null por la FK) sí se vuelve a enlazar,
--     como antes.
--   * No deja una cuenta con dos fichas activas (get-user-context espera una):
--     si pasaría, las activas se quedan sin enlazar, como en
--     linkPendingClientForUser. Las de baja se enlazan como antes.
--   * Se excluye la atleta de ejemplo.
-- No mueve ni borra datos y es compatible con el código desplegado.

-- 1. Enlace de las fichas de una cuenta confirmada (solo para los disparadores)
create or replace function public.link_clients_to_confirmed_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_email text;
    v_active_linked integer;
    v_active_new integer;
    v_linked integer;
begin
    select lower(btrim(u.email))
      into v_email
      from auth.users u
     where u.id = p_user_id
       and u.email_confirmed_at is not null;

    if v_email is null or v_email = '' then
        return 0;
    end if;

    -- Fichas activas que la cuenta ya ve (get-user-context: auth_user_id o user_id)
    select count(*)
      into v_active_linked
      from public.clients c
     where c.status = 'active'
       and (c.auth_user_id = p_user_id or c.user_id = p_user_id);

    -- Fichas activas que pasaría a ver
    select count(*)
      into v_active_new
      from public.clients c
     where c.status = 'active'
       and c.user_id is null
       and c.is_sample = false
       and lower(btrim(c.email)) = v_email
       and (c.auth_user_id is null
            or not exists (select 1 from auth.users o where o.id = c.auth_user_id));

    update public.clients c
       set user_id = p_user_id,
           auth_user_id = p_user_id,
           signed_up_at = coalesce(c.signed_up_at, now()),
           invite_status = case
               when c.invite_status in ('pending', 'sent') then 'accepted'
               else c.invite_status
           end,
           -- Como hacía handle_new_auth_user antes de esta migración
           onboarding_status = case
               when c.onboarding_status = 'pending' then 'accepted'
               else c.onboarding_status
           end,
           onboarding_updated_at = now(),
           updated_at = now()
     where lower(btrim(c.email)) = v_email
       and c.is_sample = false
       and (c.auth_user_id is null
            or not exists (select 1 from auth.users o where o.id = c.auth_user_id))
       and (c.user_id is null or c.user_id = p_user_id)
       and (c.status is distinct from 'active'
            or c.user_id = p_user_id
            or v_active_linked + v_active_new <= 1);

    get diagnostics v_linked = row_count;
    return v_linked;
end;
$$;

-- Nadie la llama por la API: solo los disparadores (corren como su dueño)
revoke execute on function public.link_clients_to_confirmed_user(uuid) from public, anon, authenticated, service_role;

-- 2. Alta de la cuenta: crea el perfil como siempre y solo enlaza si ya viene confirmada
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name, created_at, updated_at)
    values (
        new.id,
        lower(new.email),
        coalesce(new.raw_user_meta_data->>'full_name', new.email),
        now(),
        now()
    )
    on conflict (id) do update
        set email = excluded.email,
            updated_at = now();

    if new.email_confirmed_at is not null then
        begin
            perform public.link_clients_to_confirmed_user(new.id);
        exception when others then
            -- Sin enlace la cuenta se crea igual; lo reintenta linkPendingClientForUser
            raise warning 'handle_new_auth_user: no se pudo enlazar la ficha de %: %', new.id, sqlerrm;
        end;
    end if;

    return new;
end;
$$;

-- 3. Perfil nuevo: mismo enlace (email de Auth y solo si está confirmado)
create or replace function public.link_client_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    begin
        perform public.link_clients_to_confirmed_user(new.id);
    exception when others then
        raise warning 'link_client_on_profile_insert: no se pudo enlazar la ficha de %: %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

-- 4. Confirmación del email: enlaza las fichas con ese email
create or replace function public.handle_auth_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    begin
        perform public.link_clients_to_confirmed_user(new.id);
    exception when others then
        -- La confirmación sigue adelante; lo reintenta linkPendingClientForUser
        raise warning 'handle_auth_user_email_confirmed: no se pudo enlazar la ficha de %: %', new.id, sqlerrm;
    end;
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
    after update of email_confirmed_at on auth.users
    for each row
    when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
    execute function public.handle_auth_user_email_confirmed();

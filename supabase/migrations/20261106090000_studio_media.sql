-- Modo Sala F7: enlaces e imágenes por ejercicio y por celda, y consentimiento de imagen.
--
-- Lo de un cliente solo lo ve quien lleva a ese cliente. Sin su consentimiento de imagen no se
-- guarda ninguna foto suya, y retirarlo oculta las que hubiera.

create table public.client_consents (
    client_id uuid not null references public.clients (id) on delete cascade,
    kind text not null check (kind in ('image', 'health')),
    accepted boolean not null,
    source text not null default 'center' check (source in ('center', 'nextrain')),
    recorded_by uuid references public.profiles (id) on delete set null,
    recorded_at timestamptz not null default now(),
    primary key (client_id, kind)
);

create table public.exercise_media (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    catalog_exercise_id uuid not null references public.exercise_catalog (id) on delete cascade,
    -- Sin cliente, es de toda la sala.
    client_id uuid references public.clients (id) on delete cascade,
    kind text not null check (kind in ('youtube', 'link', 'image')),
    url text check (url is null or (url ~ '^https://' and length(url) <= 500)),
    storage_key text,
    title text check (title is null or length(title) <= 120),
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    check ((kind = 'image') = (storage_key is not null)),
    check ((kind = 'image') = (url is null))
);

create index exercise_media_exercise_idx on public.exercise_media (coach_id, catalog_exercise_id);
create index exercise_media_client_idx on public.exercise_media (client_id);

create table public.studio_item_attachments (
    item_id uuid primary key references public.studio_session_items (id) on delete cascade,
    image_key text,
    link_url text check (link_url is null or (link_url ~ '^https://' and length(link_url) <= 500)),
    updated_by uuid references public.profiles (id) on delete set null,
    updated_at timestamptz not null default now()
);

alter table public.client_consents enable row level security;
alter table public.exercise_media enable row level security;
alter table public.studio_item_attachments enable row level security;

create or replace function public.studio_has_image_consent(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce((
        select c.accepted from public.client_consents c
        where c.client_id = p_client_id and c.kind = 'image'
    ), false);
$$;

-- Solo lectura: las escrituras van por las funciones.
create policy client_consents_read on public.client_consents
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy exercise_media_read on public.exercise_media
    for select to authenticated
    using (
        (client_id is null and public.is_coach_member(coach_id))
        or (
            client_id in (select public.training_client_ids())
            and (kind <> 'image' or public.studio_has_image_consent(client_id))
        )
    );

create policy studio_item_attachments_read on public.studio_item_attachments
    for select to authenticated
    using (exists (select 1 from public.studio_session_items i where i.id = item_id));

create or replace function public.studio_set_image_consent(p_client_id uuid, p_accepted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_client(p_client_id);
    insert into public.client_consents (client_id, kind, accepted, recorded_by)
    values (p_client_id, 'image', p_accepted, auth.uid())
    on conflict (client_id, kind) do update
    set accepted = excluded.accepted, recorded_by = excluded.recorded_by, recorded_at = now();
end;
$$;

create or replace function public.studio_add_exercise_media(
    p_coach_id uuid, p_catalog_exercise_id uuid, p_client_id uuid, p_kind text, p_url text, p_storage_key text, p_title text
)
returns public.exercise_media
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_media public.exercise_media%rowtype;
begin
    if not public.is_coach_member(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'No puedes añadir medios en este espacio.' using errcode = '42501';
    end if;
    if p_client_id is not null then
        if public.studio_require_client(p_client_id) <> p_coach_id then
            raise exception 'Ese cliente no es de este espacio.' using errcode = '42501';
        end if;
        if p_kind = 'image' and not public.studio_has_image_consent(p_client_id) then
            raise exception 'Falta el consentimiento de imagen de este cliente.' using errcode = '22023';
        end if;
    end if;
    -- La clave tiene que ser de este espacio: nadie enlaza un archivo de otro.
    if p_kind = 'image' and p_storage_key not like 'studio-media/' || p_coach_id || '/%' then
        raise exception 'Ese archivo no es de este espacio.' using errcode = '22023';
    end if;

    insert into public.exercise_media (coach_id, catalog_exercise_id, client_id, kind, url, storage_key, title, created_by)
    values (p_coach_id, p_catalog_exercise_id, p_client_id, p_kind, p_url, p_storage_key, nullif(btrim(p_title), ''), auth.uid())
    returning * into v_media;
    return v_media;
end;
$$;

-- Cada uno quita lo suyo; el administrador, cualquier cosa de su sala.
create or replace function public.studio_remove_exercise_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_media public.exercise_media%rowtype;
begin
    select * into v_media from public.exercise_media m where m.id = p_media_id;
    if v_media.id is null or not public.is_coach_member(v_media.coach_id)
       or not (v_media.created_by = auth.uid() or public.is_coach_admin(v_media.coach_id)) then
        raise exception 'No puedes quitar este medio.' using errcode = '42501';
    end if;
    delete from public.exercise_media m where m.id = p_media_id;
end;
$$;

create or replace function public.studio_save_item_attachment(p_item_id uuid, p_image_key text, p_link_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_item public.studio_session_items%rowtype;
begin
    select * into v_item from public.studio_session_items i where i.id = p_item_id;
    if v_item.id is null then
        raise exception 'Ejercicio no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_session(v_item.session_id);
    if p_image_key is not null and p_image_key not like 'studio-media/' || v_item.coach_id || '/%' then
        raise exception 'Ese archivo no es de este espacio.' using errcode = '22023';
    end if;
    if p_image_key is not null and v_item.client_id is not null and not public.studio_has_image_consent(v_item.client_id) then
        raise exception 'Falta el consentimiento de imagen de este cliente.' using errcode = '22023';
    end if;

    if p_image_key is null and p_link_url is null then
        delete from public.studio_item_attachments a where a.item_id = p_item_id;
        return;
    end if;
    insert into public.studio_item_attachments (item_id, image_key, link_url, updated_by)
    values (p_item_id, p_image_key, p_link_url, auth.uid())
    on conflict (item_id) do update
    set image_key = excluded.image_key, link_url = excluded.link_url,
        updated_by = excluded.updated_by, updated_at = now();
end;
$$;

revoke all on function public.studio_has_image_consent(uuid) from public, anon;
revoke all on function public.studio_set_image_consent(uuid, boolean) from public, anon;
revoke all on function public.studio_add_exercise_media(uuid, uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.studio_remove_exercise_media(uuid) from public, anon;
revoke all on function public.studio_save_item_attachment(uuid, text, text) from public, anon;

grant execute on function public.studio_has_image_consent(uuid) to authenticated;
grant execute on function public.studio_set_image_consent(uuid, boolean) to authenticated;
grant execute on function public.studio_add_exercise_media(uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.studio_remove_exercise_media(uuid) to authenticated;
grant execute on function public.studio_save_item_attachment(uuid, text, text) to authenticated;

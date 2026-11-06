-- Modo Sala F7: carpeta de vídeos de la sala.
--
-- Un vídeo se guarda una vez y se asigna a uno o varios ejercicios, para toda la sala o para un
-- cliente. Lo que tiene que ver con un cliente exige su consentimiento de imagen. Si lo retira,
-- se oculta, y quien lo lleva puede borrarlo.

create table public.media_assets (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    -- Sin cliente, es de toda la sala.
    client_id uuid references public.clients (id) on delete cascade,
    kind text not null default 'video' check (kind = 'video'),
    storage_key text not null unique,
    thumb_key text,
    title text not null check (length(title) between 1 and 120),
    duration_seconds integer check (duration_seconds >= 0),
    size_bytes bigint not null check (size_bytes > 0),
    mime text not null,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index media_assets_coach_idx on public.media_assets (coach_id, created_at desc);
create index media_assets_client_idx on public.media_assets (client_id);

alter table public.exercise_media
    add column asset_id uuid references public.media_assets (id) on delete cascade,
    drop constraint exercise_media_check,
    drop constraint exercise_media_check1,
    drop constraint exercise_media_kind_check,
    add constraint exercise_media_kind_check check (kind in ('youtube', 'link', 'image', 'video')),
    add constraint exercise_media_source_check check (
        case kind
            when 'image' then storage_key is not null and url is null and asset_id is null
            when 'video' then asset_id is not null and url is null and storage_key is null
            else url is not null and storage_key is null and asset_id is null
        end
    );

create unique index exercise_media_asset_idx on public.exercise_media (asset_id, catalog_exercise_id, client_id) nulls not distinct;

alter table public.media_assets enable row level security;

-- Solo lectura: las escrituras van por las funciones.
create policy media_assets_read on public.media_assets
    for select to authenticated
    using (
        (client_id is null and public.is_coach_member(coach_id))
        or (client_id in (select public.training_client_ids()) and public.studio_has_image_consent(client_id))
    );

drop policy exercise_media_read on public.exercise_media;
create policy exercise_media_read on public.exercise_media
    for select to authenticated
    using (
        (client_id is null and public.is_coach_member(coach_id))
        or (
            client_id in (select public.training_client_ids())
            and (kind not in ('image', 'video') or public.studio_has_image_consent(client_id))
        )
    );

create or replace function public.studio_add_media_asset(
    p_coach_id uuid, p_client_id uuid, p_storage_key text, p_thumb_key text,
    p_title text, p_duration_seconds integer, p_size_bytes bigint, p_mime text
)
returns public.media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_prefix text := 'studio-media/' || p_coach_id || '/' || coalesce(p_client_id, p_coach_id) || '/';
    v_asset public.media_assets%rowtype;
begin
    if not public.coach_has_feature(p_coach_id, 'studio_mode')
       or not public.studio_can_use_media(p_coach_id, coalesce(p_client_id, p_coach_id)) then
        raise exception 'No puedes subir este vídeo: revisa que lleves a este cliente y que conste su consentimiento.' using errcode = '42501';
    end if;
    -- Las claves tienen que ser de esa carpeta: nadie enlaza un archivo de otro.
    if p_storage_key not like v_prefix || '%' or (p_thumb_key is not null and p_thumb_key not like v_prefix || '%') then
        raise exception 'Ese archivo no es de esta carpeta.' using errcode = '22023';
    end if;

    insert into public.media_assets (coach_id, client_id, storage_key, thumb_key, title, duration_seconds, size_bytes, mime, created_by)
    values (p_coach_id, p_client_id, p_storage_key, p_thumb_key, left(btrim(p_title), 120), p_duration_seconds, p_size_bytes, p_mime, auth.uid())
    returning * into v_asset;
    return v_asset;
end;
$$;

-- Cada uno gestiona lo suyo; el administrador, toda la carpeta.
create or replace function public.studio_require_asset_owner(p_asset_id uuid)
returns public.media_assets
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_asset public.media_assets%rowtype;
begin
    select * into v_asset from public.media_assets a where a.id = p_asset_id;
    if v_asset.id is null or not public.studio_can_use_media(v_asset.coach_id, coalesce(v_asset.client_id, v_asset.coach_id))
       or not (v_asset.created_by = auth.uid() or public.is_coach_admin(v_asset.coach_id)) then
        raise exception 'No puedes cambiar este vídeo.' using errcode = '42501';
    end if;
    return v_asset;
end;
$$;

create or replace function public.studio_rename_media_asset(p_asset_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_asset_owner(p_asset_id);
    if btrim(coalesce(p_title, '')) = '' then
        raise exception 'Ponle un nombre.' using errcode = '22023';
    end if;
    update public.media_assets a set title = left(btrim(p_title), 120) where a.id = p_asset_id;
end;
$$;

-- Devuelve los archivos que han dejado de usarse, para borrarlos del almacenamiento.
create or replace function public.studio_remove_media_asset(p_asset_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_asset public.media_assets%rowtype := public.studio_require_asset_owner(p_asset_id);
begin
    delete from public.media_assets a where a.id = p_asset_id;
    return array_remove(array[v_asset.storage_key, v_asset.thumb_key], null);
end;
$$;

create or replace function public.studio_assign_video(p_asset_id uuid, p_catalog_exercise_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_asset public.media_assets%rowtype;
begin
    select * into v_asset from public.media_assets a where a.id = p_asset_id;
    if v_asset.id is null or not public.studio_can_use_media(v_asset.coach_id, coalesce(v_asset.client_id, v_asset.coach_id)) then
        raise exception 'No puedes asignar este vídeo.' using errcode = '42501';
    end if;
    -- El vídeo de un cliente nunca se enseña a otro.
    if v_asset.client_id is not null and p_client_id is distinct from v_asset.client_id then
        raise exception 'Este vídeo es solo de su cliente.' using errcode = '22023';
    end if;
    if p_client_id is not null then
        if public.studio_require_client(p_client_id) <> v_asset.coach_id then
            raise exception 'Ese cliente no es de este espacio.' using errcode = '42501';
        end if;
        if not public.studio_has_image_consent(p_client_id) then
            raise exception 'Falta el consentimiento de imagen de este cliente.' using errcode = '22023';
        end if;
    end if;

    insert into public.exercise_media (coach_id, catalog_exercise_id, client_id, kind, asset_id, created_by)
    values (v_asset.coach_id, p_catalog_exercise_id, p_client_id, 'video', p_asset_id, auth.uid())
    on conflict (asset_id, catalog_exercise_id, client_id) do nothing;
end;
$$;

-- Lo que quedó oculto al retirar el consentimiento.
create or replace function public.studio_count_client_media(p_client_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
begin
    return (select count(*) from public.media_assets a where a.client_id = p_client_id)
        + (select count(*) from public.exercise_media m where m.client_id = p_client_id and m.kind = 'image')
        + (select count(*) from public.studio_item_attachments t
           where t.image_key like 'studio-media/' || v_coach_id || '/' || p_client_id || '/%');
end;
$$;

-- Borra lo oculto y devuelve los archivos. Con el consentimiento vigente no borra nada.
create or replace function public.studio_purge_client_media(p_client_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_client(p_client_id);
    v_prefix text := 'studio-media/' || v_coach_id || '/' || p_client_id || '/%';
    v_keys text[] := '{}';
begin
    if public.studio_has_image_consent(p_client_id) then
        raise exception 'Su consentimiento sigue vigente.' using errcode = '22023';
    end if;

    select v_keys || coalesce(array_agg(k), '{}') into v_keys
    from (
        select a.storage_key as k from public.media_assets a where a.client_id = p_client_id
        union all
        select a.thumb_key from public.media_assets a where a.client_id = p_client_id and a.thumb_key is not null
        union all
        select m.storage_key from public.exercise_media m where m.client_id = p_client_id and m.kind = 'image'
        union all
        select t.image_key from public.studio_item_attachments t where t.image_key like v_prefix
    ) keys;

    delete from public.media_assets a where a.client_id = p_client_id;
    delete from public.exercise_media m where m.client_id = p_client_id and m.kind = 'image';
    delete from public.studio_item_attachments t where t.image_key like v_prefix and t.link_url is null;
    update public.studio_item_attachments t set image_key = null, updated_by = auth.uid(), updated_at = now()
    where t.image_key like v_prefix;
    return v_keys;
end;
$$;

revoke all on function public.studio_add_media_asset(uuid, uuid, text, text, text, integer, bigint, text) from public, anon;
revoke all on function public.studio_require_asset_owner(uuid) from public, anon, authenticated;
revoke all on function public.studio_rename_media_asset(uuid, text) from public, anon;
revoke all on function public.studio_remove_media_asset(uuid) from public, anon;
revoke all on function public.studio_assign_video(uuid, uuid, uuid) from public, anon;
revoke all on function public.studio_count_client_media(uuid) from public, anon;
revoke all on function public.studio_purge_client_media(uuid) from public, anon;

grant execute on function public.studio_add_media_asset(uuid, uuid, text, text, text, integer, bigint, text) to authenticated;
grant execute on function public.studio_rename_media_asset(uuid, text) to authenticated;
grant execute on function public.studio_remove_media_asset(uuid) to authenticated;
grant execute on function public.studio_assign_video(uuid, uuid, uuid) to authenticated;
grant execute on function public.studio_count_client_media(uuid) to authenticated;
grant execute on function public.studio_purge_client_media(uuid) to authenticated;

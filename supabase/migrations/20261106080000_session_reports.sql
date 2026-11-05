-- Modo Sala F6: informe de sesión con enlace privado.
--
-- El informe guarda una foto de los datos al crearlo. Se abre sin cuenta con un código imposible
-- de adivinar, que no caduca y se puede revocar. Sin el consentimiento del cliente no se envía.

alter table public.clients add column report_consent_at timestamptz;

create table public.session_reports (
    id uuid primary key default gen_random_uuid(),
    coach_id uuid not null references public.coaches (id) on delete cascade,
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    code text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    snapshot jsonb not null,
    revoked_at timestamptz,
    dismissed_at timestamptz,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, client_id)
);

create index session_reports_client_idx on public.session_reports (client_id);

create table public.report_deliveries (
    id uuid primary key default gen_random_uuid(),
    report_id uuid not null references public.session_reports (id) on delete cascade,
    channel text not null check (channel in ('whatsapp', 'email', 'link', 'download')),
    recipient text,
    ok boolean not null default true,
    sent_by uuid references public.profiles (id) on delete set null,
    sent_at timestamptz not null default now()
);

create index report_deliveries_report_idx on public.report_deliveries (report_id);

-- Sin datos del visitante: solo cuándo se abrió.
create table public.report_views (
    id bigint generated always as identity primary key,
    report_id uuid not null references public.session_reports (id) on delete cascade,
    viewed_at timestamptz not null default now()
);

create index report_views_report_idx on public.report_views (report_id);

create table public.report_settings (
    coach_id uuid primary key references public.coaches (id) on delete cascade,
    whatsapp_text text,
    email_subject text,
    email_text text,
    notice_hours integer not null default 3 check (notice_hours between 1 and 48),
    default_channel text not null default 'whatsapp' check (default_channel in ('whatsapp', 'email')),
    sections jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.session_reports enable row level security;
alter table public.report_deliveries enable row level security;
alter table public.report_views enable row level security;
alter table public.report_settings enable row level security;

-- Solo lectura: las escrituras van por las funciones.
create policy session_reports_read on public.session_reports
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

create policy report_deliveries_read on public.report_deliveries
    for select to authenticated
    using (exists (select 1 from public.session_reports r where r.id = report_id));

create policy report_views_read on public.report_views
    for select to authenticated
    using (exists (select 1 from public.session_reports r where r.id = report_id));

create policy report_settings_read on public.report_settings
    for select to authenticated
    using (public.is_coach_member(coach_id));

-- Crea el informe o lo regenera. El enlace sigue siendo el mismo.
create or replace function public.studio_save_report(p_session_id uuid, p_client_id uuid, p_snapshot jsonb)
returns public.session_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_session(p_session_id);
    v_report public.session_reports%rowtype;
begin
    perform public.studio_require_client(p_client_id);
    if not exists (
        select 1 from public.studio_sessions s
        where s.id = p_session_id
          and (s.client_id = p_client_id or exists (
              select 1 from public.studio_session_attendance a
              where a.session_id = s.id and a.client_id = p_client_id
          ))
    ) then
        raise exception 'Esa persona no está en esta sesión.' using errcode = '22023';
    end if;

    insert into public.session_reports (coach_id, session_id, client_id, snapshot, created_by)
    values (v_coach_id, p_session_id, p_client_id, p_snapshot, auth.uid())
    on conflict (session_id, client_id) do update
    set snapshot = excluded.snapshot, revoked_at = null, updated_at = now()
    returning * into v_report;
    return v_report;
end;
$$;

create or replace function public.studio_revoke_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_client_id uuid;
begin
    select r.client_id into v_client_id from public.session_reports r where r.id = p_report_id;
    if v_client_id is null then
        raise exception 'Informe no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_client_id);
    update public.session_reports r set revoked_at = now(), updated_at = now() where r.id = p_report_id;
end;
$$;

-- Apunta un envío. Sin consentimiento no se envía nada al cliente.
create or replace function public.studio_record_delivery(p_report_id uuid, p_channel text, p_recipient text, p_ok boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_client_id uuid;
begin
    select r.client_id into v_client_id from public.session_reports r where r.id = p_report_id;
    if v_client_id is null then
        raise exception 'Informe no encontrado.' using errcode = '42501';
    end if;
    perform public.studio_require_client(v_client_id);
    if p_channel in ('whatsapp', 'email') and not exists (
        select 1 from public.clients c where c.id = v_client_id and c.report_consent_at is not null
    ) then
        raise exception 'Falta el consentimiento del cliente para enviarle informes.' using errcode = '22023';
    end if;
    insert into public.report_deliveries (report_id, channel, recipient, ok, sent_by)
    values (p_report_id, p_channel, p_recipient, p_ok, auth.uid());
end;
$$;

create or replace function public.studio_set_report_consent(p_client_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_client(p_client_id);
    update public.clients c
    set report_consent_at = case when p_consent then coalesce(c.report_consent_at, now()) end
    where c.id = p_client_id;
end;
$$;

create or replace function public.studio_dismiss_report_notice(p_session_id uuid, p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_coach_id uuid := public.studio_require_session(p_session_id);
begin
    perform public.studio_require_client(p_client_id);
    insert into public.session_reports (coach_id, session_id, client_id, snapshot, dismissed_at, created_by)
    values (v_coach_id, p_session_id, p_client_id, '{}'::jsonb, now(), auth.uid())
    on conflict (session_id, client_id) do update set dismissed_at = now();
end;
$$;

-- La página pública lee solo esto, por su código. Un enlace revocado no devuelve nada.
create or replace function public.report_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_report public.session_reports%rowtype;
    v_brand jsonb;
    v_coach_name text;
begin
    select * into v_report from public.session_reports r
    where r.code = p_code and r.revoked_at is null and r.snapshot <> '{}'::jsonb;
    if v_report.id is null then
        return null;
    end if;

    insert into public.report_views (report_id) values (v_report.id);

    select to_jsonb(b) into v_brand from public.workspace_branding b where b.coach_id = v_report.coach_id;
    select c.name into v_coach_name from public.coaches c where c.id = v_report.coach_id;
    return jsonb_build_object(
        'snapshot', v_report.snapshot,
        'updated_at', v_report.updated_at,
        'brand', jsonb_build_object(
            'name', coalesce(v_brand->>'display_name', v_coach_name),
            'logo', v_brand->>'logo_light_url',
            'color', v_brand->>'primary_color',
            'footer', v_brand->>'report_footer'
        )
    );
end;
$$;

revoke all on function public.studio_save_report(uuid, uuid, jsonb) from public, anon;
revoke all on function public.studio_revoke_report(uuid) from public, anon;
revoke all on function public.studio_record_delivery(uuid, text, text, boolean) from public, anon;
revoke all on function public.studio_set_report_consent(uuid, boolean) from public, anon;
revoke all on function public.studio_dismiss_report_notice(uuid, uuid) from public, anon;
revoke all on function public.report_by_code(text) from public;

grant execute on function public.studio_save_report(uuid, uuid, jsonb) to authenticated;
grant execute on function public.studio_revoke_report(uuid) to authenticated;
grant execute on function public.studio_record_delivery(uuid, text, text, boolean) to authenticated;
grant execute on function public.studio_set_report_consent(uuid, boolean) to authenticated;
grant execute on function public.studio_dismiss_report_notice(uuid, uuid) to authenticated;
grant execute on function public.report_by_code(text) to anon, authenticated;

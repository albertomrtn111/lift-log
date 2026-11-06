-- Modo Sala F6: ajustes de informes por sala y avisos pospuestos.
--
-- Posponer es de cada profesional: lo que uno aparta le sigue saliendo a sus compañeros.

create table public.report_snoozes (
    session_id uuid not null references public.studio_sessions (id) on delete cascade,
    client_id uuid not null references public.clients (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    until timestamptz not null,
    primary key (session_id, client_id, user_id)
);

create index report_snoozes_user_idx on public.report_snoozes (user_id);

alter table public.report_snoozes enable row level security;

-- Solo lectura: las escrituras van por las funciones.
create policy report_snoozes_read on public.report_snoozes
    for select to authenticated
    using (user_id = auth.uid());

create or replace function public.studio_snooze_report(p_session_id uuid, p_client_id uuid, p_hours integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.studio_require_session(p_session_id);
    perform public.studio_require_client(p_client_id);
    if p_hours not between 1 and 24 then
        raise exception 'Se puede posponer entre 1 y 24 horas.' using errcode = '22023';
    end if;
    insert into public.report_snoozes (session_id, client_id, user_id, until)
    values (p_session_id, p_client_id, auth.uid(), now() + make_interval(hours => p_hours))
    on conflict (session_id, client_id, user_id) do update set until = excluded.until;
end;
$$;

create or replace function public.studio_save_report_settings(
    p_coach_id uuid, p_whatsapp_text text, p_email_subject text, p_email_text text,
    p_notice_hours integer, p_default_channel text, p_sections jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.is_coach_admin(p_coach_id) or not public.coach_has_feature(p_coach_id, 'studio_mode') then
        raise exception 'Solo el propietario y los administradores cambian esto.' using errcode = '42501';
    end if;
    if length(coalesce(p_whatsapp_text, '')) > 1000 or length(coalesce(p_email_text, '')) > 2000 or length(coalesce(p_email_subject, '')) > 150 then
        raise exception 'Alguno de los textos es demasiado largo.' using errcode = '22023';
    end if;
    if p_notice_hours not between 1 and 48 then
        raise exception 'La ventana del aviso va de 1 a 48 horas.' using errcode = '22023';
    end if;
    if p_default_channel not in ('whatsapp', 'email') then
        raise exception 'Ese canal no existe.' using errcode = '22023';
    end if;

    insert into public.report_settings (coach_id, whatsapp_text, email_subject, email_text, notice_hours, default_channel, sections)
    values (p_coach_id, nullif(btrim(p_whatsapp_text), ''), nullif(btrim(p_email_subject), ''), nullif(btrim(p_email_text), ''),
            p_notice_hours, p_default_channel, coalesce(p_sections, '{}'::jsonb))
    on conflict (coach_id) do update
    set whatsapp_text = excluded.whatsapp_text, email_subject = excluded.email_subject, email_text = excluded.email_text,
        notice_hours = excluded.notice_hours, default_channel = excluded.default_channel, sections = excluded.sections,
        updated_at = now();
end;
$$;

revoke all on function public.studio_snooze_report(uuid, uuid, integer) from public, anon;
revoke all on function public.studio_save_report_settings(uuid, text, text, text, integer, text, jsonb) from public, anon;

grant execute on function public.studio_snooze_report(uuid, uuid, integer) to authenticated;
grant execute on function public.studio_save_report_settings(uuid, text, text, text, integer, text, jsonb) to authenticated;

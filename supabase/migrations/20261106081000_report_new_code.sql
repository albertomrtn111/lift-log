-- Modo Sala F6: un enlace revocado no vuelve a funcionar. Regenerar ese informe estrena código.

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
    set snapshot = excluded.snapshot,
        code = case
            when public.session_reports.revoked_at is null then public.session_reports.code
            else excluded.code
        end,
        revoked_at = null,
        updated_at = now()
    returning * into v_report;
    return v_report;
end;
$$;

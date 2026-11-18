-- Asistentes de IA conectados por MCP: registro de uso y desconexión inmediata.
--
-- 1. mcp_tool_calls guarda qué herramienta usó cada cuenta, con qué asistente
--    (cliente OAuth), en qué espacio y con qué resultado. Solo identificadores:
--    nunca los datos de la petición ni de la respuesta.
-- 2. mcp_log_call es la única forma de escribir en ella. La cuenta y el asistente
--    salen del token, no de los parámetros.
-- 3. mcp_session_active dice si la sesión del token sigue abierta. Al desconectar
--    un asistente en Ajustes, Supabase cierra su sesión y el MCP deja de aceptar
--    su token en ese momento, sin esperar a que caduque.

create table if not exists public.mcp_tool_calls (
  id bigint generated always as identity primary key,
  called_at timestamptz not null default now(),
  user_id uuid not null,
  coach_id uuid references public.coaches(id) on delete cascade,
  oauth_client_id uuid,
  tool text not null check (length(tool) between 1 and 80),
  client_id uuid,
  record_id uuid,
  status text not null check (status in ('ok', 'error')),
  error text check (error is null or length(error) <= 200)
);

create index if not exists mcp_tool_calls_coach_idx on public.mcp_tool_calls (coach_id, called_at desc);
create index if not exists mcp_tool_calls_user_idx on public.mcp_tool_calls (user_id, called_at desc);

alter table public.mcp_tool_calls enable row level security;

-- Cada cuenta ve su propio uso; dueño y administradores, el de todo su espacio.
drop policy if exists mcp_tool_calls_read on public.mcp_tool_calls;
create policy mcp_tool_calls_read on public.mcp_tool_calls
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (coach_id is not null and public.is_coach_admin(coach_id))
  );

-- Sin políticas de escritura: nadie inserta, cambia ni borra filas directamente.
revoke all on public.mcp_tool_calls from anon, authenticated;
grant select on public.mcp_tool_calls to authenticated;

create or replace function public.mcp_log_call(
  p_tool text,
  p_status text,
  p_coach_id uuid default null,
  p_client_id uuid default null,
  p_record_id uuid default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_oauth_client text := nullif(auth.jwt() ->> 'client_id', '');
  v_coach_id uuid := p_coach_id;
  v_client_id uuid := p_client_id;
begin
  if v_uid is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;

  -- Freno ante abusos: como mucho 600 filas por cuenta cada 10 minutos.
  if (
    select count(*) from public.mcp_tool_calls c
    where c.user_id = v_uid and c.called_at > now() - interval '10 minutes'
  ) >= 600 then
    return;
  end if;

  -- El espacio solo se apunta si la cuenta pertenece a él; el cliente, solo si es de ese espacio.
  if v_coach_id is not null and not exists (
    select 1 from public.coach_memberships m
    where m.coach_id = v_coach_id and m.user_id = v_uid and m.status = 'active'
  ) then
    v_coach_id := null;
  end if;
  if v_client_id is not null and (v_coach_id is null or not exists (
    select 1 from public.clients c where c.id = v_client_id and c.coach_id = v_coach_id
  )) then
    v_client_id := null;
  end if;

  insert into public.mcp_tool_calls (user_id, coach_id, oauth_client_id, tool, client_id, record_id, status, error)
  values (
    v_uid,
    v_coach_id,
    case when v_oauth_client ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_oauth_client::uuid end,
    left(coalesce(nullif(btrim(p_tool), ''), 'desconocida'), 80),
    v_client_id,
    case when v_coach_id is null then null else p_record_id end,
    case when p_status = 'ok' then 'ok' else 'error' end,
    left(p_error, 200)
  );
end;
$$;

revoke all on function public.mcp_log_call(text, text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.mcp_log_call(text, text, uuid, uuid, uuid, text) to authenticated;

create or replace function public.mcp_session_active()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session text := coalesce(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null
    or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated'
    or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = v_session::uuid
      and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
  );
end;
$$;

revoke all on function public.mcp_session_active() from public, anon;
grant execute on function public.mcp_session_active() to authenticated;

-- Se guarda 13 meses.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'mcp-tool-calls-retention';
    perform cron.schedule(
      'mcp-tool-calls-retention',
      '17 3 * * *',
      $job$delete from public.mcp_tool_calls where called_at < now() - interval '13 months'$job$
    );
  end if;
end;
$$;

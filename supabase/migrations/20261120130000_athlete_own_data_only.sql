-- NXT-143. Con su propia sesión, el atleta solo cambia lo que escribe él.
--
-- 1. Ficha (clients): el atleta ya no la cambia directamente. Lo que la app
--    cambia de su ficha (bienvenida, avisos, contraseña, vincular la cuenta) lo
--    hace el servidor o funciones SECURITY DEFINER, que no usan esta regla.
-- 2. Chat (messages): solo sus propios mensajes; los del coach, no.
-- 3. Revisiones (checkins): solo sus respuestas; el feedback, el estado y la
--    programación los pone el coach.
-- 4. Cardio (cardio_sessions): solo sus resultados y sus notas; la sesión que
--    planifica el coach (nombre, objetivos, estructura, notas del coach), no.
-- 5. Notas de cobro: pasan a client_payment_notes, que solo ve el equipo del
--    coach. Mientras la web desplegada siga escribiendo clients.payment_notes,
--    un trigger copia cada cambio. La columna antigua se vacía después de
--    desplegar la web nueva (20261120140000_payment_notes_off_clients.sql).
--
-- El equipo del coach, el servidor (service_role) y las funciones SECURITY
-- DEFINER siguen como hasta ahora. Compatible con la web desplegada: no cambia
-- nada de lo que hace hoy. Idempotente.

-- 1. Ficha del atleta -----------------------------------------------------------

drop policy if exists clients_update_self on public.clients;

-- 2. Chat: el atleta solo cambia sus propios mensajes ---------------------------
-- (El nombre de la regla se mantiene; marcar como leídos los mensajes del coach
-- lo hace el servidor.)

alter policy messages_update_client_read on public.messages
  using (
    sender_role = 'client'
    and sender_id = (select auth.uid())
    and public.is_client_in_coach(coach_id, client_id)
  )
  with check (
    sender_role = 'client'
    and sender_id = (select auth.uid())
    and public.is_client_in_coach(coach_id, client_id)
  );

comment on policy messages_update_client_read on public.messages is
  'El atleta solo cambia los mensajes que ha escrito él (NXT-143).';

-- 3 y 4. Revisiones y cardio: el atleta solo cambia sus columnas ---------------
-- Un trigger por tabla con la lista de columnas que puede cambiar el atleta.
-- Solo limita a quien entra con sesión de usuario (authenticated) y no es del
-- equipo del coach de esa ficha: el equipo, el servidor y las funciones
-- SECURITY DEFINER (que corren como su dueño) no se ven afectados.
-- SECURITY INVOKER a propósito: current_user tiene que ser quien hace el cambio.

create or replace function public.guard_athlete_own_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_blocked text[];
begin
  -- Columnas que cambian y no están en la lista del atleta (argumentos del trigger)
  select array_agg(e.key order by e.key) into v_blocked
  from jsonb_each(to_jsonb(new)) e
  where e.key <> all (tg_argv)
    and e.value is distinct from (v_old -> e.key);

  if v_blocked is null then
    return new;
  end if;

  -- Servidor (service_role) y funciones SECURITY DEFINER: sin límite.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- El equipo del coach sigue pudiendo cambiarlo todo, como hasta ahora.
  if current_user = 'authenticated'
     and old.client_id in (select public.training_client_ids()) then
    return new;
  end if;

  raise exception 'Solo puedes cambiar tus propios datos (%).', array_to_string(v_blocked, ', ')
    using errcode = '42501';
end;
$$;

revoke all on function public.guard_athlete_own_columns() from public, anon, authenticated;

-- Revisiones: las respuestas del atleta.
drop trigger if exists trg_checkins_athlete_columns on public.checkins;
create trigger trg_checkins_athlete_columns
  before update on public.checkins
  for each row execute function public.guard_athlete_own_columns(
    'raw_payload', 'submitted_at',
    'weight_kg', 'weight_avg_kg', 'steps_avg',
    'training_adherence_pct', 'nutrition_adherence_pct', 'sleep_avg_h',
    'energy', 'hunger', 'stress', 'performance', 'injuries', 'notes'
  );

-- Cardio: lo que registra el atleta al hacer la sesión (saveCardioSessionLog).
-- updated_at también, por si un trigger futuro lo actualiza antes que este.
drop trigger if exists trg_cardio_sessions_athlete_columns on public.cardio_sessions;
create trigger trg_cardio_sessions_athlete_columns
  before update on public.cardio_sessions
  for each row execute function public.guard_athlete_own_columns(
    'actual_distance_km', 'actual_duration_min', 'actual_avg_pace',
    'avg_heart_rate', 'max_heart_rate', 'rpe', 'feedback_notes',
    'is_completed', 'performed_date', 'updated_at'
  );

-- 5. Notas de cobro: tabla solo del equipo del coach -----------------------------

create table if not exists public.client_payment_notes (
  client_id uuid primary key references public.clients(id) on delete cascade,
  notes text not null check (length(btrim(notes)) > 0),
  updated_at timestamptz not null default now()
);

comment on table public.client_payment_notes is
  'Notas de cobro de cada atleta. Solo las ve y cambia el equipo del coach (NXT-143).';

alter table public.client_payment_notes enable row level security;

drop policy if exists client_payment_notes_team_all on public.client_payment_notes;
create policy client_payment_notes_team_all on public.client_payment_notes
  for all to authenticated
  using (client_id in (select public.training_client_ids()))
  with check (client_id in (select public.training_client_ids()));

revoke all on public.client_payment_notes from anon, authenticated;
grant select, insert, update, delete on public.client_payment_notes to authenticated;
grant all on public.client_payment_notes to service_role;

-- Copia de las notas que ya hay (si se repite, no pisa lo que haya en la tabla nueva).
insert into public.client_payment_notes (client_id, notes, updated_at)
select c.id, btrim(c.payment_notes), coalesce(c.updated_at, now())
from public.clients c
where c.payment_notes is not null and btrim(c.payment_notes) <> ''
on conflict (client_id) do nothing;

-- Mientras la web desplegada escriba clients.payment_notes, cada cambio se copia.
-- null no borra la nota: así vaciar la columna antigua no toca la tabla nueva.
create or replace function public.sync_client_payment_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_notes is null then
    return null;
  end if;

  if btrim(new.payment_notes) = '' then
    delete from public.client_payment_notes where client_id = new.id;
  else
    insert into public.client_payment_notes as n (client_id, notes, updated_at)
    values (new.id, btrim(new.payment_notes), now())
    on conflict (client_id) do update
      set notes = excluded.notes, updated_at = excluded.updated_at
      where n.notes is distinct from excluded.notes;
  end if;
  return null;
end;
$$;

revoke all on function public.sync_client_payment_note() from public, anon, authenticated;

drop trigger if exists trg_sync_client_payment_note on public.clients;
create trigger trg_sync_client_payment_note
  after insert or update of payment_notes on public.clients
  for each row execute function public.sync_client_payment_note();

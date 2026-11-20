-- NXT-143, segundo paso. APLICAR DESPUÉS de desplegar la web que lee las notas
-- de cobro de client_payment_notes (requiere 20261120130000_athlete_own_data_only.sql).
--
-- Vacía clients.payment_notes: las notas ya están en client_payment_notes, que
-- solo ve el equipo del coach. Desde aquí, si algo vuelve a escribir esa
-- columna, el trigger pasa la nota a client_payment_notes y deja la columna vacía.
--
-- Si se aplicara antes de desplegar no rompe nada ni se pierde ninguna nota:
-- la web antigua solo mostraría las notas vacías hasta desplegar. Idempotente.

create or replace function public.sync_client_payment_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- null no borra la nota: es lo que deja esta misma función en la columna.
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

  update public.clients set payment_notes = null where id = new.id and payment_notes is not null;
  return null;
end;
$$;

revoke all on function public.sync_client_payment_note() from public, anon, authenticated;

drop trigger if exists trg_sync_client_payment_note on public.clients;
create trigger trg_sync_client_payment_note
  after insert or update of payment_notes on public.clients
  for each row execute function public.sync_client_payment_note();

-- Las notas ya se copiaron en el primer paso y el trigger copió cada cambio
-- posterior; la web nueva escribe directamente en client_payment_notes.
update public.clients set payment_notes = null where payment_notes is not null;

comment on column public.clients.payment_notes is
  'Sin uso (NXT-143): las notas de cobro están en client_payment_notes. Siempre null.';

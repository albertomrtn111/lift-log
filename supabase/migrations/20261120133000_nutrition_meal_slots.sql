-- Comidas extra del atleta en Dieta › Macros (NXT-154).
--
-- El atleta puede añadir comidas propias (p. ej. «Pre-entreno») además de Desayuno, Comida,
-- Merienda y Cena. Una fila = una comida extra que aparece desde effective_from en adelante
-- y deja de aparecer desde deleted_from (quitarla no borra la fila ni lo que se apuntó en ella:
-- los alimentos siguen en nutrition_log_entries con meal_type 'other' y su meal_label).
--
-- La app ya lee y escribe esta tabla (src/data/nutrition/log.ts), pero el script de junio
-- (sql/create_nutrition_meal_slots.sql, retirado con esta migración) nunca se aplicó: crear
-- la tabla arregla el error al añadir una comida extra sin tocar nada más.
-- Las políticas siguen el modelo de nutrition_day_settings y nutrition_log_entries: el atleta
-- activo gestiona las suyas y el equipo del espacio las lee según la visibilidad de atletas
-- (training_client_ids()).

create table if not exists public.nutrition_meal_slots (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade,
    label text not null check (char_length(btrim(label)) between 1 and 60),
    order_index integer not null default 4 check (order_index between 0 and 1000),
    effective_from date not null default current_date,
    deleted_from date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint nutrition_meal_slots_deleted_after_effective
        check (deleted_from is null or deleted_from >= effective_from)
);

comment on table public.nutrition_meal_slots is
    'Comidas extra del atleta en Dieta › Macros: visibles desde effective_from hasta el día anterior a deleted_from.';

-- Lectura de la pantalla: comidas del atleta vigentes en un día.
create index if not exists nutrition_meal_slots_client_date_idx
    on public.nutrition_meal_slots (client_id, effective_from);

-- Dos comidas extra vigentes con el mismo nombre no tienen sentido (Pre-entreno / pre-entreno).
create unique index if not exists nutrition_meal_slots_active_label_idx
    on public.nutrition_meal_slots (client_id, lower(btrim(label)))
    where deleted_from is null;

drop trigger if exists nutrition_meal_slots_set_updated_at on public.nutrition_meal_slots;
create trigger nutrition_meal_slots_set_updated_at
    before update on public.nutrition_meal_slots
    for each row execute function public.set_updated_at();

alter table public.nutrition_meal_slots enable row level security;

-- Por si alguien llegó a ejecutar a mano el script de junio: sus políticas no miraban si el
-- atleta está activo ni la visibilidad de atletas del espacio.
drop policy if exists "nms_client_select_own" on public.nutrition_meal_slots;
drop policy if exists "nms_client_insert_own" on public.nutrition_meal_slots;
drop policy if exists "nms_client_update_own" on public.nutrition_meal_slots;
drop policy if exists "nms_client_delete_own" on public.nutrition_meal_slots;
drop policy if exists "nms_coach_select" on public.nutrition_meal_slots;

-- Atleta activo: lee, crea, cambia y quita las suyas (igual que nds_client_all_own).
drop policy if exists nms_client_all_own on public.nutrition_meal_slots;
create policy nms_client_all_own on public.nutrition_meal_slots
    for all to authenticated
    using (exists (
        select 1 from public.clients c
        where c.id = nutrition_meal_slots.client_id
          and c.user_id = public.uid_if_active(c.status)
    ))
    with check (exists (
        select 1 from public.clients c
        where c.id = nutrition_meal_slots.client_id
          and c.user_id = public.uid_if_active(c.status)
    ));

-- Equipo del espacio: solo lee lo que registra el atleta (igual que nle_team_select).
drop policy if exists nms_team_select on public.nutrition_meal_slots;
create policy nms_team_select on public.nutrition_meal_slots
    for select to authenticated
    using (client_id in (select public.training_client_ids()));

revoke all on table public.nutrition_meal_slots from anon, authenticated;
grant select, insert, update, delete on table public.nutrition_meal_slots to authenticated;
grant all on table public.nutrition_meal_slots to service_role;

notify pgrst, 'reload schema';

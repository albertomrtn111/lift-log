-- Base de datos para Analítica: fecha real de cada serie y una única taxonomía de
-- grupos musculares.
--
-- 1. training_exercise_sets.performed_at
--    Las series solo guardaban week_index y la fecha se derivaba de
--    training_programs.effective_from, que se reescribe al activar un programa
--    (activateTrainingProgramAction). Por eso 169 series registradas caían en
--    semanas futuras y 1.699 antes de su semana. Desde ahora un trigger pone
--    performed_at = now() la primera vez que la serie tiene kg y reps, sea cual sea
--    el cliente que escribe (web del atleta, MCP). El histórico se rellena con
--    created_at, que es cuando el atleta generó la serie, y queda marcado como
--    estimado.
--
-- 2. muscle_groups
--    exercise_catalog.primary_group (15 grupos) es la fuente de verdad;
--    training_exercises.muscle_group (12 claves en minúsculas) es la clave interna de
--    la app y se deriva del catálogo con catalog_group_muscle_group(). La tabla fija
--    los 15 grupos, su clave interna para las filas sin catálogo y si cuentan para
--    volumen por grupo (Piernas, Cuerpo completo y Cardio no).

-- ─── 1. Fecha real de la serie ───────────────────────────────────────

alter table public.training_exercise_sets
  add column if not exists performed_at timestamptz,
  add column if not exists performed_at_estimated boolean not null default false;

comment on column public.training_exercise_sets.performed_at is
  'Momento en que la serie se registró por primera vez con kg y reps. Null si no está registrada.';
comment on column public.training_exercise_sets.performed_at_estimated is
  'true en series anteriores a 2026-10-24: performed_at sale de created_at, no del registro.';

create or replace function public.training_exercise_sets_set_performed_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.weight_kg is null or new.reps is null then
    new.performed_at := null;
    new.performed_at_estimated := false;
  elsif new.performed_at is null then
    new.performed_at := pg_catalog.now();
    new.performed_at_estimated := false;
  end if;
  return new;
end;
$function$;

drop trigger if exists training_exercise_sets_performed_at on public.training_exercise_sets;
create trigger training_exercise_sets_performed_at
  before insert or update of weight_kg, reps, performed_at on public.training_exercise_sets
  for each row execute function public.training_exercise_sets_set_performed_at();

update public.training_exercise_sets
set performed_at = created_at,
    performed_at_estimated = true
where weight_kg is not null
  and reps is not null
  and performed_at is null;

create index if not exists training_exercise_sets_performed_at_idx
  on public.training_exercise_sets (performed_at)
  where performed_at is not null;

-- ─── 2. Grupos musculares ────────────────────────────────────────────

create table if not exists public.muscle_groups (
  name text primary key,
  legacy_key text unique,
  counts_for_volume boolean not null default true,
  sort_order smallint not null
);

comment on table public.muscle_groups is
  'Grupos de exercise_catalog.primary_group. Grupo de un ejercicio: el de su catálogo; sin catálogo, el que tenga legacy_key = training_exercises.muscle_group.';
comment on column public.muscle_groups.legacy_key is
  'Valor de training_exercises.muscle_group. Null si el grupo se guarda como ''otros''.';
comment on column public.muscle_groups.counts_for_volume is
  'false en grupos que no son un músculo (Piernas, Cuerpo completo, Cardio): se excluyen del volumen por grupo.';

-- Mismo orden que CATALOG_GROUPS en src/lib/training/exercise-catalog.ts.
insert into public.muscle_groups (name, legacy_key, counts_for_volume, sort_order) values
  ('Pecho', 'pecho', true, 1),
  ('Espalda', 'espalda', true, 2),
  ('Hombros', 'hombro', true, 3),
  ('Bíceps', 'bíceps', true, 4),
  ('Tríceps', 'tríceps', true, 5),
  ('Cuádriceps', 'cuádriceps', true, 6),
  ('Isquiotibiales', 'femorales', true, 7),
  ('Glúteos', 'glúteo', true, 8),
  ('Aductores', 'aductores', true, 9),
  ('Gemelos', 'gemelos', true, 10),
  ('Tibial anterior', null, true, 11),
  ('Abdomen', 'abdomen', true, 12),
  ('Piernas', null, false, 13),
  ('Cuerpo completo', null, false, 14),
  ('Cardio', null, false, 15)
on conflict (name) do update
  set legacy_key = excluded.legacy_key,
      counts_for_volume = excluded.counts_for_volume,
      sort_order = excluded.sort_order;

alter table public.muscle_groups enable row level security;

drop policy if exists muscle_groups_authenticated_read on public.muscle_groups;
create policy muscle_groups_authenticated_read on public.muscle_groups
  for select to authenticated using (true);

-- El catálogo ya no puede usar un grupo fuera de la lista.
alter table public.exercise_catalog
  drop constraint if exists exercise_catalog_primary_group_fkey;
alter table public.exercise_catalog
  add constraint exercise_catalog_primary_group_fkey
  foreign key (primary_group) references public.muscle_groups (name) on update cascade;

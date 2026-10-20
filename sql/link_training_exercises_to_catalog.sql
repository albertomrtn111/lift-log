-- Applied to the SaaS Asesorias Supabase project on 2026-10-05.
-- Existing exercise names stay as historical snapshots; legacy rows can be linked in the editor.
alter table public.training_exercises
    add column if not exists catalog_exercise_id uuid null
    references public.exercise_catalog(id) on delete restrict;

create index if not exists training_exercises_catalog_exercise_id_idx
    on public.training_exercises (catalog_exercise_id)
    where catalog_exercise_id is not null;

-- Only link historical names that already match a canonical name exactly
-- after case and surrounding whitespace are ignored. Keep the stored name.
update public.training_exercises e
set catalog_exercise_id = c.id
from public.exercise_catalog c
where e.catalog_exercise_id is null
  and c.is_active = true
  and lower(btrim(e.exercise_name)) = lower(btrim(c.name));

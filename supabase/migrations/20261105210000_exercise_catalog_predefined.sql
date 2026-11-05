-- Modo Sala F0-7: ejercicios predefinidos, el atajo para llenar la biblioteca de un espacio.
--
-- Son los que salen marcados al empezar. Los que crean los entrenadores no entran solos, para
-- que la lista no crezca sin revisar; se ajusta desde esta columna, sin tocar el código.

alter table public.exercise_catalog
    add column is_predefined boolean not null default false;

update public.exercise_catalog
set is_predefined = true
where is_active;

-- submitted_at es la fecha en que el atleta responde la revisión. Tenía DEFAULT now(),
-- así que cada revisión enviada (planificador, portal del coach, n8n) nacía ya con
-- fecha de respuesta y el dashboard la mostraba como «Por revisar».
alter table public.checkins alter column submitted_at drop default;

-- Limpia las que nunca se respondieron: sin respuestas y con la marca del DEFAULT
-- (idéntica a created_at). Las respondidas tienen raw_payload y otra fecha.
update public.checkins
set submitted_at = null
where submitted_at is not null
  and submitted_at = created_at
  and coalesce(raw_payload, '{}'::jsonb) = '{}'::jsonb
  and status in ('pending', 'archived');

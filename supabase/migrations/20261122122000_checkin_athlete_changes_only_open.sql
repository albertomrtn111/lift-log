-- NXT-158: el atleta solo cambia un check-in (respuestas y fotos) mientras su coach
-- no lo ha cerrado. Repite en la base la regla de src/lib/reviews/checkin-submission-rules.js:
-- abierto = check-in 'pending' o 'reviewed' y revisión sin aprobar ni rechazar.
-- No cambia datos. El equipo (checkins_team_all, checkin_media_team_all) no cambia.
-- Se puede aplicar antes de desplegar la web: la web actual ya escribe con la clave
-- de servicio las respuestas, y con la sesión del atleta solo añade o quita fotos
-- de check-ins abiertos.

create or replace function public.is_checkin_open_for_athlete(p_checkin_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
    select exists (
        select 1
        from public.checkins ck
        where ck.id = p_checkin_id
          and ck.status in ('pending', 'reviewed')
          and not exists (
              select 1 from public.reviews r
              where r.checkin_id = ck.id
                and r.status in ('approved', 'rejected')
          )
    );
$$;

revoke all on function public.is_checkin_open_for_athlete(uuid) from public;
grant execute on function public.is_checkin_open_for_athlete(uuid) to authenticated, service_role;

-- Fotos del check-in con la sesión del atleta: se mantiene la ficha activa (NXT-116)
-- y además el check-in tiene que seguir abierto.
alter policy checkin_media_self_insert on public.checkin_media
    with check (
        (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = checkin_media.client_id) AND (c.auth_user_id = public.uid_if_active(c.status)))))
        AND checkin_media.checkin_id IS NOT NULL
        AND public.is_checkin_open_for_athlete(checkin_media.checkin_id)
    );

alter policy checkin_media_self_delete on public.checkin_media
    using (
        (EXISTS ( SELECT 1 FROM public.clients c WHERE ((c.id = checkin_media.client_id) AND (c.auth_user_id = public.uid_if_active(c.status)))))
        AND checkin_media.checkin_id IS NOT NULL
        AND public.is_checkin_open_for_athlete(checkin_media.checkin_id)
    );

-- Respuestas con la sesión del atleta: solo en un check-in abierto y sin poder
-- cerrarlo ni archivarlo por su cuenta.
alter policy checkins_update_self on public.checkins
    using (public.is_client_in_coach(coach_id, client_id) AND public.is_checkin_open_for_athlete(id))
    with check (public.is_client_in_coach(coach_id, client_id) AND status in ('pending', 'reviewed'));

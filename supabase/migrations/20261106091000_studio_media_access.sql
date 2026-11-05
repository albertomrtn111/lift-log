-- Modo Sala F7: quién puede ver o subir un archivo de la sala.
--
-- La carpeta del propio espacio es de toda la sala. La de un cliente solo la ve quien lo lleva,
-- y mientras siga vigente su consentimiento de imagen.

create or replace function public.studio_can_use_media(p_coach_id uuid, p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_coach_member(p_coach_id) and (
        p_folder_id = p_coach_id
        or (
            p_folder_id in (select public.training_client_ids())
            and public.studio_has_image_consent(p_folder_id)
            and exists (select 1 from public.clients c where c.id = p_folder_id and c.coach_id = p_coach_id)
        )
    );
$$;

revoke all on function public.studio_can_use_media(uuid, uuid) from public, anon;
grant execute on function public.studio_can_use_media(uuid, uuid) to authenticated;

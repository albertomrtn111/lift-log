-- Modo Sala: recepción también puede dar de alta desde FisioTrack.
--
-- studio_create_client vinculaba el paciente con agenda_link_patient, que solo admite profesionales:
-- para recepción fallaba. El vínculo se hace aquí mismo, ya comprobado que el paciente es del espacio.

do $$
declare
    v_old constant text := 'perform public.agenda_link_patient(v_patient.id, v_client);';
    v_new constant text := 'update public.external_patients p set client_id = v_client, updated_at = now() where p.id = v_patient.id;
        update public.agenda_appointments a set client_id = v_client, updated_at = now() where a.external_patient_id = v_patient.id;';
    v_source text := pg_get_functiondef('public.studio_create_client(uuid, text, text, text, date, uuid, boolean)'::regprocedure);
begin
    if position(v_old in v_source) = 0 then
        raise exception 'studio_create_client no tiene el texto esperado';
    end if;
    execute replace(v_source, v_old, v_new);
end;
$$;

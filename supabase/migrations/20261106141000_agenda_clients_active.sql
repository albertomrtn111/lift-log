-- Modo Sala F4: los clientes que llegan de la agenda entran activos.
--
-- Se creaban sin estado, y la sala solo enseña a los activos: el centro no veía a nadie.

do $$
declare
    v_old constant text := E'insert into public.clients (coach_id, full_name, email, phone, birthday)\n            values (p_coach_id, v_row.full_name, v_row.email, v_row.phone, v_row.birth_date)';
    v_new constant text := E'insert into public.clients (coach_id, full_name, email, phone, birthday, status)\n            values (p_coach_id, v_row.full_name, v_row.email, v_row.phone, v_row.birth_date, ''active'')';
    v_source text := pg_get_functiondef('public.agenda_apply(uuid)'::regprocedure);
begin
    if position(v_old in v_source) = 0 then
        raise exception 'agenda_apply no tiene el texto esperado';
    end if;
    execute replace(v_source, v_old, v_new);
end;
$$;

update public.clients c
set status = 'active'
where c.status is null
  and exists (select 1 from public.external_patients p where p.client_id = c.id);

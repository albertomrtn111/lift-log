-- Modo Sala F2-3: quién está mirando también en la cuadrícula de un grupo.

create or replace function public.studio_can_join_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_id uuid;
    v_coach_id uuid;
begin
    if p_topic !~ '^studio:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
    end if;
    v_id := substr(p_topic, 8)::uuid;
    select g.coach_id into v_coach_id from public.training_groups g where g.id = v_id;
    if v_coach_id is not null then
        return public.is_coach_member(v_coach_id);
    end if;
    return public.can_see_training(v_id);
end;
$$;

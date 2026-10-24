-- Prueba de 20261024100000_analytics_data_foundations: trigger de performed_at, relleno
-- del histórico y tabla muscle_groups. Usa un cliente temporal. Termina con ROLLBACK
-- explícito.
begin;
do $tests$
declare
  v_coach uuid;
  v_user uuid;
  v_client uuid := gen_random_uuid();
  v_program uuid := gen_random_uuid();
  v_day uuid := gen_random_uuid();
  v_exercise uuid := gen_random_uuid();
  v_set uuid;
  v_at timestamptz;
  v_estimated boolean;
  v_count bigint;
  v_assertions integer := 0;
begin
  select coach_id, user_id into v_coach, v_user from public.coach_memberships
    where status = 'active' and role = 'owner' order by created_at limit 1;
  if v_coach is null then raise exception 'Se necesita un entrenador.'; end if;
  insert into public.clients (id, coach_id, user_id, full_name, status)
    values (v_client, v_coach, v_user, 'Analytics foundations rollback test', 'active');
  insert into public.training_programs (id, coach_id, client_id, name, weeks)
    values (v_program, v_coach, v_client, 'Analytics test', 4);
  insert into public.training_days (id, coach_id, program_id, name)
    values (v_day, v_coach, v_program, 'Día test');
  insert into public.training_exercises (id, coach_id, program_id, day_id, exercise_name)
    values (v_exercise, v_coach, v_program, v_day, 'Ejercicio test');

  -- 1. Serie insertada con kg y reps: fecha de ahora, no estimada.
  insert into public.training_exercise_sets (exercise_id, week_index, set_index, weight_kg, reps)
    values (v_exercise, 1, 0, 100, 5) returning id into v_set;
  select performed_at, performed_at_estimated into v_at, v_estimated
    from public.training_exercise_sets where id = v_set;
  if v_at is distinct from now() or v_estimated then
    raise exception 'La serie registrada no recibe performed_at = now().';
  end if;
  v_assertions := v_assertions + 1;

  -- 2. Editar la serie conserva la fecha del primer registro.
  update public.training_exercise_sets set performed_at = now() - interval '3 days' where id = v_set;
  update public.training_exercise_sets set weight_kg = 102.5, rir = 2 where id = v_set;
  select performed_at into v_at from public.training_exercise_sets where id = v_set;
  if v_at <> now() - interval '3 days' then raise exception 'Editar la serie cambia performed_at.'; end if;
  v_assertions := v_assertions + 1;

  -- 3. Borrar las reps deja la serie sin registrar.
  update public.training_exercise_sets set reps = null where id = v_set;
  select performed_at into v_at from public.training_exercise_sets where id = v_set;
  if v_at is not null then raise exception 'Una serie sin reps conserva performed_at.'; end if;
  v_assertions := v_assertions + 1;

  -- 4. Serie generada vacía y rellenada después: fecha al rellenarla.
  insert into public.training_exercise_sets (exercise_id, week_index, set_index)
    values (v_exercise, 1, 1) returning id into v_set;
  select performed_at into v_at from public.training_exercise_sets where id = v_set;
  if v_at is not null then raise exception 'Una serie vacía recibe performed_at.'; end if;
  update public.training_exercise_sets set weight_kg = 60, reps = 10, is_override = true where id = v_set;
  select performed_at into v_at from public.training_exercise_sets where id = v_set;
  if v_at is distinct from now() then raise exception 'Rellenar la serie no pone performed_at.'; end if;
  v_assertions := v_assertions + 1;

  -- 5. Histórico: toda serie registrada tiene fecha y ninguna está en el futuro.
  select count(*) into v_count from public.training_exercise_sets
    where weight_kg is not null and reps is not null
      and (performed_at is null or performed_at > now());
  if v_count > 0 then raise exception '% series registradas sin fecha válida.', v_count; end if;
  select count(*) into v_count from public.training_exercise_sets
    where performed_at_estimated and performed_at <> created_at;
  if v_count > 0 then raise exception '% series estimadas no salen de created_at.', v_count; end if;
  v_assertions := v_assertions + 1;

  -- 6. muscle_groups coincide con catalog_group_muscle_group() y con CATALOG_GROUPS.
  select count(*) into v_count from public.muscle_groups
    where public.catalog_group_muscle_group(name) <> coalesce(legacy_key, 'otros');
  if v_count > 0 then raise exception '% grupos no coinciden con catalog_group_muscle_group().', v_count; end if;
  if (select count(*) from public.muscle_groups) <> 15 then raise exception 'muscle_groups no tiene 15 grupos.'; end if;
  v_assertions := v_assertions + 1;

  -- 7. Toda clave de training_exercises distinta de 'otros' tiene grupo del catálogo.
  select count(*) into v_count from public.training_exercises te
    where te.muscle_group is not null and te.muscle_group <> 'otros'
      and not exists (select 1 from public.muscle_groups mg where mg.legacy_key = te.muscle_group);
  if v_count > 0 then raise exception '% ejercicios con una clave sin grupo.', v_count; end if;
  v_assertions := v_assertions + 1;

  -- 8. Los ejercicios enlazados no contradicen a su catálogo.
  select count(*) into v_count from public.training_exercises te
    join public.exercise_catalog ec on ec.id = te.catalog_exercise_id
    where te.muscle_group is distinct from public.catalog_group_muscle_group(ec.primary_group);
  if v_count > 0 then raise exception '% ejercicios con un grupo distinto al de su catálogo.', v_count; end if;
  v_assertions := v_assertions + 1;

  -- 9. El catálogo rechaza un grupo fuera de la lista.
  begin
    insert into public.exercise_catalog (name, primary_group) values ('Ejercicio test grupo', 'Piernas y glúteo');
    raise exception 'El catálogo acepta un grupo desconocido.';
  exception when foreign_key_violation then
    v_assertions := v_assertions + 1;
  end;

  raise notice 'analytics_data_foundations: % comprobaciones OK', v_assertions;
end;
$tests$;
rollback;

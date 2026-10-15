-- @> y -> tienen igual precedencia: agrupar el operando JSON evita que
-- Postgres intente aplicar -> al resultado booleano de la comparación.
do $fix$
declare
  v_definition text := pg_get_functiondef('public.save_nexttrain_nutrition_plan(text,uuid,uuid,uuid,jsonb,timestamp with time zone)'::regprocedure);
begin
  if strpos(v_definition, $old$@> p_payload->'expected_macro'$old$) = 0 then
    raise exception 'No se encontró la comprobación de concurrencia esperada.';
  end if;
  execute replace(v_definition,
    $old$@> p_payload->'expected_macro'$old$,
    $new$@> (p_payload->'expected_macro')$new$);
end;
$fix$;

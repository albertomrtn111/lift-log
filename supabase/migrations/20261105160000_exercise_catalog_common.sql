-- Modo Sala F0-4: catálogo común ampliado.
--
-- Cada ejercicio gana bloque, lateralidad, material y métricas. El grupo muscular y la
-- analítica actual no cambian: el bloque solo sirve para ordenar y mostrar.

-- Grupo para movilidad, carrera, patrones y HIIT. No cuenta para el volumen por músculo.
insert into public.muscle_groups (name, legacy_key, counts_for_volume, sort_order)
values ('No aplica', null, false, 16)
on conflict (name) do nothing;

-- Bloques comunes a toda la plataforma. La categoría sale del bloque, no del ejercicio.
create table public.exercise_blocks (
    key text primary key,
    name text not null unique,
    category text not null
        check (category in ('movilidad', 'core', 'prevencion', 'pliometria', 'carrera', 'fuerza', 'metabolico')),
    sort_order integer not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

alter table public.exercise_blocks enable row level security;

create policy exercise_blocks_authenticated_read on public.exercise_blocks
    for select to authenticated
    using (is_active);

insert into public.exercise_blocks (key, name, category, sort_order) values
    ('movilidad', 'Movilidad', 'movilidad', 10),
    ('core_antiextension', 'Core antiextensión', 'core', 20),
    ('core_antiflexion', 'Core antiflexión lateral', 'core', 30),
    ('core_antirrotacion', 'Core antirrotación', 'core', 40),
    ('core', 'Core', 'core', 50),
    ('gluteo_medio', 'Glúteo medio', 'prevencion', 60),
    ('aductor', 'Aductor', 'prevencion', 70),
    ('flexores_plantares', 'Flexores plantares', 'prevencion', 80),
    ('flexores_cadera', 'Flexores de cadera', 'prevencion', 90),
    ('manguito_rotador', 'Manguito rotador', 'prevencion', 100),
    ('pliometria_vertical', 'Pliometría vertical', 'pliometria', 110),
    ('pliometria_horizontal', 'Pliometría horizontal', 'pliometria', 120),
    ('potencia_rotacional', 'Potencia rotacional', 'pliometria', 130),
    ('pliometria_tren_superior', 'Pliometría tren superior', 'pliometria', 140),
    ('patron_movimiento', 'Patrón de movimiento', 'carrera', 150),
    ('transferencia_patron', 'Transferencia patrón de movimiento', 'carrera', 160),
    ('dominante_rodilla', 'Dominante de rodilla', 'fuerza', 170),
    ('empuje_horizontal', 'Empuje horizontal', 'fuerza', 180),
    ('traccion_horizontal', 'Tracción horizontal', 'fuerza', 190),
    ('dominante_cadera', 'Dominante de cadera', 'fuerza', 200),
    ('empuje_vertical', 'Empuje vertical', 'fuerza', 210),
    ('traccion_vertical', 'Tracción vertical', 'fuerza', 220),
    ('biceps', 'Bíceps', 'fuerza', 230),
    ('triceps', 'Tríceps', 'fuerza', 240),
    ('cargas_transportes', 'Cargas y transportes', 'fuerza', 250),
    ('isquiotibiales', 'Isquiotibiales (flexión de rodilla)', 'prevencion', 260),
    ('cuadriceps', 'Cuádriceps (extensión de rodilla)', 'prevencion', 270),
    ('battle_for_run', 'Battle for run', 'carrera', 280),
    ('metabolico', 'Metabólico', 'metabolico', 290),
    ('cardiovascular', 'Cardiovascular', 'metabolico', 300);

-- block_key admite nulos para que la versión anterior de la web pueda seguir creando
-- ejercicios mientras se despliega la nueva. La web nueva lo exige siempre.
alter table public.exercise_catalog
    add column block_key text references public.exercise_blocks (key) on update cascade,
    add column laterality text not null default 'bilateral'
        check (laterality in ('bilateral', 'unilateral', 'alterno')),
    add column equipment text[] not null default '{}',
    add column metrics text[] not null default '{kg,reps}'
        check (
            cardinality(metrics) > 0
            and metrics <@ array['kg', 'reps', 'time', 'distance', 'velocity']
        ),
    add column variant_of uuid references public.exercise_catalog (id) on delete set null
        check (variant_of <> id),
    add column created_by uuid references public.profiles (id) on delete set null,
    add column possible_duplicate_of uuid references public.exercise_catalog (id) on delete set null
        check (possible_duplicate_of <> id),
    add column merged_into uuid references public.exercise_catalog (id) on delete restrict
        check (merged_into <> id),
    add column merged_at timestamptz,
    add column merged_by uuid references public.profiles (id) on delete set null;

create index exercise_catalog_block_idx on public.exercise_catalog (block_key);
create index exercise_catalog_possible_duplicate_idx on public.exercise_catalog (possible_duplicate_of)
    where possible_duplicate_of is not null;

-- Datos de los 155 ejercicios actuales.
update public.exercise_catalog c
set block_key = v.block_key,
    laterality = v.laterality,
    equipment = v.equipment,
    metrics = v.metrics
from (values
    ('Abdominales tijera', 'core', 'alterno', '{peso_corporal}'::text[], '{reps}'::text[]),
    ('Bird dog', 'core_antirrotacion', 'alterno', '{peso_corporal}', '{reps}'),
    ('Crunch abdominal en máquina', 'core', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Crunch abdominal en polea', 'core', 'bilateral', '{polea}', '{kg,reps}'),
    ('Crunch en banco declinado', 'core', 'bilateral', '{peso_corporal}', '{reps}'),
    ('Dead bug', 'core_antiextension', 'alterno', '{peso_corporal}', '{reps}'),
    ('Elevación de piernas tumbado', 'core', 'bilateral', '{peso_corporal}', '{reps}'),
    ('Plancha frontal', 'core_antiextension', 'bilateral', '{peso_corporal}', '{time}'),
    ('Plancha frontal con peso', 'core_antiextension', 'bilateral', '{disco}', '{kg,time}'),
    ('Plancha lateral', 'core_antiflexion', 'unilateral', '{peso_corporal}', '{time}'),
    ('Plancha lateral con abducción', 'core_antiflexion', 'unilateral', '{peso_corporal}', '{time}'),
    ('Press Pallof con banda', 'core_antirrotacion', 'unilateral', '{goma}', '{reps}'),
    ('Press Pallof en polea', 'core_antirrotacion', 'unilateral', '{polea}', '{kg,reps}'),
    ('Rueda abdominal', 'core_antiextension', 'bilateral', '{rueda}', '{reps}'),

    ('Aducción de cadera en máquina', 'aductor', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Plancha Copenhagen', 'aductor', 'unilateral', '{peso_corporal}', '{time}'),

    ('Curl bayesiano en polea', 'biceps', 'unilateral', '{polea}', '{kg,reps}'),
    ('Curl de bíceps alterno con mancuernas', 'biceps', 'alterno', '{mancuerna}', '{kg,reps}'),
    ('Curl de bíceps con barra EZ', 'biceps', 'bilateral', '{barra}', '{kg,reps}'),
    ('Curl de bíceps con barra recta', 'biceps', 'bilateral', '{barra}', '{kg,reps}'),
    ('Curl de bíceps con mancuernas', 'biceps', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Curl de bíceps en máquina', 'biceps', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Curl de bíceps en polea', 'biceps', 'bilateral', '{polea}', '{kg,reps}'),
    ('Curl de bíceps inclinado con mancuernas', 'biceps', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Curl inverso unilateral en polea', 'biceps', 'unilateral', '{polea}', '{kg,reps}'),
    ('Curl martillo con mancuernas', 'biceps', 'bilateral', '{mancuerna}', '{kg,reps}'),

    ('Bicicleta estática', 'cardiovascular', 'bilateral', '{ergometro}', '{time,distance}'),
    ('Remoergómetro', 'cardiovascular', 'bilateral', '{ergometro}', '{time,distance}'),
    ('SkiErg', 'cardiovascular', 'bilateral', '{ergometro}', '{time,distance}'),

    ('Extensión de cuádriceps en máquina', 'cuadriceps', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Extensión de cuádriceps isométrica en máquina', 'cuadriceps', 'bilateral', '{maquina}', '{kg,time}'),
    ('Extensión de cuádriceps unilateral en máquina', 'cuadriceps', 'unilateral', '{maquina}', '{kg,reps}'),
    ('Extensión terminal de rodilla con banda', 'cuadriceps', 'unilateral', '{goma}', '{reps}'),
    ('Hack squat', 'dominante_rodilla', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Prensa de piernas a 45°', 'dominante_rodilla', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Prensa de piernas unilateral', 'dominante_rodilla', 'unilateral', '{maquina}', '{kg,reps}'),
    ('Sentadilla búlgara', 'dominante_rodilla', 'unilateral', '{peso_corporal}', '{kg,reps}'),
    ('Sentadilla búlgara con mancuernas', 'dominante_rodilla', 'unilateral', '{mancuerna}', '{kg,reps}'),
    ('Sentadilla con mancuerna', 'dominante_rodilla', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Sentadilla con TRX', 'dominante_rodilla', 'bilateral', '{trx}', '{reps}'),
    ('Sentadilla en multipower', 'dominante_rodilla', 'bilateral', '{multipower}', '{kg,reps}'),
    ('Sentadilla goblet con kettlebell', 'dominante_rodilla', 'bilateral', '{kettlebell}', '{kg,reps}'),
    ('Sentadilla isométrica en pared', 'dominante_rodilla', 'bilateral', '{peso_corporal}', '{time}'),
    ('Sentadilla pendular', 'dominante_rodilla', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Sentadilla trasera con barra', 'dominante_rodilla', 'bilateral', '{barra}', '{kg,reps}'),
    ('Sentadilla trasera high bar con barra', 'dominante_rodilla', 'bilateral', '{barra}', '{kg,reps}'),
    ('Sissy squat', 'cuadriceps', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Spanish squat con banda', 'cuadriceps', 'bilateral', '{goma}', '{reps}'),
    ('Step down excéntrico', 'dominante_rodilla', 'unilateral', '{peso_corporal}', '{kg,reps}'),
    ('Step up al cajón', 'dominante_rodilla', 'unilateral', '{cajon}', '{kg,reps}'),
    ('Step up al cajón con mancuerna', 'dominante_rodilla', 'unilateral', '{cajon,mancuerna}', '{kg,reps}'),
    ('Step up alto', 'dominante_rodilla', 'unilateral', '{cajon}', '{kg,reps}'),
    ('Step up bajo', 'dominante_rodilla', 'unilateral', '{cajon}', '{kg,reps}'),
    ('Step up explosivo', 'dominante_rodilla', 'unilateral', '{cajon}', '{kg,reps}'),
    ('Zancada estática', 'dominante_rodilla', 'unilateral', '{peso_corporal}', '{kg,reps}'),
    ('Zancadas caminando', 'dominante_rodilla', 'alterno', '{peso_corporal}', '{kg,reps}'),
    ('Zancadas caminando con mancuernas', 'dominante_rodilla', 'alterno', '{mancuerna}', '{kg,reps}'),

    ('Arrastre de trineo', 'cargas_transportes', 'bilateral', '{trineo}', '{kg,distance}'),
    ('Empuje de trineo', 'cargas_transportes', 'bilateral', '{trineo}', '{kg,distance}'),
    ('Equilibrio a una pierna', 'gluteo_medio', 'unilateral', '{peso_corporal}', '{time}'),
    ('Paseo del granjero', 'cargas_transportes', 'bilateral', '{mancuerna}', '{kg,distance}'),

    ('Dominadas con agarre neutro', 'traccion_vertical', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Dominadas con agarre prono', 'traccion_vertical', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Dominadas con agarre supino', 'traccion_vertical', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Hiperextensiones de espalda', 'dominante_cadera', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Jalón al pecho con agarre ancho', 'traccion_vertical', 'bilateral', '{polea}', '{kg,reps}'),
    ('Jalón al pecho con agarre estrecho', 'traccion_vertical', 'bilateral', '{polea}', '{kg,reps}'),
    ('Jalón al pecho con agarre neutro', 'traccion_vertical', 'bilateral', '{polea}', '{kg,reps}'),
    ('Jalón al pecho unilateral', 'traccion_vertical', 'unilateral', '{polea}', '{kg,reps}'),
    ('Jalón al pecho unilateral con agarre neutro', 'traccion_vertical', 'unilateral', '{polea}', '{kg,reps}'),
    ('Pullover en polea alta', 'traccion_vertical', 'bilateral', '{polea}', '{kg,reps}'),
    ('Remo con barra', 'traccion_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Remo con barra y agarre supino', 'traccion_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Remo con mancuerna unilateral', 'traccion_horizontal', 'unilateral', '{mancuerna}', '{kg,reps}'),
    ('Remo en máquina', 'traccion_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Remo en máquina unilateral', 'traccion_horizontal', 'unilateral', '{maquina}', '{kg,reps}'),
    ('Remo en T', 'traccion_horizontal', 'bilateral', '{landmine}', '{kg,reps}'),
    ('Remo en T con apoyo de pecho', 'traccion_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Remo en T unilateral', 'traccion_horizontal', 'unilateral', '{landmine}', '{kg,reps}'),
    ('Remo Gironda en polea baja', 'traccion_horizontal', 'bilateral', '{polea}', '{kg,reps}'),
    ('Remo Gironda unilateral con agarre supino', 'traccion_horizontal', 'unilateral', '{polea}', '{kg,reps}'),
    ('Remo Gironda unilateral en polea baja', 'traccion_horizontal', 'unilateral', '{polea}', '{kg,reps}'),
    ('Remo Pendlay con barra', 'traccion_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Remo sentado en máquina con agarre neutro', 'traccion_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),

    ('Elevación de gemelos de pie', 'flexores_plantares', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Elevación de gemelos de pie en máquina', 'flexores_plantares', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Elevación de gemelos en prensa', 'flexores_plantares', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Elevación de gemelos sentado', 'flexores_plantares', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Saltos reactivos de tobillo', 'pliometria_vertical', 'bilateral', '{peso_corporal}', '{reps}'),

    ('Abducción de cadera con banda', 'gluteo_medio', 'bilateral', '{goma}', '{reps}'),
    ('Abducción de cadera en máquina', 'gluteo_medio', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Caminata lateral con minibanda', 'gluteo_medio', 'bilateral', '{goma}', '{reps}'),
    ('Clamshell con banda', 'gluteo_medio', 'unilateral', '{goma}', '{reps}'),
    ('Hip airplane', 'gluteo_medio', 'unilateral', '{peso_corporal}', '{reps}'),
    ('Hip thrust con barra', 'dominante_cadera', 'bilateral', '{barra}', '{kg,reps}'),
    ('Hip thrust en multipower', 'dominante_cadera', 'bilateral', '{multipower}', '{kg,reps}'),
    ('Monster walk con banda', 'gluteo_medio', 'bilateral', '{goma}', '{reps}'),
    ('Puente de glúteos', 'dominante_cadera', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Puente de glúteos unilateral', 'dominante_cadera', 'unilateral', '{peso_corporal}', '{kg,reps}'),

    ('6 ways para hombros', 'empuje_vertical', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Aperturas inversas en máquina', 'traccion_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Aperturas inversas en polea', 'traccion_horizontal', 'bilateral', '{polea}', '{kg,reps}'),
    ('Aperturas inversas unilaterales en polea', 'traccion_horizontal', 'unilateral', '{polea}', '{kg,reps}'),
    ('Elevación lateral con mancuernas', 'empuje_vertical', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Elevación lateral en máquina', 'empuje_vertical', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Elevación lateral en polea', 'empuje_vertical', 'unilateral', '{polea}', '{kg,reps}'),
    ('Elevaciones frontales con barra', 'empuje_vertical', 'bilateral', '{barra}', '{kg,reps}'),
    ('Face pull en polea', 'manguito_rotador', 'bilateral', '{polea}', '{kg,reps}'),
    ('Press de hombros en máquina', 'empuje_vertical', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Press landmine unilateral', 'empuje_vertical', 'unilateral', '{landmine}', '{kg,reps}'),
    ('Press militar de pie con barra', 'empuje_vertical', 'bilateral', '{barra}', '{kg,reps}'),
    ('Press militar sentado con barra', 'empuje_vertical', 'bilateral', '{barra}', '{kg,reps}'),
    ('Press militar sentado con mancuernas', 'empuje_vertical', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Push press con barra', 'empuje_vertical', 'bilateral', '{barra}', '{kg,reps}'),

    ('Buenos días con banda', 'dominante_cadera', 'bilateral', '{goma}', '{reps}'),
    ('Curl femoral isométrico', 'isquiotibiales', 'bilateral', '{peso_corporal}', '{time}'),
    ('Curl femoral sentado', 'isquiotibiales', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Curl femoral tumbado', 'isquiotibiales', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Curl femoral tumbado con banda', 'isquiotibiales', 'bilateral', '{goma}', '{reps}'),
    ('Curl femoral tumbado unilateral en máquina', 'isquiotibiales', 'unilateral', '{maquina}', '{kg,reps}'),
    ('Kettlebell swing', 'dominante_cadera', 'bilateral', '{kettlebell}', '{kg,reps}'),
    ('Peso muerto convencional con barra', 'dominante_cadera', 'bilateral', '{barra}', '{kg,reps}'),
    ('Peso muerto rumano con banda', 'dominante_cadera', 'bilateral', '{goma}', '{reps}'),
    ('Peso muerto rumano con barra', 'dominante_cadera', 'bilateral', '{barra}', '{kg,reps}'),
    ('Peso muerto rumano con mancuernas', 'dominante_cadera', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Rack pull', 'dominante_cadera', 'bilateral', '{barra}', '{kg,reps}'),

    ('Aperturas en máquina pec deck', 'empuje_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Aperturas en polea alta', 'empuje_horizontal', 'bilateral', '{polea}', '{kg,reps}'),
    ('Aperturas en polea baja', 'empuje_horizontal', 'bilateral', '{polea}', '{kg,reps}'),
    ('Floor press', 'empuje_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Fondos en paralelas', 'empuje_horizontal', 'bilateral', '{peso_corporal}', '{kg,reps}'),
    ('Press de banca inclinado con barra', 'empuje_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Press de banca inclinado con mancuernas', 'empuje_horizontal', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Press de banca plano con barra', 'empuje_horizontal', 'bilateral', '{barra}', '{kg,reps}'),
    ('Press de banca plano con mancuernas', 'empuje_horizontal', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Press de pecho declinado en máquina', 'empuje_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Press de pecho en máquina', 'empuje_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Press de pecho en máquina de pie', 'empuje_horizontal', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Press de pecho inclinado en multipower', 'empuje_horizontal', 'bilateral', '{multipower}', '{kg,reps}'),

    ('Drop jump desde cajón', 'pliometria_vertical', 'bilateral', '{cajon}', '{reps}'),
    ('Salto al cajón', 'pliometria_vertical', 'bilateral', '{cajon}', '{reps}'),
    ('Salto vertical submáximo con recepción', 'pliometria_vertical', 'bilateral', '{peso_corporal}', '{reps}'),
    ('Saltos laterales tipo skater', 'pliometria_horizontal', 'alterno', '{peso_corporal}', '{reps}'),
    ('Snap down (caída y estabilización)', 'pliometria_vertical', 'bilateral', '{peso_corporal}', '{reps}'),

    ('Elevación de tibial anterior', 'flexores_plantares', 'bilateral', '{peso_corporal}', '{reps}'),

    ('Extensión de tríceps con mancuerna', 'triceps', 'bilateral', '{mancuerna}', '{kg,reps}'),
    ('Extensión de tríceps en polea con barra', 'triceps', 'bilateral', '{polea}', '{kg,reps}'),
    ('Extensión de tríceps en polea con barra V', 'triceps', 'bilateral', '{polea}', '{kg,reps}'),
    ('Extensión de tríceps en polea con cuerda', 'triceps', 'bilateral', '{polea}', '{kg,reps}'),
    ('Extensión de tríceps por encima de la cabeza en polea', 'triceps', 'bilateral', '{polea}', '{kg,reps}'),
    ('Extensión de tríceps tumbado con barra EZ', 'triceps', 'bilateral', '{barra}', '{kg,reps}'),
    ('Extensión de tríceps unilateral por encima de la cabeza en polea', 'triceps', 'unilateral', '{polea}', '{kg,reps}'),
    ('Press de tríceps en máquina', 'triceps', 'bilateral', '{maquina}', '{kg,reps}'),
    ('Press francés con barra EZ', 'triceps', 'bilateral', '{barra}', '{kg,reps}'),
    ('Press francés con mancuernas', 'triceps', 'bilateral', '{mancuerna}', '{kg,reps}')
) as v (name, block_key, laterality, equipment, metrics)
where c.name = v.name;

-- Ejercicios parecidos: por nombre o alias, sin tildes. El nombre idéntico se avisa en todo
-- el catálogo; el parecido, solo dentro del bloque (o en todo si aún no hay bloque).
create or replace function public.find_similar_catalog_exercises(
    p_name text,
    p_block_key text default null,
    p_limit integer default 5
)
returns table (
    id uuid,
    name text,
    primary_group text,
    block_key text,
    exact boolean,
    score real
)
language sql
stable
security invoker
set search_path = ''
as $$
    with query as (
        select public.exercise_name_key(p_name) as key
    ),
    names as (
        select c.id, public.exercise_name_key(c.name) as key
        from public.exercise_catalog c
        where c.is_active
        union all
        select a.catalog_exercise_id, a.alias_key
        from public.exercise_catalog_aliases a
    ),
    scored as (
        select
            n.id,
            bool_or(n.key = q.key) as exact,
            max(greatest(public.similarity(n.key, q.key), public.word_similarity(q.key, n.key))) as score
        from names n
        cross join query q
        group by n.id
    )
    select c.id, c.name, c.primary_group, c.block_key, s.exact, s.score
    from scored s
    join public.exercise_catalog c on c.id = s.id and c.is_active
    where length((select key from query)) >= 3
      and (
          s.exact
          or (s.score >= 0.6 and (p_block_key is null or c.block_key = p_block_key))
      )
    order by s.exact desc, s.score desc, c.name
    limit greatest(p_limit, 1)
$$;

-- Fusión de un duplicado: el historial, las plantillas y los alias pasan al ejercicio bueno,
-- y el nombre del duplicado queda como alias. Cada fila conserva su exercise_name original.
create or replace function public.merge_catalog_exercise(p_source_id uuid, p_target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_source public.exercise_catalog%rowtype;
    v_target public.exercise_catalog%rowtype;
    v_exercises integer;
    v_templates integer;
begin
    if not public.is_platform_admin() then
        raise exception 'Solo el equipo de NexTrain puede fusionar ejercicios.' using errcode = '42501';
    end if;
    if p_source_id = p_target_id then
        raise exception 'Elige dos ejercicios distintos.' using errcode = '22023';
    end if;

    -- Siempre en el mismo orden, para que dos fusiones a la vez no se bloqueen entre sí.
    perform 1 from public.exercise_catalog c
    where c.id in (p_source_id, p_target_id)
    order by c.id
    for update;

    select * into v_source from public.exercise_catalog c where c.id = p_source_id;
    select * into v_target from public.exercise_catalog c where c.id = p_target_id;
    if v_source.id is null or v_target.id is null or not v_source.is_active or not v_target.is_active then
        raise exception 'Los dos ejercicios tienen que estar activos.' using errcode = '22023';
    end if;

    update public.training_exercises t
    set catalog_exercise_id = p_target_id
    where t.catalog_exercise_id = p_source_id;
    get diagnostics v_exercises = row_count;

    -- Las plantillas guardan el id dentro del JSON.
    update public.training_templates t
    set structure = replace(t.structure::text, p_source_id::text, p_target_id::text)::jsonb
    where t.structure::text like '%' || p_source_id::text || '%';
    get diagnostics v_templates = row_count;

    update public.exercise_catalog_aliases a
    set catalog_exercise_id = p_target_id
    where a.catalog_exercise_id = p_source_id;

    insert into public.exercise_catalog_aliases (alias_key, alias, catalog_exercise_id, note)
    values (public.exercise_name_key(v_source.name), v_source.name, p_target_id, 'Fusionado')
    on conflict (alias_key) do update set catalog_exercise_id = excluded.catalog_exercise_id;

    update public.exercise_catalog c
    set variant_of = case when c.id = p_target_id then null else p_target_id end
    where c.variant_of = p_source_id;

    update public.exercise_catalog c
    set possible_duplicate_of = case when c.id = p_target_id then null else p_target_id end
    where c.possible_duplicate_of = p_source_id;

    update public.exercise_catalog c
    set merged_into = p_target_id
    where c.merged_into = p_source_id;

    update public.exercise_catalog c
    set is_active = false,
        merged_into = p_target_id,
        merged_at = now(),
        merged_by = auth.uid(),
        possible_duplicate_of = null,
        variant_of = null
    where c.id = p_source_id;

    return jsonb_build_object('exercises', v_exercises, 'templates', v_templates);
end;
$$;

revoke all on function public.find_similar_catalog_exercises(text, text, integer) from public, anon;
revoke all on function public.merge_catalog_exercise(uuid, uuid) from public, anon;

grant execute on function public.find_similar_catalog_exercises(text, text, integer) to authenticated, service_role;
grant execute on function public.merge_catalog_exercise(uuid, uuid) to authenticated;

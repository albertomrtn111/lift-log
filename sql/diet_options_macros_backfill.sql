-- Dieta por opciones basada en macros (fase 1: datos).
-- Aplicada en SaaS Asesorias el 2026-10-09 tras diet_options_macros_schema.sql.
-- Los nombres y cantidades escritos por el coach se conservan tal cual; solo se
-- rellenan las columnas nuevas. Lo que no casa queda sin vincular para hacerlo
-- desde el editor.

-- ---------------------------------------------------------------------------
-- 1. Alimentos nuevos: genéricos que usan los coaches y versiones cocidas
--    (vincular "Arroz cocido" al arroz seco triplicaría los macros)
-- ---------------------------------------------------------------------------
insert into public.foods (name, kcal, protein_g, carbs_g, fat_g, serving_size_g, source, is_public, is_generic, unit_weight_g, unit_label)
select v.name, v.kcal, v.p, v.c, v.f, 100, 'system', true, v.generic, v.unit_g, v.unit_label
from (values
    ('Carne magra (genérico)',        130::numeric, 22::numeric, 0::numeric,   4.5::numeric, true,  null::numeric, null::text),
    ('Fruta (genérico)',               55,  0.7, 13.5,  0.3, true,  150, 'ración'),
    ('Frutos rojos (genérico)',        45,  0.9, 10,    0.4, true,  null, null),
    ('Legumbre cocida (genérico)',    135,  9,   23,    1,   true,  null, null),
    ('Frutos secos (genérico)',       610, 20,   16,   54,   true,  null, null),
    ('Yogur alto en proteína',         60, 10,    4,    0.3, true,  120, 'unidad'),
    ('Kéfir',                          64,  3.4,  4.4,  3.5, false, null, null),
    ('Pechuga de pavo',               105, 24,    0,    1,   false, null, null),
    ('Arroz cocido',                  130,  2.7, 28,    0.3, false, null, null),
    ('Pasta cocida',                  158,  5.8, 31,    0.9, false, null, null),
    ('Patata cocida',                  87,  1.9, 20,    0.1, false, null, null),
    ('Tofu firme',                    144, 15.5,  2.8,  8.7, false, null, null),
    ('Brócoli',                        34,  2.8,  7,    0.4, false, null, null),
    ('Espinacas',                      23,  2.9,  3.6,  0.4, false, null, null),
    ('Calabacín',                      17,  1.2,  3.1,  0.3, false, null, null),
    ('Espárragos trigueros',           20,  2.2,  3.9,  0.1, false, null, null),
    ('Tomate',                         18,  0.9,  3.9,  0.2, false, 120, 'unidad'),
    ('Bebida de almendras',            13,  0.4,  0.1,  1.1, false, null, null),
    ('Queso parmesano',               431, 38,    4,   29,   false, null, null)
) as v(name, kcal, p, c, f, generic, unit_g, unit_label)
where not exists (
    select 1 from public.foods f where lower(btrim(f.name)) = lower(btrim(v.name)) and f.source = 'system'
);

-- La verdura "libre" sigue sin contar, pero la genérica pasa a marcarse como tal
update public.foods set is_generic = true
where source = 'system' and name in ('Verdura genérica', 'Pescado blanco', 'Pescado azul', 'Conservas de pescado');

-- ---------------------------------------------------------------------------
-- 2. Peso por unidad de alimentos que se prescriben en unidades
-- ---------------------------------------------------------------------------
update public.foods f
set unit_weight_g = v.unit_g, unit_label = v.unit_label
from (values
    ('Huevo', 60::numeric, 'unidad'),
    ('Claras de huevo', 33, 'unidad'),
    ('Plátano', 120, 'unidad'),
    ('Manzana', 180, 'unidad'),
    ('Naranja', 200, 'unidad'),
    ('Pera', 170, 'unidad'),
    ('Melocotón', 150, 'unidad'),
    ('Nectarina', 140, 'unidad'),
    ('Kiwi', 75, 'unidad'),
    ('Mandarina', 70, 'unidad'),
    ('Ciruela', 60, 'unidad'),
    ('Yogur natural', 125, 'unidad'),
    ('Yogur griego 0%', 120, 'unidad'),
    ('Yogur griego normal', 125, 'unidad'),
    ('Tortitas de arroz', 8, 'unidad'),
    ('Tortitas de maíz', 8, 'unidad'),
    ('Atún al natural', 52, 'lata'),
    ('Pan de molde', 25, 'rebanada'),
    ('Chocolate negro 85%', 10, 'onza'),
    ('Wraps / tortillas de trigo', 60, 'unidad'),
    ('Tortillas de maíz', 30, 'unidad'),
    ('Café solo', 60, 'taza')
) as v(name, unit_g, unit_label)
where f.source = 'system' and f.name = v.name and f.unit_weight_g is null;

-- ---------------------------------------------------------------------------
-- 3. Grupo de alimento (sirve para equivalencias y para la IA)
-- ---------------------------------------------------------------------------
update public.foods
set food_group = case
    when name ilike any (array['%fruta%', '%frutos rojos%', 'plátano', 'manzana', 'naranja', 'pera', 'melocotón', 'nectarina',
        'kiwi', 'mandarina', 'ciruela', 'arándanos', 'cerezas', 'frambuesas', 'fresas', 'higos', 'mango', 'melón', 'piña',
        'sandía', 'uvas', 'dátiles', 'pasas']) then 'fruit'
    when name ilike any (array['%verdura%', 'brócoli', 'espinacas', 'calabacín', 'espárragos%', 'tomate', 'tomate triturado'])
        then 'vegetable'
    when name ilike any (array['leche%', 'yogur%', 'kéfir', 'requesón', 'cottage%', 'queso fresco batido%', 'bebida de almendras'])
        then 'dairy'
    when kcal <= 0 then 'other'
    when protein_g * 4 >= greatest(carbs_g * 4, fat_g * 9) then 'protein'
    when carbs_g * 4 >= fat_g * 9 then 'carbs'
    else 'fat'
end
where food_group is null;

-- ---------------------------------------------------------------------------
-- 4. Vincular ítems existentes a alimentos
--    a) nombre exacto (sin tildes ni mayúsculas), prefiriendo alimentos del sistema
--    b) alias de los nombres más usados por los coaches
-- ---------------------------------------------------------------------------
with food_alias(alias, food_name) as (
    values
    ('fruta', 'Fruta (genérico)'),
    ('nueces', 'Nueces naturales'),
    ('verduras', 'Verdura genérica'),
    ('verdura', 'Verdura genérica'),
    ('verduras variadas', 'Verdura genérica'),
    ('verdura variada', 'Verdura genérica'),
    ('verdura libre', 'Verdura genérica'),
    ('verdura al gusto', 'Verdura genérica'),
    ('ensalada mixta', 'Verdura genérica'),
    ('cafe', 'Café solo'),
    ('patata', 'Patata cruda'),
    ('patata cocida', 'Patata cocida'),
    ('patata cocida o asada', 'Patata cocida'),
    ('patata asada', 'Patata cocida'),
    ('frutos secos', 'Frutos secos (genérico)'),
    ('queso fresco batido', 'Queso fresco batido 0%'),
    ('queso batido 0%', 'Queso fresco batido 0%'),
    ('queso', 'Queso semicurado'),
    ('yogur sin azucar', 'Yogur natural'),
    ('arroz', 'Arroz blanco seco'),
    ('arroz crudo', 'Arroz blanco seco'),
    ('arroz en crudo', 'Arroz blanco seco'),
    ('arroz (en seco)', 'Arroz blanco seco'),
    ('arroz blanco (en seco)', 'Arroz blanco seco'),
    ('arroz cocido', 'Arroz cocido'),
    ('pasta', 'Pasta seca'),
    ('pasta cruda', 'Pasta seca'),
    ('pasta en crudo', 'Pasta seca'),
    ('pasta (en seco)', 'Pasta seca'),
    ('pasta de trigo (en seco)', 'Pasta seca'),
    ('pasta cocida', 'Pasta cocida'),
    ('carne', 'Carne magra (genérico)'),
    ('carne o pescado', 'Carne magra (genérico)'),
    ('cualquier carne', 'Carne magra (genérico)'),
    ('cualquier tipo de carne', 'Carne magra (genérico)'),
    ('carne magra', 'Carne magra (genérico)'),
    ('chocolate negro', 'Chocolate negro 85%'),
    ('chocolate 85%', 'Chocolate negro 85%'),
    ('chocolate 85% cacao', 'Chocolate negro 85%'),
    ('yogur alto en proteina', 'Yogur alto en proteína'),
    ('yogur proteico', 'Yogur alto en proteína'),
    ('yogures proteicos', 'Yogur alto en proteína'),
    ('gnochi', 'Gnocchi sin cocinar'),
    ('huevos', 'Huevo'),
    ('huevos enteros', 'Huevo'),
    ('lomo', 'Lomo embuchado'),
    ('tortas de arroz', 'Tortitas de arroz'),
    ('pavo', 'Pechuga de pavo'),
    ('pechuga de pavo', 'Pechuga de pavo'),
    ('jamon york o pavo', 'Jamón york'),
    ('pollo', 'Pollo pechuga'),
    ('pechuga de pollo', 'Pollo pechuga'),
    ('pollo o pavo', 'Pollo pechuga'),
    ('cereales', 'Cereales integrales'),
    ('cereales sin azucar', 'Cereales integrales'),
    ('almendras', 'Almendra natural'),
    ('proteina', 'Proteína whey'),
    ('proteina en polvo', 'Proteína whey'),
    ('proteina en polvo (whey)', 'Proteína whey'),
    ('aceite de oliva virgen extra', 'Aceite de oliva'),
    ('aceite', 'Aceite de oliva'),
    ('lentejas', 'Lentejas cocidas'),
    ('legumbres cocidas', 'Legumbre cocida (genérico)'),
    ('cualquier tipo de legumbre', 'Legumbre cocida (genérico)'),
    ('frutos rojos', 'Frutos rojos (genérico)'),
    ('copos de avena', 'Avena'),
    ('kefir', 'Kéfir'),
    ('queso cottage', 'Cottage cheese'),
    ('salmon fresco', 'Salmón'),
    ('mantequilla de cacahuete', 'Crema de cacahuete'),
    ('ternera magra picada', 'Ternera magra'),
    ('carne picada 5%', 'Ternera magra'),
    ('calabacin a la plancha', 'Calabacín'),
    ('espinacas frescas', 'Espinacas'),
    ('brocoli', 'Brócoli'),
    ('queso parmesano rallado', 'Queso parmesano')
),
item_norm as (
    select i.id,
           lower(translate(btrim(i.food_name), 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU')) as norm
    from public.diet_meal_items i
    where i.food_id is null
),
food_norm as (
    select f.id, f.name, f.source,
           lower(translate(btrim(f.name), 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU')) as norm,
           row_number() over (
               partition by lower(translate(btrim(f.name), 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU'))
               order by (f.source = 'system') desc, f.created_at asc
           ) as rn
    from public.foods f
    where f.is_public = true
),
system_by_name as (
    select f.id, f.name,
           row_number() over (partition by f.name order by f.created_at asc) as rn
    from public.foods f
    where f.source = 'system'
),
resolved as (
    select n.id as item_id,
           coalesce(
               (select fn.id from food_norm fn where fn.norm = n.norm and fn.rn = 1),
               (select s.id from food_alias a join system_by_name s on s.name = a.food_name and s.rn = 1
                where a.alias = n.norm)
           ) as food_id
    from item_norm n
)
update public.diet_meal_items i
set food_id = r.food_id
from resolved r
where i.id = r.item_id and r.food_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Gramos normalizados ("libre", "opcional", "ración" de verdura... no cuentan)
-- ---------------------------------------------------------------------------
update public.diet_meal_items
set quantity_g = quantity
where quantity_g is null
  and quantity is not null
  and lower(btrim(coalesce(unit, ''))) in ('g', 'gr', 'grs', 'gramos', 'ml');

update public.diet_meal_items i
set quantity_g = i.quantity * f.unit_weight_g
from public.foods f
where i.food_id = f.id
  and i.quantity_g is null
  and i.quantity is not null
  and f.unit_weight_g is not null
  and lower(btrim(coalesce(i.unit, ''))) in ('unidad', 'unidades', 'uds', 'ud', 'ración', 'racion', 'lata', 'latas',
      'rebanada', 'rebanadas', 'rbn', 'onza', 'onzas', 'taza');

-- ---------------------------------------------------------------------------
-- 6. Macros calculados de cada ítem (alimentos definidos por serving_size_g)
-- ---------------------------------------------------------------------------
update public.diet_meal_items i
set kcal      = round(f.kcal      * i.quantity_g / f.serving_size_g, 1),
    protein_g = round(f.protein_g * i.quantity_g / f.serving_size_g, 1),
    carbs_g   = round(f.carbs_g   * i.quantity_g / f.serving_size_g, 1),
    fat_g     = round(f.fat_g     * i.quantity_g / f.serving_size_g, 1)
from public.foods f
where i.food_id = f.id
  and i.quantity_g is not null;

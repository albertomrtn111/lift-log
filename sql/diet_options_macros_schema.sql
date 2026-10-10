-- Dieta por opciones basada en macros (fase 1: modelo de datos).
-- Aplicada en SaaS Asesorias el 2026-10-09. Solo añade columnas y filas; no borra nada.
--
-- · foods: peso por unidad/ración, marca de genérico y grupo de alimento.
-- · diet_meals: objetivo de macros por comida (lo fija el coach a mano).
-- · diet_meal_items: alimento vinculado, gramos normalizados, macros calculados
--   y alternativas ("Arroz 100 g ó Pasta 90 g") dentro de una misma opción.

-- ---------------------------------------------------------------------------
-- foods
-- ---------------------------------------------------------------------------
alter table public.foods
    add column if not exists unit_weight_g numeric null,
    add column if not exists unit_label text null,
    add column if not exists is_generic boolean not null default false,
    add column if not exists food_group text null;

alter table public.foods
    drop constraint if exists foods_unit_weight_g_check,
    add constraint foods_unit_weight_g_check check (unit_weight_g is null or unit_weight_g > 0),
    drop constraint if exists foods_food_group_check,
    add constraint foods_food_group_check check (
        food_group is null or food_group in ('protein', 'carbs', 'fat', 'fruit', 'vegetable', 'dairy', 'other')
    );

-- ---------------------------------------------------------------------------
-- diet_meals: objetivo por comida
-- ---------------------------------------------------------------------------
alter table public.diet_meals
    add column if not exists target_kcal numeric null,
    add column if not exists target_protein_g numeric null,
    add column if not exists target_carbs_g numeric null,
    add column if not exists target_fat_g numeric null;

-- ---------------------------------------------------------------------------
-- diet_meal_items: alimento, gramos, macros y alternativas
-- ---------------------------------------------------------------------------
alter table public.diet_meal_items
    add column if not exists food_id uuid null references public.foods(id) on delete set null,
    add column if not exists quantity_g numeric null,
    add column if not exists kcal numeric null,
    add column if not exists protein_g numeric null,
    add column if not exists carbs_g numeric null,
    add column if not exists fat_g numeric null,
    -- Ítems con el mismo alternative_group dentro de una opción son intercambiables.
    -- El de menor order_index es la referencia; el resto llevan is_alternative = true
    -- y sus gramos se calculan para igualar equivalence_basis.
    add column if not exists alternative_group integer null,
    add column if not exists is_alternative boolean not null default false,
    add column if not exists equivalence_basis text null;

alter table public.diet_meal_items
    drop constraint if exists diet_meal_items_quantity_g_check,
    add constraint diet_meal_items_quantity_g_check check (quantity_g is null or quantity_g >= 0),
    drop constraint if exists diet_meal_items_equivalence_basis_check,
    add constraint diet_meal_items_equivalence_basis_check check (
        equivalence_basis is null or equivalence_basis in ('kcal', 'protein', 'carbs', 'fat')
    );

create index if not exists diet_meal_items_food_id_idx
    on public.diet_meal_items (food_id)
    where food_id is not null;

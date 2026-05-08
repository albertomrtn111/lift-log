-- ============================================================================
-- Nutrition tracking (MyFitnessPal-style)
-- ============================================================================
-- Tablas:
--   foods                  Catálogo público de alimentos (creado por usuarios o sistema)
--   recipes                Recetas (alimentos compuestos), también compartidas
--   recipe_ingredients     Ingredientes (food + gramos) de cada receta
--   nutrition_log_entries  Registro diario por cliente / comida / alimento
-- ============================================================================

-- Helper: trigger updated_at (idempotente)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- foods
-- ----------------------------------------------------------------------------
create table if not exists public.foods (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  brand           text,
  -- Macros expresadas por 100 g (norma MFP)
  kcal            numeric(8,2) not null check (kcal >= 0),
  protein_g       numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g         numeric(8,2) not null default 0 check (carbs_g >= 0),
  fat_g           numeric(8,2) not null default 0 check (fat_g >= 0),
  fiber_g         numeric(8,2),
  sugar_g         numeric(8,2),
  sodium_mg       numeric(8,2),
  -- Porción por defecto sugerida al añadir
  serving_size_g  numeric(8,2) not null default 100 check (serving_size_g > 0),
  serving_label   text,                                  -- p.ej. "1 rebanada"
  -- Procedencia
  source          text not null default 'user' check (source in ('user','system')),
  created_by      uuid references auth.users(id) on delete set null,
  is_public       boolean not null default true,
  -- Búsqueda
  search_text     text generated always as (lower(coalesce(name,'') || ' ' || coalesce(brand,''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists foods_search_idx on public.foods using gin (search_text gin_trgm_ops);
create index if not exists foods_name_idx   on public.foods (lower(name));
create index if not exists foods_creator_idx on public.foods (created_by);

drop trigger if exists foods_set_updated_at on public.foods;
create trigger foods_set_updated_at
before update on public.foods
for each row execute procedure public.set_updated_at();

-- pg_trgm para búsqueda fuzzy (idempotente)
create extension if not exists pg_trgm;

alter table public.foods enable row level security;

drop policy if exists "foods_select_public" on public.foods;
create policy "foods_select_public"
  on public.foods
  for select
  to authenticated
  using (is_public = true or created_by = auth.uid());

drop policy if exists "foods_insert_own" on public.foods;
create policy "foods_insert_own"
  on public.foods
  for insert
  to authenticated
  with check (created_by = auth.uid() and source = 'user');

drop policy if exists "foods_update_own" on public.foods;
create policy "foods_update_own"
  on public.foods
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "foods_delete_own" on public.foods;
create policy "foods_delete_own"
  on public.foods
  for delete
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- recipes
-- ----------------------------------------------------------------------------
create table if not exists public.recipes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  servings        numeric(8,2) not null default 1 check (servings > 0),
  serving_label   text,
  -- Totales pre-calculados (de toda la receta, no por porción)
  total_kcal      numeric(10,2) not null default 0,
  total_protein_g numeric(10,2) not null default 0,
  total_carbs_g   numeric(10,2) not null default 0,
  total_fat_g     numeric(10,2) not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  is_public       boolean not null default true,
  search_text     text generated always as (lower(coalesce(name,''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists recipes_search_idx on public.recipes using gin (search_text gin_trgm_ops);
create index if not exists recipes_creator_idx on public.recipes (created_by);

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
before update on public.recipes
for each row execute procedure public.set_updated_at();

alter table public.recipes enable row level security;

drop policy if exists "recipes_select_public" on public.recipes;
create policy "recipes_select_public"
  on public.recipes for select to authenticated
  using (is_public = true or created_by = auth.uid());

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
  on public.recipes for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
  on public.recipes for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
  on public.recipes for delete to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- recipe_ingredients
-- ----------------------------------------------------------------------------
create table if not exists public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  food_id     uuid not null references public.foods(id) on delete restrict,
  grams       numeric(10,2) not null check (grams > 0),
  order_index int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

alter table public.recipe_ingredients enable row level security;

drop policy if exists "recipe_ingredients_select" on public.recipe_ingredients;
create policy "recipe_ingredients_select"
  on public.recipe_ingredients for select to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and (r.is_public = true or r.created_by = auth.uid())
    )
  );

drop policy if exists "recipe_ingredients_modify_own" on public.recipe_ingredients;
create policy "recipe_ingredients_modify_own"
  on public.recipe_ingredients for all to authenticated
  using (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.created_by = auth.uid())
  )
  with check (
    exists (select 1 from public.recipes r where r.id = recipe_id and r.created_by = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- nutrition_log_entries
-- ----------------------------------------------------------------------------
create table if not exists public.nutrition_log_entries (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients(id) on delete cascade,
  log_date     date not null,
  -- Tipo de comida y nombre mostrado (permite custom)
  meal_type    text not null check (meal_type in ('breakfast','lunch','snack','dinner','other')),
  meal_label   text,                       -- nombre custom: "Pre-entreno", "Cena 2"...
  meal_order   int not null default 0,
  -- Origen del item (food O recipe)
  food_id      uuid references public.foods(id) on delete set null,
  recipe_id    uuid references public.recipes(id) on delete set null,
  -- Cantidad consumida
  quantity_g   numeric(10,2),              -- gramos cuando es food
  servings     numeric(10,2),              -- porciones cuando es recipe
  -- Snapshot de macros (para no romper si el food cambia o se borra)
  kcal         numeric(10,2) not null default 0,
  protein_g    numeric(10,2) not null default 0,
  carbs_g      numeric(10,2) not null default 0,
  fat_g        numeric(10,2) not null default 0,
  item_name    text not null,              -- nombre snapshot
  -- Día de entreno o descanso (para histórico/analítica)
  day_type     text check (day_type in ('training','rest')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint nle_one_source check (
    (food_id is not null and recipe_id is null) or
    (food_id is null     and recipe_id is not null)
  )
);

create index if not exists nle_client_date_idx on public.nutrition_log_entries (client_id, log_date);
create index if not exists nle_client_recent_idx on public.nutrition_log_entries (client_id, created_at desc);

drop trigger if exists nle_set_updated_at on public.nutrition_log_entries;
create trigger nle_set_updated_at
before update on public.nutrition_log_entries
for each row execute procedure public.set_updated_at();

alter table public.nutrition_log_entries enable row level security;

-- El cliente (auth.uid() == clients.user_id) lee/escribe sólo sus entradas.
drop policy if exists "nle_client_select_own" on public.nutrition_log_entries;
create policy "nle_client_select_own"
  on public.nutrition_log_entries for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nle_client_insert_own" on public.nutrition_log_entries;
create policy "nle_client_insert_own"
  on public.nutrition_log_entries for insert to authenticated
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nle_client_update_own" on public.nutrition_log_entries;
create policy "nle_client_update_own"
  on public.nutrition_log_entries for update to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "nle_client_delete_own" on public.nutrition_log_entries;
create policy "nle_client_delete_own"
  on public.nutrition_log_entries for delete to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

-- También lectura por el coach del cliente
drop policy if exists "nle_coach_select" on public.nutrition_log_entries;
create policy "nle_coach_select"
  on public.nutrition_log_entries for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      join public.coach_memberships m on m.coach_id = c.coach_id
      where c.id = client_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','coach')
    )
  );

-- ----------------------------------------------------------------------------
-- nutrition_day_settings (1 fila por client+fecha, persiste el day_type elegido)
-- ----------------------------------------------------------------------------
create table if not exists public.nutrition_day_settings (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  log_date   date not null,
  day_type   text not null check (day_type in ('training','rest')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, log_date)
);

drop trigger if exists nds_set_updated_at on public.nutrition_day_settings;
create trigger nds_set_updated_at
before update on public.nutrition_day_settings
for each row execute procedure public.set_updated_at();

alter table public.nutrition_day_settings enable row level security;

drop policy if exists "nds_client_all_own" on public.nutrition_day_settings;
create policy "nds_client_all_own"
  on public.nutrition_day_settings for all to authenticated
  using (
    exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid())
  );

drop policy if exists "nds_coach_select" on public.nutrition_day_settings;
create policy "nds_coach_select"
  on public.nutrition_day_settings for select to authenticated
  using (
    exists (
      select 1 from public.clients c
      join public.coach_memberships m on m.coach_id = c.coach_id
      where c.id = client_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','coach')
    )
  );

-- ----------------------------------------------------------------------------
-- Seed mínimo (sólo si la tabla está vacía)
-- ----------------------------------------------------------------------------
insert into public.foods (name, brand, kcal, protein_g, carbs_g, fat_g, serving_size_g, serving_label, source, is_public)
select * from (values
  ('Pechuga de pollo',         null,           165, 31.0,  0.0, 3.6, 100, '100 g',         'system', true),
  ('Arroz blanco cocido',      null,           130,  2.7, 28.0, 0.3, 150, '1 taza (150 g)','system', true),
  ('Arroz integral cocido',    null,           111,  2.6, 23.0, 0.9, 150, '1 taza (150 g)','system', true),
  ('Avena en copos',           null,           389, 16.9, 66.3, 6.9,  40, '40 g',          'system', true),
  ('Plátano',                  null,            89,  1.1, 23.0, 0.3, 120, '1 unidad',      'system', true),
  ('Manzana',                  null,            52,  0.3, 14.0, 0.2, 180, '1 unidad',      'system', true),
  ('Huevo entero',             null,           155, 13.0,  1.1,11.0,  50, '1 unidad',      'system', true),
  ('Clara de huevo',           null,            52, 11.0,  0.7, 0.2,  33, '1 clara',       'system', true),
  ('Atún al natural',          null,           116, 26.0,  0.0, 1.0,  80, '1 lata pequeña','system', true),
  ('Salmón',                   null,           208, 20.0,  0.0,13.0, 100, '100 g',         'system', true),
  ('Aceite de oliva virgen',   null,           884,  0.0,  0.0,100.0, 10, '1 cdita (10 g)','system', true),
  ('Almendras',                null,           579, 21.0, 22.0,49.0,  30, '30 g',          'system', true),
  ('Yogur natural',            null,            61,  3.5,  4.7, 3.3, 125, '1 yogur',       'system', true),
  ('Yogur griego natural 0%',  'Genérico',      59, 10.0,  3.6, 0.4, 150, '1 tarrina',     'system', true),
  ('Leche semidesnatada',      null,            47,  3.4,  4.8, 1.6, 200, '1 vaso (200 ml)','system', true),
  ('Pan integral',             null,           247,  9.0, 41.0, 3.4,  40, '1 rebanada',    'system', true),
  ('Patata cocida',            null,            87,  1.9, 20.0, 0.1, 150, '1 unidad',      'system', true),
  ('Boniato cocido',           null,            76,  1.4, 17.7, 0.1, 150, '1 unidad',      'system', true),
  ('Pasta cocida',             null,           158,  5.8, 31.0, 0.9, 100, '100 g',         'system', true),
  ('Lentejas cocidas',         null,           116,  9.0, 20.0, 0.4, 200, '1 plato (200 g)','system', true),
  ('Garbanzos cocidos',        null,           164,  8.9, 27.0, 2.6, 200, '1 plato (200 g)','system', true),
  ('Brócoli',                  null,            34,  2.8,  7.0, 0.4, 150, '150 g',         'system', true),
  ('Tomate',                   null,            18,  0.9,  3.9, 0.2, 120, '1 unidad',      'system', true),
  ('Aguacate',                 null,           160,  2.0,  9.0,15.0, 100, '½ unidad',      'system', true),
  ('Queso fresco batido 0%',   null,            45,  8.0,  3.5, 0.2, 100, '100 g',         'system', true),
  ('Whey Protein (genérica)',  'Genérico',     400, 80.0,  6.0, 6.0,  30, '1 cazo (30 g)', 'system', true),
  ('Mantequilla de cacahuete', null,           588, 25.0, 20.0,50.0,  20, '1 cda (20 g)',  'system', true),
  ('Chocolate negro 85%',      null,           598,  9.0, 14.0,55.0,  20, '20 g (2 onzas)','system', true)
) as v(name, brand, kcal, protein_g, carbs_g, fat_g, serving_size_g, serving_label, source, is_public)
where not exists (select 1 from public.foods where source = 'system');

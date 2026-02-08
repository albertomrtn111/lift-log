# Nutrition Data Layer

This directory handles all database interactions related to Nutrition/Diet features.

## Files Structure

- **`dietOptions.ts`**: Main file for CRUD operations on "Diet by Options" (Plan -> Meals -> Options -> Items).
  - `createDietPlanOptions`: Creates a new diet plan.
  - `updateDietPlanOptions`: Updates an existing diet plan (replaces all meals/options/items).
  - `insertMealsStructure`: **This is the core function for inserting meals/options/items into the database.** It handles `diet_meals`, `diet_meal_options`, and `diet_meal_items`.

- **`macros.ts`**: Handles logic for Macro-based plans (`macro_plans` table).

- **`types.ts`**: TypeScript interfaces mirroring the Supabase database schema for nutrition tables.

## Key Functions

### `insertMealsStructure` (in `dietOptions.ts`)
This helper function is critical. It takes a list of meals (from the frontend wizard) and inserts them hierarchically into the database:
1. Inserts into `diet_meals` (e.g., "Breakfast") -> gets ID.
2. Inserts into `diet_meal_options` (e.g., "Option A") using `meal_id` -> gets ID.
3. Inserts into `diet_meal_items` (e.g., "100g Rice") using `option_id` and `meal_id`.

**Note:** All inserts require `plan_id`, `coach_id`, and `client_id` for RLS policies.

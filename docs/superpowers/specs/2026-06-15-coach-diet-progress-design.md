# Coach Diet Progress Tab Design

## Goal

Add a `Dieta` subtab inside `Workspace > Progreso` for coaches. The tab shows what each athlete has tracked in nutrition logs, with daily macro totals and meal-level detail.

## Scope

- Add `Dieta` next to `General`, `Entrenamiento`, and `Cardio`.
- Reuse the existing progress date-range selector.
- Show daily totals for kcal, protein, carbs, and fat.
- Compare daily totals against the applicable active macro target.
- Expand each day to show meals and logged items.
- Keep the feature read-only for coaches.

## Data

The feature reads:

- `nutrition_log_entries` for tracked foods/recipes.
- `nutrition_day_settings` for `training` or `rest` day type.
- `macro_plans` for target kcal/protein/carbs/fat. If the plan has `day_type_config`, use the target for the day's type.

Coach access follows the existing `requireActiveCoachId` and client ownership checks used in `progress-actions.ts`.

## UI

Desktop:

- KPI cards across the top.
- A daily list/card table with macro totals and target adherence.
- Expandable day details grouped by meal.

Mobile:

- Single-column cards.
- No wide table required for the diet subtab.
- Buttons and expand targets remain at least 40px high where practical.

## Testing

- Add a pure aggregation helper in `src/lib/nutrition/progress.js`.
- Add Node tests for day totals, meal grouping, day-type targets, and adherence.
- Run the focused test and `npm run build`.

# Coach Diet Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coach-facing `Dieta` progress subtab with daily macro totals and meal-level nutrition log details.

**Architecture:** Put nutrition aggregation in a pure helper so it is testable without React or Supabase. Add a server action to fetch authorized coach data and feed a dedicated `DietProgressView` component from `ProgresoTab`.

**Tech Stack:** Next.js server actions, Supabase, React, lucide-react, existing UI Card/Button/Badge components, Node test runner.

---

### Task 1: Pure Nutrition Aggregation

**Files:**
- Create: `src/lib/nutrition/progress.js`
- Test: `scripts/nutrition-progress.test.mjs`

- [ ] **Step 1: Write the failing test**

Create tests that call `buildDietProgressData` with nutrition entries, day settings, and macro plans. Assert daily totals, meal grouping, and adherence against training/rest targets.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/nutrition-progress.test.mjs`
Expected: FAIL because `src/lib/nutrition/progress.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement `buildDietProgressData({ entries, daySettings, macroPlans, dateFrom, dateTo })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/nutrition-progress.test.mjs`
Expected: PASS.

### Task 2: Server Action

**Files:**
- Modify: `src/app/(coach)/coach/workspace/progress-actions.ts`

- [ ] **Step 1: Add diet progress types**

Define `DietProgressData`, `DietDayProgress`, `DietMealProgress`, `DietMacroTotals`, and `DietMacroTargets`.

- [ ] **Step 2: Add `getDietProgressData`**

Use `requireActiveCoachId`, verify client access, fetch `nutrition_log_entries`, `nutrition_day_settings`, and `macro_plans`, then call `buildDietProgressData`.

- [ ] **Step 3: Type-check through build**

Run: `npm run build`
Expected: PASS.

### Task 3: Diet Progress UI

**Files:**
- Create: `src/components/coach/workspace/progress/DietProgressView.tsx`
- Modify: `src/components/coach/workspace/ProgresoTab.tsx`

- [ ] **Step 1: Add `Dieta` subtab state**

Extend `SubTab` to include `diet`, import `getDietProgressData`, and fetch diet data lazily when the diet tab is active.

- [ ] **Step 2: Build `DietProgressView`**

Render KPI cards, daily macro cards, progress bars, and expandable meal details.

- [ ] **Step 3: Verify mobile layout**

Use single-column day cards by default and responsive grids from `sm` upward.

### Task 4: Verification

**Files:**
- Test: `scripts/nutrition-progress.test.mjs`

- [ ] **Step 1: Run focused test**

Run: `node --test scripts/nutrition-progress.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run diff check**

Run: `git diff --check`
Expected: no output.

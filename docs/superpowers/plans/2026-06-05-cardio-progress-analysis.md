# Cardio Progress Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a coach-facing cardio analysis view with weekly context, useful collapsed session cards, structured split analysis, and pace/heart-rate charts.

**Architecture:** Add a focused cardio analysis helper that expands planned structures into expected segments, slices Strava streams according to those segments, and falls back to Strava laps or whole-activity summaries. Server progress data will fetch the stored streams/laps linked to each completed cardio session, while the React view renders metrics, segment cards/tables, and charts without owning calculation logic.

**Tech Stack:** Next.js App Router, React client components, Supabase, Recharts, Node test runner.

---

### Task 1: Cardio Analysis Helper

**Files:**
- Create: `src/lib/cardio/analysis.js`
- Create: `scripts/cardio-analysis.test.mjs`

- [ ] Write failing tests for segmenting a structured workout by planned distance, planned duration, interval work/recovery expansion, fallback laps, and chart point generation.
- [ ] Run `node --test scripts/cardio-analysis.test.mjs` and verify the helper is missing.
- [ ] Implement `analyzeCardioSessionExecution({ structure, streams, laps, session })`.
- [ ] Run the test again and verify it passes.

### Task 2: Fetch Analysis Data

**Files:**
- Modify: `src/app/(coach)/coach/workspace/progress-actions.ts`

- [ ] Extend `CardioSessionProgress` with `analysisSegments`, `chartPoints`, and `chartAxis`.
- [ ] Select `strava_activity_id` from `cardio_sessions`.
- [ ] Fetch `strava_activity_streams` and `strava_activity_laps` for all linked Strava activities in the date range.
- [ ] Call `analyzeCardioSessionExecution` per session.
- [ ] Preserve existing sessions when no Strava data exists.

### Task 3: Redesign Session Cards and Detail

**Files:**
- Modify: `src/components/coach/workspace/progress/CardioProgressView.tsx`

- [ ] Add weekly analysis summary with planned vs actual km, differential, average RPE, average HR, average pace, and review count.
- [ ] Redesign collapsed cards around km completed, delta vs plan, pace, RPE, HR, feedback preview, and compact planned workout.
- [ ] Replace the existing detail layout with analysis header, planned workout, segment table/cards first, and charts below.
- [ ] Ensure the segment view uses stacked mobile cards and a desktop table.

### Task 4: Verification

**Files:**
- Test: `scripts/cardio-analysis.test.mjs`
- Test: existing cardio/Strava tests

- [ ] Run `node --test scripts/cardio-analysis.test.mjs scripts/cardio-structure.test.mjs scripts/cardio-display.test.mjs scripts/number-format.test.mjs scripts/strava-sport-mapping.test.mjs scripts/strava-notification.test.mjs scripts/strava-cardio-cleanup.test.mjs scripts/strava-lap-metrics.test.mjs`.
- [ ] Run full Next build.
- [ ] Check `git diff --check`.
- [ ] If browser tooling is available, inspect the cardio progress flow at 390px; otherwise note the limitation.


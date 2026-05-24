# Chat NextIA Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private per-athlete NextIA chat inside the coach workspace with an optimized athlete context payload.

**Architecture:** Store NextIA messages in a dedicated Supabase table separate from human `messages`. Use server actions to validate coach access, persist user/assistant messages, build fresh athlete context, call Gemini, and return the updated thread. Add a compact chat panel to `ResumenTab` and keep the context formatting in focused helper modules with unit tests.

**Tech Stack:** Next.js App Router, React client components, Supabase, RLS SQL, Gemini via `callGemini`, Node test runner.

---

## File Structure

- Create `sql/create_nextia_chat_messages.sql`: table, indexes, RLS policies, grants for the private coach IA chat.
- Create `src/lib/ai/nextia-context-format.js`: pure formatting/trimming helpers for tests and prompt payload control.
- Create `scripts/nextia-context-format.test.mjs`: unit tests for message trimming, event timing, and deterministic section formatting.
- Create `src/lib/ai/nextia-athlete-context.ts`: server-only Supabase data loader and prompt context builder.
- Create `src/components/coach/workspace/nextia-actions.ts`: server actions for loading messages and sending a coach prompt to NextIA.
- Create `src/components/coach/workspace/NextIAChatPanel.tsx`: client UI panel embedded in the workspace summary.
- Modify `src/components/coach/workspace/ResumenTab.tsx`: place `Chat NextIA` to the left of the existing summary content on desktop.

## Tasks

### Task 1: Context Formatting Helpers

**Files:**
- Create: `src/lib/ai/nextia-context-format.js`
- Test: `scripts/nextia-context-format.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEventTiming,
  formatContextSections,
  takeRecentChatMessages,
} from '../src/lib/ai/nextia-context-format.js'

test('keeps only the latest chat messages in chronological order', () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `mensaje ${index + 1}`,
    created_at: `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00Z`,
  }))

  const recent = takeRecentChatMessages(messages, 12)

  assert.equal(recent.length, 12)
  assert.equal(recent[0].content, 'mensaje 3')
  assert.equal(recent[11].content, 'mensaje 14')
})

test('computes event timing from a reference date', () => {
  const timing = buildEventTiming('2026-05-18', '2026-06-14')

  assert.equal(timing.daysUntil, 27)
  assert.equal(timing.weeksUntil, 3.9)
  assert.equal(timing.label, 'Faltan 27 dias (3.9 semanas)')
})

test('formats compact context sections and skips empty sections', () => {
  const text = formatContextSections([
    { title: 'Perfil atleta', content: 'Resumen util' },
    { title: 'Vacio', content: '' },
    { title: 'Eventos', content: '- Maraton: faltan 27 dias' },
  ])

  assert.match(text, /## Perfil atleta\nResumen util/)
  assert.doesNotMatch(text, /Vacio/)
  assert.match(text, /## Eventos\n- Maraton/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/nextia-context-format.test.mjs`

Expected: FAIL with module not found for `nextia-context-format.js`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/ai/nextia-context-format.js` with:

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseLocalDate(value) {
  return new Date(`${value}T12:00:00`)
}

export function buildEventTiming(referenceDate, eventDate) {
  const ref = parseLocalDate(referenceDate)
  const event = parseLocalDate(eventDate)
  const daysUntil = Math.round((event.getTime() - ref.getTime()) / MS_PER_DAY)
  const weeksUntil = Number((daysUntil / 7).toFixed(1))

  return {
    daysUntil,
    weeksUntil,
    label:
      daysUntil === 0
        ? 'Es hoy'
        : daysUntil > 0
          ? `Faltan ${daysUntil} dias (${weeksUntil} semanas)`
          : `Fue hace ${Math.abs(daysUntil)} dias`,
  }
}

export function takeRecentChatMessages(messages, limit = 12) {
  return [...messages]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-limit)
}

export function formatContextSections(sections) {
  return sections
    .map((section) => ({
      title: section.title,
      content: typeof section.content === 'string' ? section.content.trim() : '',
    }))
    .filter((section) => section.content.length > 0)
    .map((section) => `## ${section.title}\n${section.content}`)
    .join('\n\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/nextia-context-format.test.mjs`

Expected: PASS.

### Task 2: Supabase Schema

**Files:**
- Create: `sql/create_nextia_chat_messages.sql`

- [ ] **Step 1: Add SQL schema**

Create `sql/create_nextia_chat_messages.sql` with a `nextia_chat_messages` table, `role` check constraint, indexes on `(coach_id, client_id, created_at)`, RLS enabled, and policies allowing only the active coach membership for that `coach_id`.

- [ ] **Step 2: Verify SQL structure locally**

Run: `rg -n "nextia_chat_messages|enable row level security|coach_id" sql/create_nextia_chat_messages.sql`

Expected: table, RLS, policies and indexes are present.

### Task 3: Server Context Builder

**Files:**
- Create: `src/lib/ai/nextia-athlete-context.ts`
- Modify: none

- [ ] **Step 1: Build server loader**

Create a server-only module that exports `buildNextIAAthleteContext({ supabase, coachId, clientId, recentMessages })`.

It must load:
- generated athlete profile from `athlete_ai_profiles`
- generated coach profile from `coach_ai_profiles`
- planned future events from `client_events`
- latest check-in plus review from `checkins` and `reviews`
- active program plus `training_days`, `training_exercises`, and `training_exercise_sets`
- last 28 days of `cardio_sessions`
- last 28 days of `client_metrics`, `diet_adherence_logs`, and `workout_logs`
- recent NextIA messages passed by the caller

- [ ] **Step 2: Format compact sections**

Use `formatContextSections`, `takeRecentChatMessages`, and `buildEventTiming` from `nextia-context-format.js`. Keep each section compact and deterministic.

### Task 4: Server Actions And Gemini Call

**Files:**
- Create: `src/components/coach/workspace/nextia-actions.ts`

- [ ] **Step 1: Add actions**

Create:
- `getNextIAMessagesAction(coachId, clientId)`
- `sendNextIAMessageAction({ coachId, clientId, content })`

Both actions must use `requireActiveCoachId(coachId)`, verify the client belongs to the coach, and read/write only `nextia_chat_messages`.

- [ ] **Step 2: Generate assistant response**

`sendNextIAMessageAction` should:
1. insert the user message
2. load recent messages
3. call `buildNextIAAthleteContext`
4. call `callGemini` with a Spanish assistant prompt
5. insert the assistant message
6. return the latest messages

### Task 5: Workspace UI

**Files:**
- Create: `src/components/coach/workspace/NextIAChatPanel.tsx`
- Modify: `src/components/coach/workspace/ResumenTab.tsx`

- [ ] **Step 1: Add chat panel**

Build a client component with:
- message list
- empty state with short suggested prompts
- textarea input
- send button
- loading state
- error text

- [ ] **Step 2: Embed in ResumenTab**

Change the root layout of `ResumenTab` so desktop uses a left column for `Chat NextIA` and a right column for the existing summary content. On smaller screens, stack the chat above the summary.

### Task 6: Verification

**Files:**
- No new files

- [ ] **Step 1: Run focused tests**

Run: `node --test scripts/nextia-context-format.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Manual smoke test**

Open a workspace athlete summary, send a short NextIA message, confirm the assistant responds and the human messages page is unaffected.

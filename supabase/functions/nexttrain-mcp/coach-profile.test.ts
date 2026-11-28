import assert from 'node:assert/strict'
import { buildCoachProfile, registerCoachProfileTools } from './coach-profile.ts'
import { outputSchemas } from './output-schemas.ts'
import { promptTexts } from './prompts.ts'
import { jsonResult, type ToolHelpers, toolError } from './shared.ts'

const coach = '22222222-2222-4222-8222-222222222222'

function tool(rows: any[], seen: string[] = []) {
  const db = {
    from(table: string) {
      seen.push(table)
      const filters: Array<(row: any) => boolean> = []
      const query: any = {
        select(columns: string) { seen.push(columns); return query },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query },
        maybeSingle() { return Promise.resolve({ data: rows.find((row) => filters.every((filter) => filter(row))) ?? null, error: null }) },
      }
      return query
    },
  }
  const tools = new Map<string, any>()
  const helpers: ToolHelpers = {
    resolveCoach: async () => ({ coachId: coach, timeZone: 'Europe/Madrid' }),
    requireClient: async () => ({}),
    jsonResult, toolError, audit() {},
  }
  registerCoachProfileTools({ registerTool: (name: string, config: any, run: any) => tools.set(name, { config, run }) }, db, helpers)
  return tools.get('get_coach_profile')
}

const row = {
  coach_id: coach, profile_status: 'approved', approved_at: '2026-10-01T10:00:00Z',
  specialty: ['running', 'strength'], client_types: [], training_philosophy: 'Consistencia antes que intensidad.',
  progression_style: '', nutrition_rules: 'Proteína mínima 2 g/kg.', communication_tone: 'Cercano y directo.',
  generated_profile_summary: null, generated_methodology: { principles: ['Progresión lenta'] },
  generated_communication_style: 'Tuteo, frases cortas.', generated_master_rules: { rules: ['No subir más de un 10 % semanal'] },
  generated_system_prompt: 'secreto', generated_profile_json: { professional_summary: 'Coach híbrido.', system_prompt: 'secreto' },
}

Deno.test('get_coach_profile returns the approved methodology without the system prompt', async () => {
  const seen: string[] = []
  const result = await tool([row], seen).run({})
  assert.equal(result.isError, undefined)
  const data = result.structuredContent
  outputSchemas.get_coach_profile.parse(data)
  assert.equal(data.coach_id, coach)
  assert.equal(data.note, null)
  // El resumen cae al JSON generado cuando la columna está vacía.
  assert.equal(data.profile.summary, 'Coach híbrido.')
  assert.deepEqual(data.profile.master_rules, { rules: ['No subir más de un 10 % semanal'] })
  assert.equal(data.profile.communication_style, 'Tuteo, frases cortas.')
  // Solo lo que el coach ha contestado.
  assert.deepEqual(data.profile.answers.profile, { specialty: ['running', 'strength'] })
  assert.deepEqual(data.profile.answers.training, { philosophy: 'Consistencia antes que intensidad.' })
  assert.deepEqual(data.profile.answers.nutrition, { rules: 'Proteína mínima 2 g/kg.' })
  assert.doesNotMatch(result.content[0].text, /secreto/)
  assert.doesNotMatch(seen.join(' '), /generated_system_prompt/)
})

Deno.test('get_coach_profile tells the assistant when there is no profile or it is not approved', async () => {
  const empty = await tool([]).run({})
  assert.equal(empty.structuredContent.profile, null)
  assert.match(empty.structuredContent.note, /Perfil IA del coach/)
  const draft = await tool([{ ...row, profile_status: 'draft' }]).run({})
  assert.match(draft.structuredContent.note, /no está aprobado/)
  assert.equal(buildCoachProfile(null), null)
})

Deno.test('client workflows start by reading the coach and athlete profiles', () => {
  for (const text of [promptTexts.weeklyReview('Ana'), promptTexts.nextBlock('Ana'), promptTexts.seasonPlan('Ana')]) {
    assert.match(text, /get_coach_profile/)
    assert.match(text, /get_athlete_profile/)
  }
})

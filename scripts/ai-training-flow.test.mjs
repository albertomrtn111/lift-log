import assert from 'node:assert/strict'
import test from 'node:test'

import { getAITrainingWizardConfig } from '../src/lib/training/ai-training-flow.js'

test('getAITrainingWizardConfig opens active program when modifying', () => {
  assert.deepEqual(
    getAITrainingWizardConfig({ mode: 'modify', activeProgramId: 'program-1' }),
    { programId: 'program-1', step: 2 }
  )
})

test('getAITrainingWizardConfig opens new program flow when generating', () => {
  assert.deepEqual(
    getAITrainingWizardConfig({ mode: 'generate', activeProgramId: 'program-1' }),
    { programId: null, step: 1 }
  )
})

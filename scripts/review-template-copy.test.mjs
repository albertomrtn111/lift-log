import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDuplicatedReviewTemplateInput } from '../src/lib/reviews/review-template-copy.js'

test('buildDuplicatedReviewTemplateInput copies review settings with a copy suffix', () => {
  const input = buildDuplicatedReviewTemplateInput({
    name: 'Check-in semanal',
    description: 'Revision runner',
    review_type: 'weekly',
    form_template_id: 'form-1',
    default_frequency_days: 7,
    include_body_metrics: true,
    include_performance_metrics: false,
    include_general_metrics: true,
    include_progress_photos: true,
    photos_required: false,
    photos_max_items: 6,
    is_active: true,
  })

  assert.deepEqual(input, {
    name: 'Check-in semanal (copia)',
    description: 'Revision runner',
    review_type: 'weekly',
    form_template_id: 'form-1',
    default_frequency_days: 7,
    include_body_metrics: true,
    include_performance_metrics: false,
    include_general_metrics: true,
    include_progress_photos: true,
    photos_required: false,
    photos_max_items: 6,
    is_active: true,
  })
})

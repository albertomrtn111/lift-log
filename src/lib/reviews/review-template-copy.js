export function buildDuplicatedReviewTemplateInput(template) {
  return {
    name: `${template.name} (copia)`,
    description: template.description,
    review_type: template.review_type,
    form_template_id: template.form_template_id,
    default_frequency_days: template.default_frequency_days,
    include_body_metrics: template.include_body_metrics,
    include_performance_metrics: template.include_performance_metrics,
    include_general_metrics: template.include_general_metrics,
    include_progress_photos: template.include_progress_photos,
    photos_required: template.photos_required,
    photos_max_items: template.photos_max_items,
    is_active: template.is_active,
  }
}

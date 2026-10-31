// Tableros de ejemplo que se crean la primera vez que el coach abre Analítica.
// Están hechos con las mismas piezas que el constructor, así que el coach los
// puede editar, duplicar o restaurar.

/**
 * @typedef {import('./engine.js').WidgetSpec & { title: string, layout: { w: number, h: 'sm' | 'md' | 'lg' } }} TemplateWidget
 * @typedef {{
 *   scope: 'portfolio' | 'athlete'
 *   name: string
 *   isHome: boolean
 *   filters: { period: string, status: 'active', athleteIds: string[], athleteMode: 'all' | 'single' }
 *   widgets: TemplateWidget[]
 * }} BoardTemplate
 */

/** @type {BoardTemplate[]} */
export const BOARD_TEMPLATES = [
  {
    scope: 'portfolio',
    name: 'Cartera',
    isHome: true,
    filters: { period: '12w', status: 'active', athleteIds: [], athleteMode: 'all' },
    widgets: [
      { title: 'Adherencia de fuerza (mediana)', metric: 'adherence', visual: 'kpi', dimensions: ['none'], layout: { w: 3, h: 'sm' } },
      { title: 'Δ e1RM del bloque (mediana)', metric: 'block_e1rm', visual: 'kpi', dimensions: ['none'], layout: { w: 3, h: 'sm' } },
      { title: 'Series por semana', metric: 'sets_per_week', visual: 'kpi', dimensions: ['none'], options: { compare: true }, layout: { w: 3, h: 'sm' } },
      { title: 'Km de cardio', metric: 'cardio_km', visual: 'kpi', dimensions: ['none'], options: { compare: true }, layout: { w: 3, h: 'sm' } },
      {
        title: 'Atletas',
        metric: 'days_since_log',
        visual: 'table',
        dimensions: ['athlete'],
        options: { columns: ['sets_per_week', 'adherence', 'block_e1rm', 'e1rm_change', 'rir_dev', 'weight', 'cardio_km'] },
        layout: { w: 12, h: 'lg' },
      },
      { title: 'Progreso e1RM por atleta', metric: 'e1rm_change', visual: 'bar', dimensions: ['athlete'], layout: { w: 6, h: 'md' } },
      { title: '¿Quién responde a más volumen?', metric: 'sets_per_week', visual: 'scatter', dimensions: ['athlete'], options: { yMetric: 'e1rm_change' }, layout: { w: 6, h: 'md' } },
      { title: 'Series por semana y atleta', metric: 'sets', visual: 'heatmap', dimensions: ['week', 'athlete'], options: { topN: 20 }, layout: { w: 12, h: 'md' } },
      { title: 'Km de cardio por semana y disciplina', metric: 'cardio_km', visual: 'bar', dimensions: ['week', 'discipline'], layout: { w: 12, h: 'md' } },
    ],
  },
  {
    scope: 'athlete',
    name: 'Atleta',
    isHome: false,
    filters: { period: '12w', status: 'active', athleteIds: [], athleteMode: 'single' },
    widgets: [
      { title: 'Series por semana', metric: 'sets_per_week', visual: 'kpi', dimensions: ['none'], options: { compare: true }, layout: { w: 3, h: 'sm' } },
      { title: 'Adherencia de fuerza', metric: 'adherence', visual: 'kpi', dimensions: ['none'], layout: { w: 3, h: 'sm' } },
      { title: 'Δ e1RM del bloque', metric: 'block_e1rm', visual: 'kpi', dimensions: ['none'], layout: { w: 3, h: 'sm' } },
      { title: 'Cambio de peso', metric: 'weight_change', visual: 'kpi', dimensions: ['none'], layout: { w: 3, h: 'sm' } },
      { title: 'e1RM por semana de sus ejercicios principales', metric: 'e1rm', visual: 'line', dimensions: ['week', 'exercise'], options: { topN: 5 }, layout: { w: 12, h: 'lg' } },
      {
        title: 'Ejercicios',
        metric: 'sets',
        visual: 'table',
        dimensions: ['exercise'],
        options: { columns: ['top_kg', 'e1rm', 'e1rm_change', 'rir_avg', 'tonnage'] },
        layout: { w: 12, h: 'lg' },
      },
      { title: 'Series por semana y grupo muscular', metric: 'sets', visual: 'heatmap', dimensions: ['week', 'muscle_group'], options: { topN: 15 }, layout: { w: 12, h: 'md' } },
      { title: 'RIR medio por semana', metric: 'rir_avg', visual: 'line', dimensions: ['week'], layout: { w: 6, h: 'md' } },
      { title: 'Peso corporal', metric: 'weight', visual: 'line', dimensions: ['day'], layout: { w: 6, h: 'md' } },
      { title: 'Cardio por semana y disciplina', metric: 'cardio_min', visual: 'bar', dimensions: ['week', 'discipline'], layout: { w: 6, h: 'md' } },
      { title: 'FC media del cardio', metric: 'cardio_hr', visual: 'line', dimensions: ['week', 'discipline'], layout: { w: 6, h: 'md' } },
    ],
  },
]

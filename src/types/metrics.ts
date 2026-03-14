export type MetricValueType = 'number' | 'text' | 'scale'
export type MetricCategory = 'body' | 'performance' | 'general'

export interface MetricDefinition {
    id: string
    coach_id: string
    name: string
    description?: string | null
    unit?: string | null
    value_type: MetricValueType
    category: MetricCategory
    min_value?: number | null
    max_value?: number | null
    is_active: boolean
    sort_order: number
    created_at: string
}

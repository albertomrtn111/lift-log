import type { Dimension, Visual } from '@/lib/analytics/catalog'
import type { WidgetFilters, WidgetOptions } from '@/lib/analytics/engine'

export type WidgetWidth = 3 | 4 | 6 | 8 | 12
export type WidgetHeight = 'sm' | 'md' | 'lg'

export interface BoardFilterState {
    period: string
    from: string | null
    to: string | null
    status: 'active' | 'inactive' | 'all'
    athleteIds: string[]
    /** single: el tablero enseña un atleta cada vez, con anterior/siguiente */
    athleteMode: 'all' | 'single'
}

export interface AnalyticsPage {
    id: string
    name: string
    scope: 'portfolio' | 'athlete' | 'custom'
    isSystem: boolean
    isHome: boolean
    filters: BoardFilterState
    sortOrder: number
}

export interface AnalyticsWidget {
    id: string
    pageId: string
    title: string
    metric: string
    visual: Visual
    dimensions: Dimension[]
    filters: WidgetFilters
    options: WidgetOptions
    layout: { w: WidgetWidth; h: WidgetHeight }
    sortOrder: number
}

/** Lo que guarda el constructor: un gráfico sin id ni orden */
export type WidgetDraft = Omit<AnalyticsWidget, 'id' | 'pageId' | 'sortOrder'>

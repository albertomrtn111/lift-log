import type { SupabaseClient } from '@supabase/supabase-js'
import { BOARD_TEMPLATES, type BoardTemplate } from '@/lib/analytics/templates'
import { DIMENSIONS, METRICS, PERIODS, VISUALS, type Dimension, type Visual } from '@/lib/analytics/catalog'
import type { AnalyticsPage, AnalyticsWidget, BoardFilterState, WidgetHeight, WidgetWidth } from '@/types/analytics'

// Lectura, normalización y siembra de tableros. Lo usan la página (servidor)
// y las acciones; las filas de la base de datos nunca llegan tal cual al cliente.

export const PAGE_COLUMNS = 'id, name, scope, is_system, is_home, default_filters, sort_order'
export const WIDGET_COLUMNS = 'id, page_id, title, metric_key, visual, dimensions, filters, options, layout, sort_order'

const WIDTHS: WidgetWidth[] = [3, 4, 6, 8, 12]
const HEIGHTS: WidgetHeight[] = ['sm', 'md', 'lg']

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function normalizeFilters(value: any): BoardFilterState {
    const status = value?.status === 'inactive' || value?.status === 'all' ? value.status : 'active'
    return {
        period: typeof value?.period === 'string' && value.period in PERIODS ? value.period : '12w',
        from: typeof value?.from === 'string' ? value.from : null,
        to: typeof value?.to === 'string' ? value.to : null,
        status,
        athleteIds: stringList(value?.athleteIds),
        athleteMode: value?.athleteMode === 'single' ? 'single' : 'all',
    }
}

export function toPage(row: any): AnalyticsPage {
    return {
        id: row.id,
        name: row.name,
        scope: row.scope,
        isSystem: !!row.is_system,
        isHome: !!row.is_home,
        filters: normalizeFilters(row.default_filters),
        sortOrder: row.sort_order ?? 0,
    }
}

export function toWidget(row: any): AnalyticsWidget {
    const layout = row.layout ?? {}
    return {
        id: row.id,
        pageId: row.page_id,
        title: row.title ?? '',
        metric: row.metric_key,
        visual: (row.visual in VISUALS ? row.visual : 'bar') as Visual,
        dimensions: stringList(row.dimensions).filter((dimension): dimension is Dimension => dimension in DIMENSIONS),
        filters: {
            exerciseKeys: stringList(row.filters?.exerciseKeys),
            groups: stringList(row.filters?.groups),
            disciplines: stringList(row.filters?.disciplines),
            athleteIds: stringList(row.filters?.athleteIds),
        },
        options: {
            compare: !!row.options?.compare,
            topN: Number.isInteger(row.options?.topN) ? row.options.topN : undefined,
            columns: stringList(row.options?.columns).filter(key => key in METRICS),
            yMetric: typeof row.options?.yMetric === 'string' && row.options.yMetric in METRICS ? row.options.yMetric : undefined,
        },
        layout: {
            w: WIDTHS.includes(layout.w) ? layout.w : 6,
            h: HEIGHTS.includes(layout.h) ? layout.h : 'md',
        },
        sortOrder: row.sort_order ?? 0,
    }
}

export function templateWidgetRows(template: BoardTemplate, pageId: string, coachId: string) {
    return template.widgets.map((widget, index) => ({
        page_id: pageId,
        coach_id: coachId,
        title: widget.title,
        metric_key: widget.metric,
        visual: widget.visual,
        dimensions: widget.dimensions,
        filters: widget.filters ?? {},
        options: widget.options ?? {},
        layout: widget.layout,
        sort_order: index,
        created_by: 'system',
    }))
}

async function listBoards(supabase: SupabaseClient, coachId: string) {
    const { data, error } = await supabase
        .from('analytics_pages')
        .select(PAGE_COLUMNS)
        .eq('coach_id', coachId)
        .order('sort_order')
        .order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toPage)
}

/**
 * La primera vez que el coach abre Analítica se crean los tableros de ejemplo.
 * Van en una sola sentencia: si dos peticiones llegan a la vez, el índice de un
 * solo tablero de inicio hace que solo una los cree y la otra lee los suyos.
 */
export async function ensureBoards(supabase: SupabaseClient, coachId: string) {
    const existing = await listBoards(supabase, coachId)
    if (existing.length > 0) return existing

    const { data: pages, error } = await supabase
        .from('analytics_pages')
        .insert(BOARD_TEMPLATES.map((template, index) => ({
            coach_id: coachId,
            name: template.name,
            scope: template.scope,
            is_system: true,
            is_home: template.isHome,
            default_filters: template.filters,
            sort_order: index,
        })))
        .select('id, scope')
    if (error?.code === '23505') return listBoards(supabase, coachId)
    if (error || !pages) throw new Error(error?.message ?? 'No se pudieron crear los tableros de ejemplo.')

    const widgets = BOARD_TEMPLATES.flatMap(template => {
        const page = pages.find(item => item.scope === template.scope)
        return page ? templateWidgetRows(template, page.id, coachId) : []
    })
    const { error: widgetsError } = await supabase.from('analytics_widgets').insert(widgets)
    if (widgetsError) throw new Error(widgetsError.message)
    return listBoards(supabase, coachId)
}

export async function loadWidgets(supabase: SupabaseClient, pageId: string) {
    const { data, error } = await supabase
        .from('analytics_widgets')
        .select(WIDGET_COLUMNS)
        .eq('page_id', pageId)
        .order('sort_order')
        .order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []).map(toWidget)
}

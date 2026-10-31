'use server'

import { z } from 'zod'
import { requireActiveCoachId } from '@/lib/auth/require-coach'
import { loadAnalyticsFacts } from '@/data/analytics'
import { DIMENSIONS, METRICS, PERIODS, VISUALS } from '@/lib/analytics/catalog'
import { BOARD_TEMPLATES } from '@/lib/analytics/templates'
import { PAGE_COLUMNS, WIDGET_COLUMNS, loadWidgets, templateWidgetRows, toPage, toWidget } from '@/lib/analytics/boards'
import type { AnalyticsFacts } from '@/lib/analytics/engine'
import type { AnalyticsPage, AnalyticsWidget, BoardFilterState, WidgetDraft } from '@/types/analytics'

type Result<T> = { success: true; data: T } | { success: false; error: string }

function failure(error: unknown): { success: false; error: string } {
    if (error instanceof z.ZodError) return { success: false, error: error.issues[0]?.message ?? 'Revisa los datos.' }
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo completar la acción.' }
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida')
const idSchema = z.string().uuid()
const stringList = z.array(z.string().max(200)).max(200).default([])

const filtersSchema = z.object({
    period: z.string().refine(value => value in PERIODS, 'Periodo no válido'),
    from: dateSchema.nullable(),
    to: dateSchema.nullable(),
    status: z.enum(['active', 'inactive', 'all']),
    athleteIds: z.array(idSchema).max(500),
    athleteMode: z.enum(['all', 'single']),
})

const widgetSchema = z.object({
    title: z.string().trim().max(120),
    metric: z.string().refine(value => value in METRICS, 'Métrica no válida'),
    visual: z.string().refine(value => value in VISUALS, 'Visual no válido'),
    dimensions: z.array(z.string().refine(value => value in DIMENSIONS, 'Eje no válido')).max(2),
    filters: z.object({ exerciseKeys: stringList, groups: stringList, disciplines: stringList, athleteIds: stringList }).partial().default({}),
    options: z.object({
        compare: z.boolean().optional(),
        topN: z.number().int().min(1).max(50).optional(),
        columns: z.array(z.string().refine(value => value in METRICS)).max(12).optional(),
        yMetric: z.string().refine(value => value in METRICS).optional(),
    }).default({}),
    layout: z.object({ w: z.union([z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]), h: z.enum(['sm', 'md', 'lg']) }),
})

function widgetRow(draft: z.infer<typeof widgetSchema>) {
    return {
        title: draft.title,
        metric_key: draft.metric,
        visual: draft.visual,
        dimensions: draft.dimensions,
        filters: draft.filters,
        options: draft.options,
        layout: draft.layout,
    }
}

/** Hechos desde una fecha: el tablero los pide al ampliar el periodo */
export async function fetchAnalyticsFacts(since: string): Promise<Result<AnalyticsFacts>> {
    try {
        const { coachId } = await requireActiveCoachId()
        return { success: true, data: await loadAnalyticsFacts(coachId, dateSchema.parse(since)) }
    } catch (error) {
        return failure(error)
    }
}

export async function fetchBoardWidgets(pageId: string): Promise<Result<AnalyticsWidget[]>> {
    try {
        const { supabase } = await requireActiveCoachId()
        return { success: true, data: await loadWidgets(supabase, idSchema.parse(pageId)) }
    } catch (error) {
        return failure(error)
    }
}

export async function createBoard(name: string, filters: BoardFilterState): Promise<Result<AnalyticsPage>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const { count } = await supabase.from('analytics_pages').select('id', { count: 'exact', head: true }).eq('coach_id', coachId)
        const { data, error } = await supabase
            .from('analytics_pages')
            .insert({
                coach_id: coachId,
                name: z.string().trim().min(1, 'Pon un nombre al tablero').max(80).parse(name),
                scope: filters.athleteMode === 'single' ? 'athlete' : 'custom',
                default_filters: filtersSchema.parse(filters),
                sort_order: count ?? 0,
            })
            .select(PAGE_COLUMNS)
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toPage(data) }
    } catch (error) {
        return failure(error)
    }
}

export async function updateBoard(pageId: string, changes: { name?: string; filters?: BoardFilterState }): Promise<Result<AnalyticsPage>> {
    try {
        const { supabase } = await requireActiveCoachId()
        const patch: Record<string, unknown> = {}
        if (changes.name !== undefined) patch.name = z.string().trim().min(1, 'Pon un nombre al tablero').max(80).parse(changes.name)
        if (changes.filters) patch.default_filters = filtersSchema.parse(changes.filters)
        const { data, error } = await supabase.from('analytics_pages').update(patch).eq('id', idSchema.parse(pageId)).select(PAGE_COLUMNS).single()
        if (error) throw new Error(error.message)
        return { success: true, data: toPage(data) }
    } catch (error) {
        return failure(error)
    }
}

export async function setHomeBoard(pageId: string): Promise<Result<null>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const id = idSchema.parse(pageId)
        const cleared = await supabase.from('analytics_pages').update({ is_home: false }).eq('coach_id', coachId).eq('is_home', true)
        if (cleared.error) throw new Error(cleared.error.message)
        const { error } = await supabase.from('analytics_pages').update({ is_home: true }).eq('id', id)
        if (error) throw new Error(error.message)
        return { success: true, data: null }
    } catch (error) {
        return failure(error)
    }
}

export async function deleteBoard(pageId: string): Promise<Result<null>> {
    try {
        const { supabase } = await requireActiveCoachId()
        const { data, error } = await supabase.from('analytics_pages').delete().eq('id', idSchema.parse(pageId)).select('id')
        if (error) throw new Error(error.message)
        if (!data?.length) throw new Error('Los tableros de ejemplo no se pueden borrar.')
        return { success: true, data: null }
    } catch (error) {
        return failure(error)
    }
}

export async function duplicateBoard(pageId: string): Promise<Result<AnalyticsPage>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const id = idSchema.parse(pageId)
        const { data: source, error } = await supabase.from('analytics_pages').select(PAGE_COLUMNS).eq('id', id).single()
        if (error || !source) throw new Error(error?.message ?? 'Tablero no encontrado')
        const { count } = await supabase.from('analytics_pages').select('id', { count: 'exact', head: true }).eq('coach_id', coachId)
        const { data: copy, error: copyError } = await supabase
            .from('analytics_pages')
            .insert({ coach_id: coachId, name: `${source.name} (copia)`, scope: source.scope, default_filters: source.default_filters, sort_order: count ?? 0 })
            .select(PAGE_COLUMNS)
            .single()
        if (copyError || !copy) throw new Error(copyError?.message ?? 'No se pudo duplicar')
        const { data: widgets, error: widgetsError } = await supabase.from('analytics_widgets').select(WIDGET_COLUMNS).eq('page_id', id)
        if (widgetsError) throw new Error(widgetsError.message)
        if (widgets?.length) {
            const { error: insertError } = await supabase.from('analytics_widgets').insert(widgets.map(widget => ({
                page_id: copy.id,
                coach_id: coachId,
                title: widget.title,
                metric_key: widget.metric_key,
                visual: widget.visual,
                dimensions: widget.dimensions,
                filters: widget.filters,
                options: widget.options,
                layout: widget.layout,
                sort_order: widget.sort_order,
            })))
            if (insertError) throw new Error(insertError.message)
        }
        return { success: true, data: toPage(copy) }
    } catch (error) {
        return failure(error)
    }
}

/** Vuelve un tablero de ejemplo a su versión original (gráficos y filtros) */
export async function restoreBoard(pageId: string): Promise<Result<{ page: AnalyticsPage; widgets: AnalyticsWidget[] }>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const id = idSchema.parse(pageId)
        const { data: page, error } = await supabase.from('analytics_pages').select(PAGE_COLUMNS).eq('id', id).single()
        if (error || !page) throw new Error(error?.message ?? 'Tablero no encontrado')
        const template = BOARD_TEMPLATES.find(item => item.scope === page.scope)
        if (!page.is_system || !template) throw new Error('Solo se pueden restaurar los tableros de ejemplo.')
        const removed = await supabase.from('analytics_widgets').delete().eq('page_id', id)
        if (removed.error) throw new Error(removed.error.message)
        const inserted = await supabase.from('analytics_widgets').insert(templateWidgetRows(template, id, coachId))
        if (inserted.error) throw new Error(inserted.error.message)
        const { data: updated, error: updateError } = await supabase
            .from('analytics_pages')
            .update({ name: template.name, default_filters: template.filters })
            .eq('id', id)
            .select(PAGE_COLUMNS)
            .single()
        if (updateError) throw new Error(updateError.message)
        return { success: true, data: { page: toPage(updated), widgets: await loadWidgets(supabase, id) } }
    } catch (error) {
        return failure(error)
    }
}

export async function createWidget(pageId: string, draft: WidgetDraft): Promise<Result<AnalyticsWidget>> {
    try {
        const { supabase, coachId } = await requireActiveCoachId()
        const id = idSchema.parse(pageId)
        const { data: last } = await supabase.from('analytics_widgets').select('sort_order').eq('page_id', id).order('sort_order', { ascending: false }).limit(1)
        const { data, error } = await supabase
            .from('analytics_widgets')
            .insert({ ...widgetRow(widgetSchema.parse(draft)), page_id: id, coach_id: coachId, sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
            .select(WIDGET_COLUMNS)
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toWidget(data) }
    } catch (error) {
        return failure(error)
    }
}

export async function updateWidget(widgetId: string, draft: WidgetDraft): Promise<Result<AnalyticsWidget>> {
    try {
        const { supabase } = await requireActiveCoachId()
        const { data, error } = await supabase
            .from('analytics_widgets')
            .update(widgetRow(widgetSchema.parse(draft)))
            .eq('id', idSchema.parse(widgetId))
            .select(WIDGET_COLUMNS)
            .single()
        if (error) throw new Error(error.message)
        return { success: true, data: toWidget(data) }
    } catch (error) {
        return failure(error)
    }
}

export async function deleteWidget(widgetId: string): Promise<Result<null>> {
    try {
        const { supabase } = await requireActiveCoachId()
        const { error } = await supabase.from('analytics_widgets').delete().eq('id', idSchema.parse(widgetId))
        if (error) throw new Error(error.message)
        return { success: true, data: null }
    } catch (error) {
        return failure(error)
    }
}

/** Guarda el orden de los gráficos de un tablero tras arrastrarlos */
export async function reorderWidgets(pageId: string, widgetIds: string[]): Promise<Result<null>> {
    try {
        const { supabase } = await requireActiveCoachId()
        const id = idSchema.parse(pageId)
        const ids = z.array(idSchema).max(200).parse(widgetIds)
        const results = await Promise.all(ids.map((widgetId, index) => supabase
            .from('analytics_widgets')
            .update({ sort_order: index })
            .eq('id', widgetId)
            .eq('page_id', id)))
        const failed = results.find(result => result.error)
        if (failed?.error) throw new Error(failed.error.message)
        return { success: true, data: null }
    } catch (error) {
        return failure(error)
    }
}

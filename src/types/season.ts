// Plan de temporada (objetivo de volumen por semana y disciplina).
// Tablas: season_plans, season_phases, season_weeks, season_week_targets.

export type SeasonDiscipline = 'run' | 'bike' | 'swim' | 'strength' | 'other'
export type SeasonUnit = 'time' | 'distance'
export type SeasonMeasure = 'minutes' | 'km' | 'sessions'
export type SeasonWeekType = 'carga' | 'descarga' | 'test' | 'competicion' | 'transicion'
export type SeasonWeekTiming = 'past' | 'current' | 'future'

export interface SeasonVolumeAmount {
    minutes: number
    km: number
    sessions: number
}

export interface SeasonWeekTarget {
    target_minutes: number | null
    target_km: number | null
    target_sessions: number | null
}

export interface SeasonWeekDiscipline {
    target: SeasonWeekTarget | null
    planned: SeasonVolumeAmount
    done: SeasonVolumeAmount
    /** Sesiones marcadas como hechas sin duración ni distancia */
    doneMissingData: number
}

export interface SeasonWeek {
    id: string
    weekStart: string
    weekNumber: number
    weekType: SeasonWeekType
    notes: string | null
    timing: SeasonWeekTiming
    phaseName: string | null
    disciplines: Record<SeasonDiscipline, SeasonWeekDiscipline>
}

export interface SeasonPlan {
    id: string
    name: string
    startDate: string
    endDate: string
    primaryUnit: SeasonUnit
    disciplines: SeasonDiscipline[]
    status: 'draft' | 'active' | 'archived'
    notes: string | null
    targetEvent: { id: string; title: string; eventDate: string } | null
}

export interface SeasonOverview {
    season: SeasonPlan
    weeks: SeasonWeek[]
    today: string
}

export interface SeasonEventOption {
    id: string
    title: string
    eventDate: string
    eventType: string
}

/** Objetivo de la semana para la cabecera de Planificación */
export interface SeasonWeekSummary {
    seasonId: string
    seasonName: string
    primaryUnit: SeasonUnit
    weekNumber: number
    totalWeeks: number
    weekType: SeasonWeekType
    phaseName: string | null
    disciplines: Array<{ discipline: SeasonDiscipline; measure: SeasonMeasure; target: number | null; planned: number }>
}

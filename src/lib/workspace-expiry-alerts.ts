import type { MacroPlan, DietPlan, TrainingProgram } from '@/data/workspace'
import type { AthleteCurrentGoal } from '@/types/athlete-current-goal'

export type ExpiryAlert = {
    id: string
    kind: 'goal' | 'training' | 'macros' | 'diet'
    title: string
    endDate: string
    daysOverdue: number
    tab: 'athlete-profile' | 'plan'
}

type DatedPlan = Pick<MacroPlan | DietPlan, 'id' | 'effective_from' | 'effective_to' | 'created_at'>

type ExpiryInput = {
    today: string
    goal: AthleteCurrentGoal | null
    activeProgram: TrainingProgram | null
    macroPlans: MacroPlan[]
    dietPlans: DietPlan[]
}

function dateMs(date: string) {
    const [year, month, day] = date.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
}

function addDays(date: string, days: number) {
    return new Date(dateMs(date) + days * 86400000).toISOString().slice(0, 10)
}

function endedPlan<T extends DatedPlan>(plans: T[], today: string): T | null {
    const latestStarted = [...plans]
        .filter(plan => plan.effective_from <= today)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at))[0]

    return latestStarted?.effective_to && latestStarted.effective_to <= today ? latestStarted : null
}

export function getWorkspaceExpiryAlerts({
    today,
    goal,
    activeProgram,
    macroPlans,
    dietPlans,
}: ExpiryInput): ExpiryAlert[] {
    const alerts: ExpiryAlert[] = []

    const addAlert = (kind: ExpiryAlert['kind'], id: string, title: string, endDate: string, tab: ExpiryAlert['tab']) => {
        if (endDate > today) return
        alerts.push({ kind, id, title, endDate, daysOverdue: Math.round((dateMs(today) - dateMs(endDate)) / 86400000), tab })
    }

    if (goal) addAlert('goal', goal.id, goal.title, goal.target_date, 'athlete-profile')

    if (activeProgram?.effective_from && activeProgram.total_weeks > 0) {
        const durationEnd = addDays(activeProgram.effective_from, activeProgram.total_weeks * 7 - 1)
        const endDate = activeProgram.effective_to && activeProgram.effective_to < durationEnd
            ? activeProgram.effective_to
            : durationEnd
        addAlert('training', activeProgram.id, activeProgram.name, endDate, 'plan')
    }

    const macroPlan = endedPlan(macroPlans, today)
    if (macroPlan?.effective_to) addAlert('macros', macroPlan.id, 'Plan de macros', macroPlan.effective_to, 'plan')

    const dietPlan = endedPlan(dietPlans, today)
    if (dietPlan?.effective_to) addAlert('diet', dietPlan.id, dietPlan.name, dietPlan.effective_to, 'plan')

    return alerts.sort((a, b) => a.daysOverdue - b.daysOverdue)
}

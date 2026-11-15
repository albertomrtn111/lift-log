import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAthleteModules } from '@/data/athlete-modules'
import { athleteHome } from '@/lib/athlete/module-rules'
import { getActiveMacroPlan, getActiveDietPlan, getDietPlanMealsWithMacros, toFrontendMacroPlan, type ClientDietMeal } from '@/data/diet'
import { getClientId } from '@/data/client-schedule'
import { toCalendarDay, type CalendarDay } from '@/data/nutrition/calendar'
import { DietPageClient } from './DietPageClient'

export default async function DietPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const modules = await getAthleteModules()
    if (!modules.diet) redirect(athleteHome(modules))

    const clientId = await getClientId(user.id)
    if (!clientId) {
        // TODO: Handle no client profile state better?
        // For now, passing nulls will trigger empty states in Client component
        return (
            <DietPageClient
                macroPlan={null}
                dietPlan={null}
                dietMeals={[]}
                supplements={[]}
                calendar={[]}
            />
        )
    }

    // Calendario: lo que toca cada día (días planificados por el coach > plan base).
    // Dos meses hacia atrás para los días ya registrados y dos semanas por delante para la tira.
    const today = new Date()
    const shift = (days: number) => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10)

    // Fetch active plans for this client
    const [macroPlan, activeDietPlan, supplementsData, calendarData] = await Promise.all([
        getActiveMacroPlan(clientId),
        getActiveDietPlan(clientId),
        supabase
            .from('client_supplements')
            .select('id, supplement_name, dose_amount, dose_unit, daily_doses, dose_schedule, notes, start_date, end_date')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .then(({ data }) => data ?? []),
        supabase
            .rpc('nutrition_targets_for', { p_client_id: clientId, p_from: shift(-62), p_to: shift(13) })
            .then(({ data, error }) => {
                if (error) console.error('[DietPage] Error loading nutrition calendar:', error)
                return ((data as Record<string, any>[]) ?? []).map(toCalendarDay)
            }),
    ])
    const calendar: CalendarDay[] = calendarData

    // La dieta por opciones de hoy puede ser una programada para ese día en el calendario
    const todayEntry = calendar.find(day => day.day === shift(0))
    let dietPlan = activeDietPlan
    if (todayEntry?.diet_plan_id && todayEntry.diet_plan_id !== activeDietPlan?.id) {
        const { data: scheduled } = await supabase
            .from('diet_plans')
            .select('id, client_id, name, meals, effective_from, effective_to, created_at')
            .eq('id', todayEntry.diet_plan_id)
            .maybeSingle()
        if (scheduled) dietPlan = scheduled
    }

    // Convert to frontend format
    const frontendMacroPlan = macroPlan ? toFrontendMacroPlan(macroPlan) : null

    // Parse diet plan content - it should be JSON in the meals column now
    let parsedDietPlan = null
    if (dietPlan) {
        try {
            // The diet_plans table has a 'meals' JSONB column
            parsedDietPlan = {
                id: dietPlan.id,
                name: dietPlan.name,
                meals: typeof dietPlan.meals === 'string'
                    ? JSON.parse(dietPlan.meals)
                    : dietPlan.meals,
                effectiveFrom: dietPlan.effective_from,
            }
        } catch (e) {
            console.error('Error parsing diet plan:', e)
        }
    }

    // Estructura con macros (tablas normalizadas); el JSON queda de respaldo
    const dietMeals: ClientDietMeal[] = dietPlan ? await getDietPlanMealsWithMacros(dietPlan.id) : []

    return (
        <DietPageClient
            macroPlan={frontendMacroPlan}
            dietPlan={parsedDietPlan}
            dietMeals={dietMeals}
            supplements={supplementsData}
            calendar={calendar}
        />
    )
}

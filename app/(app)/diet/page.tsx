import { createClient } from '@/lib/supabase/server'
import { getActiveMacroPlan, getActiveDietPlan, toFrontendMacroPlan } from '@/data/diet'
import { getClientId } from '@/data/client-schedule'
import { DietPageClient } from './DietPageClient'

export default async function DietPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const clientId = await getClientId(user.id)
    if (!clientId) {
        // TODO: Handle no client profile state better?
        // For now, passing nulls will trigger empty states in Client component
        return (
            <DietPageClient
                macroPlan={null}
                dietPlan={null}
            />
        )
    }

    // Fetch active plans for this client
    const [macroPlan, dietPlan] = await Promise.all([
        getActiveMacroPlan(clientId),
        getActiveDietPlan(clientId),
    ])

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

    return (
        <DietPageClient
            macroPlan={frontendMacroPlan}
            dietPlan={parsedDietPlan}
        />
    )
}

import { createClient } from '@/lib/supabase/server'
import { getActiveMacroPlan, getActiveDietPlan, toFrontendMacroPlan } from '@/data/diet'
import { DietPageClient } from './DietPageClient'

export default async function DietPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // Fetch active plans for this client
    const [macroPlan, dietPlan] = await Promise.all([
        getActiveMacroPlan(user.id),
        getActiveDietPlan(user.id),
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
                meals: typeof dietPlan.content === 'string'
                    ? JSON.parse(dietPlan.content)
                    : dietPlan.content,
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

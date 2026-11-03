'use client'

import { useQuery } from '@tanstack/react-query'
import { getNutritionHistory } from '@/data/nutrition/history'

export const nutritionHistoryKeys = {
    client: (clientId: string) => ['nutritionHistory', clientId] as const,
}

export function useNutritionHistory(coachId: string, clientId: string) {
    return useQuery({
        queryKey: nutritionHistoryKeys.client(clientId),
        queryFn: () => getNutritionHistory(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

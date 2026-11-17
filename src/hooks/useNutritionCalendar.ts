'use client'

import { useQuery } from '@tanstack/react-query'
import { getNutritionCalendar, listAssignableDiets } from '@/data/nutrition/calendar'

export const nutritionCalendarKeys = {
    client: (clientId: string) => ['nutritionCalendar', clientId] as const,
    range: (clientId: string, from: string, to: string) => ['nutritionCalendar', clientId, from, to] as const,
    diets: (clientId: string) => ['nutritionCalendarDiets', clientId] as const,
}

export function useNutritionCalendar(clientId: string, from: string, to: string) {
    return useQuery({
        queryKey: nutritionCalendarKeys.range(clientId, from, to),
        queryFn: () => getNutritionCalendar(clientId, from, to),
        enabled: !!clientId && !!from && !!to,
    })
}

export function useAssignableDiets(coachId: string, clientId: string) {
    return useQuery({
        queryKey: nutritionCalendarKeys.diets(clientId),
        queryFn: () => listAssignableDiets(coachId, clientId),
        enabled: !!coachId && !!clientId,
    })
}

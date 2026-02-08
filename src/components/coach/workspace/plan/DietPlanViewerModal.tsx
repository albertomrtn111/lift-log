'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Utensils } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useDietPlanStructure } from '@/hooks/useDietOptions'
import type { DayType, DietPlanWithStructure } from '@/data/nutrition/types'

interface DietPlanViewerModalProps {
    planId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

// Labels for all possible day_type values
const DAY_TYPE_LABELS: Record<DayType, string> = {
    default: 'Normal',
    training: 'Entreno',
    rest: 'Descanso',
    mon: 'Lunes',
    tue: 'Martes',
    wed: 'Miércoles',
    thu: 'Jueves',
    fri: 'Viernes',
    sat: 'Sábado',
    sun: 'Domingo',
}

export function DietPlanViewerModal({
    planId,
    open,
    onOpenChange,
}: DietPlanViewerModalProps) {
    const { data: plan, isLoading, error } = useDietPlanStructure(planId)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Utensils className="h-5 w-5 text-primary" />
                        {plan?.name || 'Plan de dieta'}
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState />
                ) : plan ? (
                    <PlanViewer plan={plan} />
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

function LoadingState() {
    return (
        <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
        </div>
    )
}

function ErrorState() {
    return (
        <div className="text-center py-8 text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Error al cargar el plan</p>
        </div>
    )
}

function PlanViewer({ plan }: { plan: DietPlanWithStructure }) {
    // Get unique day_types from the plan's meals dynamically
    const dayTypes = [...new Set(plan.meals.map(m => m.day_type))] as DayType[]
    const [activeTab, setActiveTab] = useState(dayTypes[0] || 'default')

    return (
        <div className="space-y-4 py-2">
            {/* Plan Info */}
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                    {plan.status === 'active' ? 'Activo' : plan.status === 'draft' ? 'Borrador' : 'Archivado'}
                </Badge>
                <Badge variant="outline">
                    Desde: {format(new Date(plan.effective_from), 'dd MMM yyyy', { locale: es })}
                </Badge>
                {plan.effective_to && (
                    <Badge variant="outline">
                        Hasta: {format(new Date(plan.effective_to), 'dd MMM yyyy', { locale: es })}
                    </Badge>
                )}
                {plan.updated_at && (
                    <span className="text-xs text-muted-foreground">
                        Última modificación: {format(new Date(plan.updated_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </span>
                )}
            </div>

            {/* Day Type Tabs - dynamic based on what's in the plan */}
            {dayTypes.length > 1 ? (
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DayType)}>
                    <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${dayTypes.length}, 1fr)` }}>
                        {dayTypes.map(dt => (
                            <TabsTrigger key={dt} value={dt}>
                                {DAY_TYPE_LABELS[dt] || dt}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {dayTypes.map(dt => (
                        <TabsContent key={dt} value={dt}>
                            <MealsList meals={plan.meals.filter(m => m.day_type === dt)} />
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <MealsList meals={plan.meals} />
            )}
        </div>
    )
}

function MealsList({ meals }: { meals: DietPlanWithStructure['meals'] }) {
    if (meals.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No hay comidas configuradas
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {meals.sort((a, b) => a.order_index - b.order_index).map(meal => (
                <Card key={meal.id} className="p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                        {meal.name}
                        <Badge variant="secondary" className="ml-auto">
                            {meal.options.length} {meal.options.length === 1 ? 'opción' : 'opciones'}
                        </Badge>
                    </h4>

                    <div className="space-y-3">
                        {meal.options.sort((a, b) => a.order_index - b.order_index).map(option => (
                            <div key={option.id} className="pl-4 border-l-2 border-primary/20">
                                <p className="font-medium text-sm text-primary mb-1">{option.name}</p>
                                <ul className="space-y-1">
                                    {option.items.sort((a, b) => a.order_index - b.order_index).map(item => (
                                        <li key={item.id} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <span className="text-primary">•</span>
                                            <span>
                                                {item.quantity_value && (
                                                    <strong>
                                                        {item.quantity_value}
                                                        {item.quantity_unit && ` ${item.quantity_unit}`}{' '}
                                                    </strong>
                                                )}
                                                {item.name}
                                                {item.notes && (
                                                    <span className="text-muted-foreground/70"> ({item.notes})</span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {option.notes && (
                                    <p className="mt-2 text-xs text-primary bg-primary/5 px-2 py-1 rounded inline-block">
                                        💡 {option.notes}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            ))}
        </div>
    )
}

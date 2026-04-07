'use client'

import { Target, Utensils } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DietPlanPanel } from '../workspace/plan/DietPlanPanel'
import { MacroPlanPanel } from '../workspace/plan/MacroPlanPanel'
import { AINutritionDialog } from '../workspace/plan/AINutritionDialog'

interface DietTabProps {
    clientId: string
    coachId: string
}

export function DietTab({ clientId, coachId }: DietTabProps) {
    return (
        <Tabs defaultValue="macros" className="w-full">
            {/* Header row: tabs + AI button */}
            <div className="mb-6 flex items-end justify-between border-b border-border/70">
                <TabsList className="h-auto gap-0 border-none bg-transparent p-0">
                    <TabsTrigger
                        value="macros"
                        className="workspace-tab-trigger"
                    >
                        <Target className="h-4 w-4" />
                        Objetivos &amp; Macros
                    </TabsTrigger>
                    <TabsTrigger
                        value="options"
                        className="workspace-tab-trigger"
                    >
                        <Utensils className="h-4 w-4" />
                        Dieta por Opciones
                    </TabsTrigger>
                </TabsList>

                <div className="pb-2">
                    <AINutritionDialog
                        coachId={coachId}
                        clientId={clientId}
                        trigger={
                            <button
                                type="button"
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/40 text-primary hover:bg-primary/5 hover:border-primary transition-colors font-medium"
                            >
                                ✦ Generar con IA
                            </button>
                        }
                    />
                </div>
            </div>

            <TabsContent value="macros" className="mt-0">
                <MacroPlanPanel coachId={coachId} clientId={clientId} />
            </TabsContent>

            <TabsContent value="options" className="mt-0">
                <DietPlanPanel coachId={coachId} clientId={clientId} />
            </TabsContent>
        </Tabs>
    )
}

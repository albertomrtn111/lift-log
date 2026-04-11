'use client'

import { Target, Utensils } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DietPlanPanel } from '../workspace/plan/DietPlanPanel'
import { MacroPlanPanel } from '../workspace/plan/MacroPlanPanel'

interface DietTabProps {
    clientId: string
    coachId: string
}

export function DietTab({ clientId, coachId }: DietTabProps) {
    return (
        <Tabs defaultValue="macros" className="w-full">
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

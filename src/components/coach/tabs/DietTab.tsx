'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DBMacroPlan } from '@/data/diet'
import { Flame, Beef, Wheat, Droplet, Footprints, Heart, Plus, Loader2, Target, Utensils } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-transparent p-0 border-b border-zinc-800">
                <TabsTrigger
                    value="macros"
                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                >
                    <Target className="h-4 w-4" />
                    Objetivos & Macros
                </TabsTrigger>
                <TabsTrigger
                    value="options"
                    className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-400 data-[state=active]:bg-transparent data-[state=active]:text-blue-400 data-[state=active]:shadow-none text-zinc-400 hover:text-white transition-all pb-3"
                >
                    <Utensils className="h-4 w-4" />
                    Dieta por Opciones
                </TabsTrigger>
            </TabsList>

            <TabsContent value="macros" className="mt-0">
                <MacroPlanPanel coachId={coachId} clientId={clientId} />
            </TabsContent>

            <TabsContent value="options" className="mt-0">
                <DietPlanPanel coachId={coachId} clientId={clientId} />
            </TabsContent>
        </Tabs>
    )
}

// function MacrosView({ clientId }: { clientId: string }) { ... } - REMOVED

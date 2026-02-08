'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DBMacroPlan } from '@/data/diet'
import { Flame, Beef, Wheat, Droplet, Footprints, Heart, Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DietTabProps {
    clientId: string
}

export function DietTab({ clientId }: DietTabProps) {
    const [macroPlan, setMacroPlan] = useState<DBMacroPlan | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadMacroPlan() {
            setLoading(true)
            const supabase = createClient()
            const today = new Date().toISOString().split('T')[0]

            const { data } = await supabase
                .from('macro_plans')
                .select('*')
                .eq('client_id', clientId)
                .lte('effective_from', today)
                .or(`effective_to.is.null,effective_to.gte.${today}`)
                .order('effective_from', { ascending: false })
                .limit(1)
                .single()

            setMacroPlan(data)
            setLoading(false)
        }

        loadMacroPlan()
    }, [clientId])

    if (loading) {
        return (
            <Card className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
        )
    }

    if (!macroPlan) {
        return (
            <Card className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Flame className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-2">Sin plan de macros</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Este cliente no tiene un plan de macros activo.
                </p>
                <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Crear plan de macros
                </Button>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            {/* Create new plan button */}
            <Button className="w-full gap-2" variant="outline">
                <Plus className="h-4 w-4" />
                Crear nuevo plan de macros
            </Button>

            {/* Active plan badge */}
            <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                    Activo desde: {macroPlan.effective_from}
                </Badge>
            </div>

            {/* Macro cards */}
            <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center">
                    <Flame className="h-6 w-6 text-accent mx-auto mb-2" />
                    <span className="text-2xl font-bold">{macroPlan.kcal}</span>
                    <span className="text-xs text-muted-foreground block">kcal</span>
                </Card>
                <Card className="p-4 text-center">
                    <Beef className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <span className="text-2xl font-bold">{macroPlan.protein}g</span>
                    <span className="text-xs text-muted-foreground block">Proteína</span>
                </Card>
                <Card className="p-4 text-center">
                    <Wheat className="h-6 w-6 text-warning mx-auto mb-2" />
                    <span className="text-2xl font-bold">{macroPlan.carbs}g</span>
                    <span className="text-xs text-muted-foreground block">Carbohidratos</span>
                </Card>
                <Card className="p-4 text-center">
                    <Droplet className="h-6 w-6 text-warning/80 mx-auto mb-2" />
                    <span className="text-2xl font-bold">{macroPlan.fat}g</span>
                    <span className="text-xs text-muted-foreground block">Grasa</span>
                </Card>
            </div>

            {/* Extra goals */}
            {(macroPlan.steps_goal || macroPlan.cardio_goal) && (
                <div className="flex gap-3">
                    {macroPlan.steps_goal && (
                        <Card className="flex-1 flex items-center gap-3 p-4">
                            <Footprints className="h-5 w-5 text-primary" />
                            <div>
                                <span className="text-lg font-semibold">{macroPlan.steps_goal.toLocaleString()}</span>
                                <span className="text-xs text-muted-foreground ml-1">pasos/día</span>
                            </div>
                        </Card>
                    )}
                    {macroPlan.cardio_goal && (
                        <Card className="flex-1 flex items-center gap-3 p-4">
                            <Heart className="h-5 w-5 text-destructive/80" />
                            <span className="text-sm font-medium">{macroPlan.cardio_goal}</span>
                        </Card>
                    )}
                </div>
            )}
        </div>
    )
}

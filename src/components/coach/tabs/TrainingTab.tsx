'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DBTrainingProgram } from '@/data/training'
import { Dumbbell, Plus, Play, Loader2, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TrainingTabProps {
    clientId: string
}

export function TrainingTab({ clientId }: TrainingTabProps) {
    const [programs, setPrograms] = useState<DBTrainingProgram[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadPrograms() {
            setLoading(true)
            const supabase = createClient()

            const { data } = await supabase
                .from('training_programs')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })

            setPrograms(data || [])
            setLoading(false)
        }

        loadPrograms()
    }, [clientId])

    if (loading) {
        return (
            <Card className="p-8 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </Card>
        )
    }

    const activeProgram = programs.find(p => p.status === 'active')
    const draftPrograms = programs.filter(p => p.status === 'draft')
    const completedPrograms = programs.filter(p => p.status === 'completed')

    return (
        <div className="space-y-4">
            {/* Create new program button */}
            <Button className="w-full gap-2" variant="outline">
                <Plus className="h-4 w-4" />
                Crear nuevo programa
            </Button>

            {/* Active program */}
            {activeProgram && (
                <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">Programa activo</h3>
                    <Card className="p-4 border-primary/30 bg-primary/5">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Dumbbell className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="font-semibold">{activeProgram.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="default">Activo</Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {activeProgram.total_weeks} semanas
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <Button size="sm">Editar</Button>
                        </div>
                        <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>{activeProgram.total_weeks} semanas</span>
                        </div>
                    </Card>
                </div>
            )}

            {/* Draft programs */}
            {draftPrograms.length > 0 && (
                <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">Borradores</h3>
                    {draftPrograms.map(program => (
                        <Card key={program.id} className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">{program.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="secondary">Borrador</Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {program.total_weeks} semanas
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline">Editar</Button>
                                    <Button size="sm" className="gap-1">
                                        <Play className="h-3 w-3" />
                                        Activar
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Completed programs */}
            {completedPrograms.length > 0 && (
                <div className="space-y-2">
                    <h3 className="font-semibold text-sm text-muted-foreground">Completados</h3>
                    {completedPrograms.slice(0, 3).map(program => (
                        <Card key={program.id} className="p-4 opacity-70">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">{program.name}</p>
                                    <span className="text-xs text-muted-foreground">
                                        {program.total_weeks} semanas
                                    </span>
                                </div>
                                <Badge variant="outline">Completado</Badge>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {programs.length === 0 && (
                <Card className="p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Dumbbell className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">Sin programas</h3>
                    <p className="text-sm text-muted-foreground">
                        Crea el primer programa de entrenamiento para este cliente.
                    </p>
                </Card>
            )}
        </div>
    )
}

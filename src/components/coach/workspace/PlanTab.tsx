'use client'

import { useState, useTransition } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MacroPlan, TrainingProgram, DietPlan } from '@/data/workspace'
import { MacroPlanPanel } from './plan/MacroPlanPanel'
import { DietPlanPanel } from './plan/DietPlanPanel'
import { TrainingProgramsHistory } from './plan/TrainingProgramsHistory'
import {
    Apple,
    Dumbbell,
    PersonStanding,
    Plus,
    Edit,
    Save,
    X,
    Calendar,
    Loader2,
    Utensils,
    ChevronDown,
    Settings2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveMacroPlanAction, activateTrainingProgramAction } from './actions'
import { createTrainingProgramClient } from './clientActions'
import { TrainingProgramWizard } from './plan/TrainingProgramWizard'
import { createClient } from '@/lib/supabase/client'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'

interface PlanTabProps {
    coachId: string
    clientId: string
    activeMacroPlan: MacroPlan | null
    macroPlans: MacroPlan[]
    activeDietPlan: DietPlan | null
    dietPlans: DietPlan[]
    activeProgram: TrainingProgram | null
    programs: TrainingProgram[]
    onRefresh: () => void
}

export function PlanTab({
    coachId,
    clientId,
    activeMacroPlan,
    macroPlans,
    activeDietPlan,
    dietPlans,
    activeProgram,
    programs,
    onRefresh
}: PlanTabProps) {
    return (
        <Tabs defaultValue="dieta" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="dieta" className="gap-2">
                    <Apple className="h-4 w-4" />
                    Dieta
                </TabsTrigger>
                <TabsTrigger value="entreno" className="gap-2">
                    <Dumbbell className="h-4 w-4" />
                    Entreno
                </TabsTrigger>
                <TabsTrigger value="running" className="gap-2">
                    <PersonStanding className="h-4 w-4" />
                    Running
                </TabsTrigger>
            </TabsList>

            <TabsContent value="dieta">
                <DietaSubtab coachId={coachId} clientId={clientId} />
            </TabsContent>

            <TabsContent value="entreno">
                <EntrenoSubtab
                    coachId={coachId}
                    clientId={clientId}
                    activeProgram={activeProgram}
                    allPrograms={programs}
                    onRefresh={onRefresh}
                />
            </TabsContent>

            <TabsContent value="running">
                <RunningSubtab />
            </TabsContent>
        </Tabs>
    )
}

// ============================================================================
// DIETA SUBTAB
// ============================================================================

function DietaSubtab({
    coachId,
    clientId,
}: {
    coachId: string
    clientId: string
}) {
    return (
        <div className="space-y-6">
            <MacroPlanPanel coachId={coachId} clientId={clientId} />
            <DietPlanPanel coachId={coachId} clientId={clientId} />
        </div>
    )
}

// ============================================================================
// ENTRENO SUBTAB
// ============================================================================

function EntrenoSubtab({
    coachId,
    clientId,
    activeProgram,
    allPrograms,
    onRefresh
}: {
    coachId: string
    clientId: string
    activeProgram: TrainingProgram | null
    allPrograms: TrainingProgram[]
    onRefresh: () => void
}) {
    const [isPending, startTransition] = useTransition()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [showCreate, setShowCreate] = useState(false)
    const [wizardConfig, setWizardConfig] = useState<{ isOpen: boolean, programId: string | null, step: number }>({
        isOpen: false,
        programId: null,
        step: 1
    })
    const [lastError, setLastError] = useState<string | null>(null)
    const [newProgram, setNewProgram] = useState<{
        name: string
        weeks: number
        daysInput: string
    }>({
        name: '',
        weeks: 4,
        daysInput: 'Día 1, Día 2, Día 3, Día 4',
    })

    const handleCreate = async () => {
        setLastError(null)
        console.log('[handleCreate] Iniciando creación de programa (CLIENT-SIDE)...')

        // 1. Validaciones previas
        if (!coachId) {
            console.error('[handleCreate] Error: coachId no encontrado')
            toast({
                title: 'Error de sesión',
                description: 'No se ha detectado la sesión del entrenador. Recarga la página.',
                variant: 'destructive',
            })
            return
        }

        if (!newProgram.name.trim()) {
            console.warn('[handleCreate] Validación fallida: Nombre vacío')
            toast({
                title: 'Nombre requerido',
                description: 'El nombre del programa no puede estar vacío.',
                variant: 'destructive',
            })
            return
        }

        if (newProgram.weeks < 1) {
            console.warn('[handleCreate] Validación fallida: Semanas < 1')
            toast({
                title: 'Semanas inválidas',
                description: 'El programa debe tener al menos 1 semana.',
                variant: 'destructive',
            })
            return
        }

        const validDays = newProgram.daysInput
            .split(',')
            .map(d => d.trim())
            .filter(Boolean)

        console.log('[handleCreate] Días parseados:', validDays)

        // 2. Verificar sesión de Supabase (Cliente)
        const supabase = createClient()
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !session) {
            console.error('[handleCreate] Error de sesión:', sessionError)
            toast({
                title: 'No autenticado',
                description: 'No se ha encontrado una sesión activa. Por favor, inicia sesión de nuevo.',
                variant: 'destructive',
            })
            return
        }

        console.log('[handleCreate] Sesión verificada:', session.user.id)

        const payload = {
            coach_id: coachId,
            client_id: clientId,
            name: newProgram.name,
            total_weeks: newProgram.weeks,
            days: validDays,
        }

        console.log('[handleCreate] Payload preparado:', payload)

        startTransition(async () => {
            try {
                console.log('[handleCreate] Llamando a createTrainingProgramClient...')
                const result = await createTrainingProgramClient(payload)

                if (!result.success) {
                    // Si el error viene con detalles, los mostramos
                    const errorMsg = result.error || 'Error desconocido'
                    const detailMsg = result.details ? `\nDetalles: ${result.details}` : ''
                    const codeMsg = result.code ? ` [${result.code}]` : ''

                    toast({
                        title: 'Error al crear' + codeMsg,
                        description: errorMsg + detailMsg,
                        variant: 'destructive',
                    })
                    setLastError(`${errorMsg}${codeMsg}${detailMsg}`)
                    return
                }

                console.log('[handleCreate] Acción completada con éxito. IDs:', result.programId)

                // Invalidar tanto la lista histórica como el programa activo
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] }),
                    queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", clientId] })
                ])

                toast({
                    title: 'Programa creado correctamente',
                    description: `${result.daysCreated} días configurados.`,
                })

                // Cerrar modal de creación y abrir automáticament el Wizard en Paso 3
                setShowCreate(false)
                setWizardConfig({
                    isOpen: true,
                    programId: result.programId,
                    step: 3
                })
                onRefresh()
            } catch (error: any) {
                console.error('[handleCreate] Exception capturada:', error)
                toast({
                    title: 'Error crítico',
                    description: error?.message || 'Ha ocurrido un error inesperado al procesar la solicitud.',
                    variant: 'destructive',
                })
            }
        })
    }

    const handleActivate = (programId: string) => {
        startTransition(async () => {
            try {
                await activateTrainingProgramAction(programId, clientId)
                // Invalidate query to ensure fresh data
                queryClient.invalidateQueries({ queryKey: ["activeTrainingProgram", clientId] })
                queryClient.invalidateQueries({ queryKey: ["trainingPrograms", clientId] })
                onRefresh()
                toast({ title: 'Programa activado' })
            } catch (error) {
                console.error(error)
                toast({
                    title: 'Error al activar',
                    description: 'No se pudo activar el programa.',
                    variant: 'destructive',
                })
            }
        })
    }

    return (
        <div className="space-y-6">
            {/* Active Program */}
            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Dumbbell className="h-5 w-5 text-primary" />
                        Programa activo
                    </h3>
                    <Button
                        size="sm"
                        onClick={() => setWizardConfig({ isOpen: true, programId: null, step: 1 })}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo programa
                    </Button>
                </div>

                {activeProgram ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                            <div>
                                <h4 className="font-medium">{activeProgram.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                    {activeProgram.total_weeks} semanas
                                </p>
                                {activeProgram.effective_from && (
                                    <p className="text-xs text-muted-foreground">
                                        Inicio: {activeProgram.effective_from}
                                    </p>
                                )}
                            </div>
                            <Badge className="bg-success/10 text-success border-0">Activo</Badge>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5"
                            onClick={() => setWizardConfig({ isOpen: true, programId: activeProgram.id, step: 3 })}
                        >
                            <Settings2 className="h-4 w-4 text-primary" />
                            Configurar plan detallado
                        </Button>
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        <Dumbbell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p>Sin programa de entrenamiento activo</p>
                        <Button className="mt-4" onClick={() => setWizardConfig({ isOpen: true, programId: null, step: 1 })}>
                            <Plus className="h-4 w-4 mr-2" />
                            Crear programa
                        </Button>
                    </div>
                )}
            </Card>

            {/* All Programs */}
            <TrainingProgramsHistory
                clientId={clientId}
                programs={allPrograms.filter(p => p.id !== activeProgram?.id)}
                onRefresh={onRefresh}
            />

            {wizardConfig.isOpen && (
                <TrainingProgramWizard
                    programId={wizardConfig.programId}
                    coachId={coachId}
                    clientId={clientId}
                    isOpen={wizardConfig.isOpen}
                    initialStep={wizardConfig.step}
                    onOpenChange={(open) => setWizardConfig(prev => ({ ...prev, isOpen: open }))}
                    onClose={() => {
                        setWizardConfig({ isOpen: false, programId: null, step: 1 })
                        onRefresh()
                    }}
                />
            )}
        </div >
    )
}

// ============================================================================
// RUNNING SUBTAB (PLACEHOLDER)
// ============================================================================

function RunningSubtab() {
    return (
        <Card className="p-8 text-center">
            <PersonStanding className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="font-semibold text-lg mb-2">Running aún no está integrado</h3>
            <p className="text-muted-foreground mb-4">
                La planificación de running estará disponible próximamente
            </p>
            <Button variant="outline" disabled>
                Activar running (próximamente)
            </Button>
        </Card>
    )
}

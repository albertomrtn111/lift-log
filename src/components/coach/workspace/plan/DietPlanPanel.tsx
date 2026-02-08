'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    Plus,
    Pencil,
    Copy,
    Archive,
    MoreVertical,
    ChevronDown,
    AlertCircle,
    Play,
    Utensils,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
    useActiveDietPlan,
    useDietPlanStructure,
    useDietPlans,
    useArchiveDietPlan,
    useDuplicateDietPlan,
    useSetDietPlanStatus,
} from '@/hooks/useDietOptions'
import type { DayType, DietPlan, DietPlanWithStructure } from '@/data/nutrition/types'
import { DietOptionsWizard } from './DietOptionsWizard'
import { DietPlansHistory } from './DietPlansHistory'

interface DietPlanPanelProps {
    coachId: string
    clientId: string
}

// Labels for all day_type values (including future weekly support)
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

export function DietPlanPanel({ coachId, clientId }: DietPlanPanelProps) {
    // 1. Fetch both specific active plan AND full list
    const { data: activeFromQuery, isLoading: loadingActive, error: errorActive, refetch } = useActiveDietPlan(coachId, clientId)
    const { data: allPlans } = useDietPlans(coachId, clientId)

    // 2. Derive robust active plan (Query preferred, List fallback)
    const activeFromList = allPlans?.find(p => p.status === 'active') || null
    const activePlan = activeFromQuery || activeFromList

    // 3. Fetch structure based on derived ID
    const { data: structure, isLoading: loadingStructure } = useDietPlanStructure(activePlan?.id || null)

    const archiveMutation = useArchiveDietPlan(clientId)
    const duplicateMutation = useDuplicateDietPlan(clientId)
    const setStatusMutation = useSetDietPlanStatus(clientId)

    const [wizardOpen, setWizardOpen] = useState(false)
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
    const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
    const [planToArchive, setPlanToArchive] = useState<DietPlan | null>(null)

    const isLoading = loadingActive || (activePlan && loadingStructure)

    const handleCreate = () => {
        setEditingPlanId(null)
        setWizardOpen(true)
    }

    const handleEdit = () => {
        if (!activePlan) return
        setEditingPlanId(activePlan.id)
        setWizardOpen(true)
    }

    const handleDuplicate = () => {
        if (!activePlan) return
        duplicateMutation.mutate({ planId: activePlan.id })
    }

    const handleArchive = () => {
        if (!activePlan) return
        setPlanToArchive(activePlan)
        setArchiveDialogOpen(true)
    }

    const confirmArchive = () => {
        if (!planToArchive) return
        archiveMutation.mutate(planToArchive.id)
        setArchiveDialogOpen(false)
        setPlanToArchive(null)
    }

    const handleActivate = (plan: DietPlan) => {
        setStatusMutation.mutate({ planId: plan.id, status: 'active' })
    }

    if (isLoading) {
        return (
            <Card className="p-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-32 w-full" />
            </Card>
        )
    }

    if (errorActive) {
        return (
            <Card className="p-6">
                <div className="text-center text-destructive">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                    <p>Error al cargar la dieta</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                        Reintentar
                    </Button>
                </div>
            </Card>
        )
    }

    const draftPlans = (allPlans || []).filter(p => p.status === 'draft')

    return (
        <>
            <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">Dieta por opciones</h3>
                    <div className="flex gap-2">
                        {activePlan && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleEdit}>
                                        <Pencil className="h-4 w-4 mr-2" />
                                        Editar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleDuplicate}>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Duplicar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleArchive} className="text-destructive">
                                        <Archive className="h-4 w-4 mr-2" />
                                        Archivar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <Button size="sm" onClick={handleCreate}>
                            <Plus className="h-4 w-4 mr-1" />
                            Nueva dieta
                        </Button>
                    </div>
                </div>

                {activePlan && structure ? (
                    <ActivePlanView plan={activePlan} structure={structure} />
                ) : (
                    <EmptyState onCreateClick={handleCreate} />
                )}

                {/* Drafts Section */}
                <DraftPlans
                    plans={draftPlans}
                    onActivate={handleActivate}
                    onEdit={(id) => {
                        setEditingPlanId(id)
                        setWizardOpen(true)
                    }}
                />
            </Card>

            {/* Diet Plans History - Only Archived */}
            <DietPlansHistory
                coachId={coachId}
                clientId={clientId}
                activePlanId={activePlan?.id}
                onlyArchived={true}
            />

            {/* DEV DEBUG */}
            {process.env.NODE_ENV === 'development' && (
                <Card className="p-4 mt-4 bg-slate-950 text-slate-200 text-xs font-mono">
                    <p className="font-bold text-yellow-400 mb-2">DEBUG: Diet Plan Status</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                        <span>Resolved Active ID:</span>
                        <span className={activePlan ? "text-green-400" : "text-red-400"}>
                            {activePlan?.id || 'None'}
                        </span>

                        <span>• From Query:</span>
                        <span className="text-blue-300">{activeFromQuery?.id || 'null'}</span>

                        <span>• From List:</span>
                        <span className="text-purple-300">{activeFromList?.id || 'null'}</span>

                        <span>Active Status (DB):</span>
                        <span className="text-blue-300">{activePlan?.status || 'N/A'}</span>

                        <span>Counts (All Plans):</span>
                        <span>{(allPlans || []).length}</span>

                        <div className="col-span-2 border-t border-slate-800 my-1"></div>

                        <span>• Active count:</span>
                        <span>{(allPlans || []).filter(p => p.status === 'active').length}</span>

                        <span>• Draft count:</span>
                        <span>{(allPlans || []).filter(p => p.status === 'draft').length}</span>

                        <span>• Archived count:</span>
                        <span>{(allPlans || []).filter(p => p.status === 'archived').length}</span>
                    </div>
                </Card>
            )}

            {/* Wizard Modal */}
            <DietOptionsWizard
                open={wizardOpen}
                onOpenChange={setWizardOpen}
                coachId={coachId}
                clientId={clientId}
                editingPlanId={editingPlanId}
            />

            {/* Archive Confirmation */}
            <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Archivar dieta?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La dieta &quot;{planToArchive?.name}&quot; se archivará y dejará de estar activa.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmArchive}>Archivar</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

function ActivePlanView({ plan, structure }: { plan: DietPlan; structure: DietPlanWithStructure }) {
    // Get unique day types from meals
    const dayTypes = [...new Set(structure.meals.map(m => m.day_type))] as DayType[]

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                    {plan.name}
                </Badge>
                <Badge variant="outline">
                    Desde: {format(new Date(plan.effective_from), 'dd MMM yyyy', { locale: es })}
                </Badge>
                {plan.effective_to && (
                    <Badge variant="outline">
                        Hasta: {format(new Date(plan.effective_to), 'dd MMM yyyy', { locale: es })}
                    </Badge>
                )}
                <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                    {/* FIX: Badge depends only on status */}
                    {plan.status === 'active' ? 'Activo' : plan.status === 'draft' ? 'Borrador' : 'Archivado'}
                </Badge>
            </div>

            {dayTypes.length > 1 ? (
                <Tabs defaultValue={dayTypes[0]} className="w-full">
                    <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${dayTypes.length}, 1fr)` }}>
                        {dayTypes.map(dt => (
                            <TabsTrigger key={dt} value={dt}>
                                {DAY_TYPE_LABELS[dt]}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {dayTypes.map(dt => (
                        <TabsContent key={dt} value={dt}>
                            <MealsList meals={structure.meals.filter(m => m.day_type === dt)} />
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <MealsList meals={structure.meals} />
            )}
        </div>
    )
}

function MealsList({ meals }: { meals: DietPlanWithStructure['meals'] }) {
    return (
        <div className="space-y-2">
            {meals.map(meal => (
                <Collapsible key={meal.id}>
                    <Card className="overflow-hidden">
                        <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-2">
                                <Utensils className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{meal.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary">{meal.options.length} opciones</Badge>
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="border-t divide-y">
                                {meal.options.map(option => (
                                    <div key={option.id} className="p-4">
                                        <h5 className="font-medium text-sm mb-2">{option.name}</h5>
                                        <ul className="space-y-1">
                                            {option.items.map(item => (
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
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            ))}
        </div>
    )
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground">Sin dieta por opciones activa</p>
            <Button variant="outline" className="mt-4" onClick={onCreateClick}>
                <Plus className="h-4 w-4 mr-1" />
                Crear dieta por opciones
            </Button>
        </div>
    )
}

function DraftPlans({
    plans,
    onActivate,
    onEdit,
}: {
    plans: DietPlan[]
    onActivate: (plan: DietPlan) => void
    onEdit: (id: string) => void
}) {
    // Only show if there are drafts
    if (!plans || plans.length === 0) return null

    return (
        <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Borradores</h4>
            <div className="space-y-2">
                {plans.map(plan => (
                    <div key={plan.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                            <span className="font-medium text-sm">{plan.name}</span>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                    Borrador
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    {format(new Date(plan.created_at), 'dd MMM yyyy', { locale: es })}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => onEdit(plan.id)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onActivate(plan)}>
                                <Play className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

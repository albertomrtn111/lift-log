'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Utensils,
    Flame,
    Beef,
    Wheat,
    Droplet,
    Footprints,
    Check,
    ChevronDown,
    MessageSquare,
    ListTodo,
    AlertCircle,
    CalendarIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DietBackfillModal } from '@/components/backfill/DietBackfillModal'
import type { MacroPlan } from '@/types/training'
import { getDietAdherenceLog, saveDietAdherenceLog } from '@/data/diet-adherence'
import { toast } from 'sonner'

interface DietPlanMealItem {
    quantity: string
    name: string
    note?: string
}

interface DietPlanMealOption {
    title: string
    items: DietPlanMealItem[]
    notes?: string
}

interface DietPlanMeals {
    meals_per_day: number
    labels: string[]
    days: {
        default: Record<string, { options: DietPlanMealOption[] }>
    }
}

interface ParsedDietPlan {
    id: string
    name: string
    meals: DietPlanMeals
    effectiveFrom: string
}

interface DietPageClientProps {
    macroPlan: MacroPlan | null
    dietPlan: ParsedDietPlan | null
}

export function DietPageClient({ macroPlan, dietPlan }: DietPageClientProps) {
    const [backfillOpen, setBackfillOpen] = useState(false)
    const [date, setDate] = useState<Date>(new Date())
    const [adherence, setAdherence] = useState(0) // Default 0 instead of 85
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

    // Load data when date changes
    useEffect(() => {
        let isMounted = true
        async function load() {
            setLoading(true)
            try {
                const log = await getDietAdherenceLog(date)
                if (isMounted) {
                    if (log) {
                        setAdherence(log.adherence_pct ?? 0)
                        setNotes(log.notes || '')
                    } else {
                        // Reset if no log exists
                        setAdherence(0)
                        setNotes('')
                    }
                }
            } catch (error) {
                console.error('Failed to load diet log', error)
            } finally {
                if (isMounted) setLoading(false)
            }
        }
        load()
        return () => { isMounted = false }
    }, [date])

    const handleSave = async () => {
        setSaveStatus('saving')
        try {
            const res = await saveDietAdherenceLog({
                date,
                adherence_pct: adherence,
                notes
            })

            if (res.success) {
                setSaveStatus('saved')
                toast.success('Adherencia guardada correctamente')
                setTimeout(() => setSaveStatus('idle'), 2000)
            } else {
                setSaveStatus('idle')
                toast.error('Error al guardar: ' + res.error)
            }
        } catch (e) {
            setSaveStatus('idle')
            toast.error('Error inesperado al guardar')
        }
    }

    const hasMacros = !!macroPlan
    const hasMeals = !!(dietPlan?.meals?.labels?.length)

    // Default tab based on available data
    const defaultTab = hasMacros ? 'macros' : (hasMeals ? 'meals' : 'macros')

    return (
        <div className="min-h-screen pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                            <Utensils className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-foreground">Dieta</h1>
                            <p className="text-sm text-muted-foreground">Tu plan nutricional</p>
                        </div>
                    </div>
                </div>
            </header>

            <Tabs defaultValue={defaultTab} className="px-4 pt-4">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                    <TabsTrigger value="macros">Macros</TabsTrigger>
                    <TabsTrigger value="meals">Plan de comidas</TabsTrigger>
                </TabsList>

                <TabsContent value="macros" className="space-y-4 animate-fade-in">
                    {hasMacros ? (
                        <>
                            {/* Active badge & Date Picker */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <Badge variant="secondary" className="bg-success/10 text-success border-0 w-fit">
                                    Activo desde: {format(new Date(macroPlan.effectiveFrom), 'dd MMM', { locale: es })}
                                </Badge>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full sm:w-[240px] justify-start text-left font-normal",
                                                !date && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {date ? format(date, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={(d) => d && setDate(d)}
                                            initialFocus
                                            disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Macro cards */}
                            {macroPlan.day_type_config ? (
                                // Modo dos días
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-muted-foreground">Día de entreno</p>
                                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                        <Card className="macro-card card-hover">
                                            <Flame className="h-6 w-6 text-accent mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.training.kcal}</span>
                                            <span className="text-xs text-muted-foreground">kcal</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Beef className="h-6 w-6 text-destructive mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.training.protein_g}g</span>
                                            <span className="text-xs text-muted-foreground">Proteína</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Wheat className="h-6 w-6 text-warning mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.training.carbs_g}g</span>
                                            <span className="text-xs text-muted-foreground">Carbohidratos</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Droplet className="h-6 w-6 text-warning/80 mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.training.fat_g}g</span>
                                            <span className="text-xs text-muted-foreground">Grasa</span>
                                        </Card>
                                    </div>
                                    <p className="text-sm font-medium text-muted-foreground pt-1">Día de descanso</p>
                                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                        <Card className="macro-card card-hover">
                                            <Flame className="h-6 w-6 text-accent mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.rest.kcal}</span>
                                            <span className="text-xs text-muted-foreground">kcal</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Beef className="h-6 w-6 text-destructive mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.rest.protein_g}g</span>
                                            <span className="text-xs text-muted-foreground">Proteína</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Wheat className="h-6 w-6 text-warning mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.rest.carbs_g}g</span>
                                            <span className="text-xs text-muted-foreground">Carbohidratos</span>
                                        </Card>
                                        <Card className="macro-card card-hover">
                                            <Droplet className="h-6 w-6 text-warning/80 mb-2" />
                                            <span className="text-xl sm:text-2xl font-bold">{macroPlan.day_type_config.rest.fat_g}g</span>
                                            <span className="text-xs text-muted-foreground">Grasa</span>
                                        </Card>
                                    </div>
                                </div>
                            ) : (
                                // Modo simple — mantener el código actual con las 4 tarjetas
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    <Card className="macro-card card-hover">
                                        <Flame className="h-6 w-6 text-accent mb-2" />
                                        <span className="text-xl sm:text-2xl font-bold">{macroPlan.kcal}</span>
                                        <span className="text-xs text-muted-foreground">kcal</span>
                                    </Card>
                                    <Card className="macro-card card-hover">
                                        <Beef className="h-6 w-6 text-destructive mb-2" />
                                        <span className="text-xl sm:text-2xl font-bold">{macroPlan.protein}g</span>
                                        <span className="text-xs text-muted-foreground">Proteína</span>
                                    </Card>
                                    <Card className="macro-card card-hover">
                                        <Wheat className="h-6 w-6 text-warning mb-2" />
                                        <span className="text-xl sm:text-2xl font-bold">{macroPlan.carbs}g</span>
                                        <span className="text-xs text-muted-foreground">Carbohidratos</span>
                                    </Card>
                                    <Card className="macro-card card-hover">
                                        <Droplet className="h-6 w-6 text-warning/80 mb-2" />
                                        <span className="text-xl sm:text-2xl font-bold">{macroPlan.fat}g</span>
                                        <span className="text-xs text-muted-foreground">Grasa</span>
                                    </Card>
                                </div>
                            )}

                            {/* Extra goals */}
                            {macroPlan.stepsGoal && (
                                <div className="flex gap-3">
                                    <Card className="flex-1 flex items-center gap-3 p-4">
                                        <Footprints className="h-5 w-5 text-primary" />
                                        <div>
                                            <span className="text-lg font-semibold">{macroPlan.stepsGoal.toLocaleString()}</span>
                                            <span className="text-xs text-muted-foreground ml-1">pasos/día</span>
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {/* Daily adherence input */}
                            <Card className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <Check className="h-4 w-4 text-primary" />
                                        Adherencia del día
                                    </h3>
                                    {loading ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            {format(date, "d 'de' MMMM", { locale: es })}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">¿Cómo has seguido el plan?</span>
                                        <span className="font-semibold text-primary">{adherence}%</span>
                                    </div>
                                    <Slider
                                        value={[adherence]}
                                        onValueChange={([value]) => setAdherence(value)}
                                        max={100}
                                        step={5}
                                        className="w-full"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm text-muted-foreground">Notas del día</label>
                                    <Textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="¿Alguna observación?"
                                        className="min-h-[60px] resize-none"
                                        disabled={loading}
                                    />
                                </div>

                                <Button
                                    onClick={handleSave}
                                    className="w-full"
                                    disabled={loading || saveStatus === 'saving'}
                                >
                                    {saveStatus === 'saving' ? 'Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : 'Guardar'}
                                </Button>
                            </Card>

                            {/* Backfill button */}
                            <Button
                                variant="outline"
                                className="w-full gap-2"
                                onClick={() => setBackfillOpen(true)}
                            >
                                <ListTodo className="h-4 w-4" />
                                Rellenar días pendientes
                            </Button>
                        </>
                    ) : (
                        <Card className="p-8 text-center">
                            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                            <h3 className="font-semibold text-lg">Sin plan de macros</h3>
                            <p className="text-muted-foreground mt-2">
                                Tu entrenador aún no ha configurado un plan de macros para ti.
                            </p>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="meals" className="space-y-4 animate-fade-in">
                    {hasMeals ? (
                        <>
                            <div className="flex items-center gap-2 mb-4">
                                <Badge variant="secondary" className="bg-success/10 text-success border-0">
                                    {dietPlan.name}
                                </Badge>
                            </div>

                            <p className="text-sm text-muted-foreground">
                                Opciones propuestas por tu entrenador. Elige combinaciones que encajen con tus macros.
                            </p>

                            {dietPlan.meals.labels.map((mealLabel) => {
                                const mealData = dietPlan.meals.days.default[mealLabel]
                                if (!mealData?.options?.length) return null

                                return (
                                    <Collapsible key={mealLabel} className="space-y-2">
                                        <Card className="overflow-hidden">
                                            <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                                <h3 className="font-semibold">{mealLabel}</h3>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary">{mealData.options.length} opciones</Badge>
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                </div>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <div className="border-t border-border divide-y divide-border">
                                                    {mealData.options.map((option, optIdx) => (
                                                        <div key={optIdx} className="p-4">
                                                            <h4 className="font-medium text-sm mb-2">{option.title}</h4>
                                                            <ul className="space-y-1 mb-2">
                                                                {option.items.map((item, itemIdx) => (
                                                                    <li key={itemIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                                                                        <span className="text-primary">•</span>
                                                                        <span>
                                                                            {item.quantity && <strong>{item.quantity} </strong>}
                                                                            {item.name}
                                                                            {item.note && <span className="text-muted-foreground/70"> ({item.note})</span>}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                            {option.notes && (
                                                                <p className="text-xs text-primary bg-primary/5 px-2 py-1 rounded inline-block">
                                                                    💡 {option.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </CollapsibleContent>
                                        </Card>
                                    </Collapsible>
                                )
                            })}
                        </>
                    ) : (
                        <Card className="p-8 text-center">
                            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                            <h3 className="font-semibold text-lg">Sin plan de comidas</h3>
                            <p className="text-muted-foreground mt-2">
                                Tu entrenador aún no ha configurado un plan de comidas para ti.
                            </p>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Backfill Modal */}
            <DietBackfillModal
                open={backfillOpen}
                onOpenChange={setBackfillOpen}
            />
        </div>
    )
}

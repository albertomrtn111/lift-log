'use client'

import React, { useState, useEffect } from 'react'
import { TrainingTemplate, TemplateStructure, CardioStructure, CardioBlock } from '@/types/templates'
import { updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Plus,
    Trash2,
    Save,
    Loader2,
    Footprints,
    Clock,
    TrendingUp,
    Zap,
    Gauge,
    Shuffle,
    Heart,
    Timer,
    MapPin,
    Activity,
    StickyNote
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

// 1. Configuración de Tipos y Estilos (Running Types)
const RUNNING_TYPES = {
    'rodaje': {
        label: 'Rodaje',
        icon: Footprints,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20'
    },
    'tirada_larga': {
        label: 'Tirada Larga',
        icon: Clock,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20'
    },
    'progresivos': {
        label: 'Progresivos',
        icon: TrendingUp,
        color: 'text-indigo-500',
        bgColor: 'bg-indigo-500/10',
        borderColor: 'border-indigo-500/20'
    },
    'series': {
        label: 'Series',
        icon: Zap,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
        borderColor: 'border-orange-500/20'
    },
    'tempo': {
        label: 'Tempo',
        icon: Gauge,
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20'
    },
    'fartlek': {
        label: 'Fartlek',
        icon: Shuffle,
        color: 'text-pink-500',
        bgColor: 'bg-pink-500/10',
        borderColor: 'border-pink-500/20'
    }
} as const

type RunningTypeKey = keyof typeof RUNNING_TYPES

interface CardioSessionBuilderProps {
    template: TrainingTemplate
}

export function CardioSessionBuilder({ template: initialTemplate }: CardioSessionBuilderProps) {
    const { toast } = useToast()
    const [template, setTemplate] = useState<TrainingTemplate>(initialTemplate)
    const [isSaving, setIsSaving] = useState(false)
    const [isDirty, setIsDirty] = useState(false)

    // Initialize state from template structure or defaults
    const [cardioData, setCardioData] = useState<CardioStructure>(() => {
        const struct = initialTemplate.structure as unknown as CardioStructure
        return {
            trainingType: struct?.trainingType || 'rodaje',
            totalDistance: struct?.totalDistance || '',
            totalDuration: struct?.totalDuration || '',
            blocks: struct?.blocks || []
        }
    })

    const currentType = RUNNING_TYPES[(cardioData.trainingType as RunningTypeKey) || 'rodaje']

    const handleSave = async () => {
        setIsSaving(true)

        // Save cardio data into the structure JSON field
        const updatedStructure: CardioStructure = {
            ...cardioData
        }

        const res = await updateTemplate(template.id, {
            name: template.name,
            description: template.description,
            structure: updatedStructure as any // Casting strict for action compatibility if needed
        })

        if (res.success) {
            toast({
                title: 'Cambios guardados',
                description: 'La sesión de cardio se ha actualizado correctamente.',
                className: 'bg-green-500 text-white border-none',
            })
            setIsDirty(false)
        } else {
            toast({
                title: 'Error al guardar',
                description: res.error || 'Ha ocurrido un error inesperado.',
                variant: 'destructive',
            })
        }
        setIsSaving(false)
    }

    const updateCardioData = (updates: Partial<CardioStructure>) => {
        setCardioData(prev => ({ ...prev, ...updates }))
        setIsDirty(true)
    }

    const addBlock = () => {
        const newBlock: CardioBlock = {
            id: crypto.randomUUID(),
            type: 'work',
            objective_value: '',
            objective_unit: 'min',
            intensity: 'Z2',
            notes: ''
        }
        updateCardioData({ blocks: [...cardioData.blocks, newBlock] })
    }

    const updateBlock = (id: string, field: keyof CardioBlock, value: any) => {
        const newBlocks = cardioData.blocks.map(b =>
            b.id === id ? { ...b, [field]: value } : b
        )
        updateCardioData({ blocks: newBlocks })
    }

    const removeBlock = (id: string) => {
        const newBlocks = cardioData.blocks.filter(b => b.id !== id)
        updateCardioData({ blocks: newBlocks })
    }

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Header / Main Info */}
            <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Heart className="h-6 w-6 text-red-500" />
                        Editor de Cardio
                    </h1>
                    <p className="text-muted-foreground">Diseña tu sesión de running o cardio.</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={isSaving || !isDirty}
                    className={cn("min-w-[140px]", isDirty ? "animate-pulse" : "")}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" /> Guardar Sesión
                        </>
                    )}
                </Button>
            </div>

            {/* Configuración Superior */}
            <Card className="p-6 border-none shadow-md bg-card">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Basic Info */}
                    <div className="md:col-span-8 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nombre de la Sesión</Label>
                                <Input
                                    value={template.name}
                                    onChange={(e) => {
                                        setTemplate({ ...template, name: e.target.value })
                                        setIsDirty(true)
                                    }}
                                    className="font-semibold"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Sesión</Label>
                                <Select
                                    value={cardioData.trainingType}
                                    onValueChange={(v) => updateCardioData({ trainingType: v as RunningTypeKey })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecciona el tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(RUNNING_TYPES).map(([key, config]) => (
                                            <SelectItem key={key} value={key}>
                                                <div className="flex items-center gap-2">
                                                    <config.icon className={cn("h-4 w-4", config.color)} />
                                                    <span>{config.label}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción</Label>
                            <Textarea
                                value={template.description || ''}
                                onChange={(e) => {
                                    setTemplate({ ...template, description: e.target.value })
                                    setIsDirty(true)
                                }}
                                placeholder="Objetivo de la sesión, terreno recomendado, etc."
                                rows={2}
                            />
                        </div>
                    </div>

                    {/* Visual Card Preview */}
                    <div className="md:col-span-4 flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed bg-muted/20"
                        style={{ borderColor: isDirty ? undefined : 'transparent' }}>
                        <div className={cn(
                            "w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300",
                            currentType.bgColor,
                            currentType.color
                        )}>
                            <currentType.icon className="h-10 w-10" />
                        </div>
                        <h3 className={cn("text-xl font-bold mb-1", currentType.color)}>
                            {currentType.label}
                        </h3>
                        <div className="flex gap-4 mt-4 w-full">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase">Distancia Est.</Label>
                                <div className="relative">
                                    <Input
                                        value={cardioData.totalDistance}
                                        onChange={(e) => updateCardioData({ totalDistance: e.target.value })}
                                        className="h-8 text-sm pl-7"
                                        placeholder="0"
                                    />
                                    <MapPin className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                                </div>
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs text-muted-foreground uppercase">Duración Est.</Label>
                                <div className="relative">
                                    <Input
                                        value={cardioData.totalDuration}
                                        onChange={(e) => updateCardioData({ totalDuration: e.target.value })}
                                        className="h-8 text-sm pl-7"
                                        placeholder="0"
                                    />
                                    <Timer className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Constructor de Bloques */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Bloques de Entrenamiento
                    </h2>
                    <Button onClick={addBlock} size="sm" className="gap-2">
                        <Plus className="h-4 w-4" /> Añadir Bloque
                    </Button>
                </div>

                <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
                    <div className="hidden md:grid grid-cols-12 gap-4 p-4 items-center bg-muted/50 border-b text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        <div className="col-span-2">Tipo</div>
                        <div className="col-span-3">Objetivo</div>
                        <div className="col-span-2">Intensidad</div>
                        <div className="col-span-4">Notas</div>
                        <div className="col-span-1 text-center">Acción</div>
                    </div>

                    <div className="divide-y">
                        {cardioData.blocks.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground italic flex flex-col items-center gap-2">
                                <Footprints className="h-8 w-8 opacity-20" />
                                No hay bloques definidos. Añade el primero.
                            </div>
                        ) : (
                            cardioData.blocks.map((block, idx) => (
                                <div key={block.id} className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start md:items-center group hover:bg-muted/30 transition-colors">
                                    {/* Mobile Label */}
                                    <div className="md:hidden font-bold text-sm mb-2 col-span-full border-b pb-1">
                                        Bloque {idx + 1}
                                    </div>

                                    {/* Type */}
                                    <div className="col-span-12 md:col-span-2">
                                        <Select
                                            value={block.type}
                                            onValueChange={(v) => updateBlock(block.id, 'type', v)}
                                        >
                                            <SelectTrigger className={cn(
                                                "w-full font-medium h-9 border-0 focus:ring-0",
                                                block.type === 'warmup' && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                                                block.type === 'work' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                                block.type === 'rest' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                                                block.type === 'cooldown' && "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
                                            )}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="warmup">Calentamiento</SelectItem>
                                                <SelectItem value="work">Trabajo</SelectItem>
                                                <SelectItem value="rest">Descanso</SelectItem>
                                                <SelectItem value="cooldown">Vuelta Calma</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Objective */}
                                    <div className="col-span-12 md:col-span-3 flex items-center gap-2">
                                        <Input
                                            value={block.objective_value}
                                            onChange={(e) => updateBlock(block.id, 'objective_value', e.target.value)}
                                            placeholder="0"
                                            className="h-9"
                                        />
                                        <Select
                                            value={block.objective_unit}
                                            onValueChange={(v) => updateBlock(block.id, 'objective_unit', v)}
                                        >
                                            <SelectTrigger className="w-[80px] h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="min">min</SelectItem>
                                                <SelectItem value="km">km</SelectItem>
                                                <SelectItem value="m">m</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Intensity */}
                                    <div className="col-span-12 md:col-span-2">
                                        <Select
                                            value={block.intensity}
                                            onValueChange={(v) => updateBlock(block.id, 'intensity', v)}
                                        >
                                            <SelectTrigger className="w-full h-9">
                                                <SelectValue placeholder="Zona" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Z1">Z1 - Recuperación</SelectItem>
                                                <SelectItem value="Z2">Z2 - Aeróbico</SelectItem>
                                                <SelectItem value="Z3">Z3 - Ritmo</SelectItem>
                                                <SelectItem value="Z4">Z4 - Umbral</SelectItem>
                                                <SelectItem value="Z5">Z5 - VO2Max</SelectItem>
                                                <SelectItem value="RPE">RPE (Subjetivo)</SelectItem>
                                                <SelectItem value="Pace">Ritmo Específico</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Notes */}
                                    <div className="col-span-12 md:col-span-4">
                                        <Input
                                            value={block.notes}
                                            onChange={(e) => updateBlock(block.id, 'notes', e.target.value)}
                                            placeholder="Detalles sobre el ritmo o sensación..."
                                            className="h-9 border-transparent bg-muted/30 focus:bg-background focus:border-input transition-colors"
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div className="col-span-12 md:col-span-1 flex justify-end md:justify-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => removeBlock(block.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

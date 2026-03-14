'use client'

import { useState, useEffect } from 'react'
import { MetricDefinition, MetricCategory, MetricValueType } from '@/types/metrics'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

interface MetricFormModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    category: MetricCategory
    editingMetric: MetricDefinition | null
    onSave: (data: Partial<MetricDefinition>) => Promise<void>
}

export function MetricFormModal({
    open,
    onOpenChange,
    category,
    editingMetric,
    onSave,
}: MetricFormModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [name, setName] = useState('')
    const [desc, setDesc] = useState('')
    const [cat, setCat] = useState<MetricCategory>('body')
    const [valueType, setValueType] = useState<MetricValueType>('number')
    const [unit, setUnit] = useState('')
    const [minVal, setMinVal] = useState('')
    const [maxVal, setMaxVal] = useState('')

    // Reset when opening
    useEffect(() => {
        if (open) {
            if (editingMetric) {
                setName(editingMetric.name)
                setDesc(editingMetric.description ?? '')
                setCat(editingMetric.category)
                setValueType(editingMetric.value_type)
                setUnit(editingMetric.unit ?? '')
                setMinVal(editingMetric.min_value?.toString() ?? '')
                setMaxVal(editingMetric.max_value?.toString() ?? '')
            } else {
                setName('')
                setDesc('')
                setCat(category)
                setValueType('number')
                setUnit('')
                setMinVal('')
                setMaxVal('')
            }
        }
    }, [open, editingMetric, category])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setIsSubmitting(true)

        const min = minVal ? parseFloat(minVal) : null
        const max = maxVal ? parseFloat(maxVal) : null

        await onSave({
            name: name.trim(),
            description: desc.trim() || null,
            category: cat,
            value_type: valueType,
            unit: valueType === 'number' ? (unit.trim() || null) : null,
            min_value: (valueType === 'number' || valueType === 'scale') ? min : null,
            max_value: (valueType === 'number' || valueType === 'scale') ? max : null,
        })

        setIsSubmitting(false)
    }

    const isNumberOrScale = valueType === 'number' || valueType === 'scale'

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>
                            {editingMetric ? 'Editar Métrica' : 'Nueva Métrica'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {/* Name */}
                        <div className="grid gap-2">
                            <Label htmlFor="name">Nombre <span className="text-destructive">*</span></Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="ej. Circunferencia de brazo"
                                autoFocus
                                required
                            />
                        </div>

                        {/* Category */}
                        <div className="grid gap-2">
                            <Label htmlFor="category">Categoría</Label>
                            <Select value={cat} onValueChange={(v) => setCat(v as MetricCategory)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="body">Cuerpo</SelectItem>
                                    <SelectItem value="performance">Rendimiento</SelectItem>
                                    <SelectItem value="general">General</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Value Type */}
                        <div className="grid gap-2">
                            <Label>Tipo de valor</Label>
                            <RadioGroup
                                value={valueType}
                                onValueChange={(v) => setValueType(v as MetricValueType)}
                                className="flex gap-4 mt-1"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="number" id="t-num" />
                                    <Label htmlFor="t-num" className="font-normal">Número</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="text" id="t-text" />
                                    <Label htmlFor="t-text" className="font-normal">Texto</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="scale" id="t-scale" />
                                    <Label htmlFor="t-scale" className="font-normal">Escala</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {/* Conditionals */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Unit (Solo number) */}
                            {valueType === 'number' && (
                                <div className="grid gap-2 col-span-2">
                                    <Label htmlFor="unit">Unidad de medida</Label>
                                    <Input
                                        id="unit"
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        placeholder="ej. cm, kg, bpm"
                                    />
                                    <p className="text-[10px] text-muted-foreground">Opcional. Se mostrará junto al valor.</p>
                                </div>
                            )}

                            {/* Min / Max (Number/Scale) */}
                            {isNumberOrScale && (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="min">Valor mínimo</Label>
                                        <Input
                                            id="min"
                                            type="number"
                                            step="any"
                                            value={minVal}
                                            onChange={(e) => setMinVal(e.target.value)}
                                            placeholder="ej. 0"
                                        />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="max">Valor máximo</Label>
                                        <Input
                                            id="max"
                                            type="number"
                                            step="any"
                                            value={maxVal}
                                            onChange={(e) => setMaxVal(e.target.value)}
                                            placeholder={valueType === 'scale' ? 'ej. 10' : ''}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Description */}
                        <div className="grid gap-2">
                            <Label htmlFor="desc">Descripción</Label>
                            <Textarea
                                id="desc"
                                value={desc}
                                onChange={(e) => setDesc(e.target.value)}
                                placeholder="Instrucciones para el cliente (opcional)"
                                className="resize-none"
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={!name.trim() || isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                'Guardar'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

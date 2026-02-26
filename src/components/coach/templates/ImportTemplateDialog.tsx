'use client'

import { useState, useTransition, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
    Upload,
    FileSpreadsheet,
    Loader2,
    ArrowLeft,
    ArrowRight,
    Check,
    AlertCircle,
    Download,
    Dumbbell,
    X,
    Info,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createTemplate, updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import type { TemplateDay, TemplateExercise, StrengthStructure } from '@/types/templates'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface ParsedExercise {
    day: string
    exercise_name: string
    sets: number
    reps: string
    rir: string
    rest_seconds: number
    notes: string
}

interface ImportTemplateDialogProps {
    trigger?: React.ReactNode
}

// ============================================================================
// CSV Parser
// ============================================================================

function parseCSV(text: string): ParsedExercise[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    // Detect separator (comma or semicolon)
    const headerLine = lines[0]
    const separator = headerLine.includes(';') ? ';' : ','

    const headers = headerLine.split(separator).map(h => h.trim().toLowerCase())

    // Map possible header names to our fields
    const headerMap: Record<string, string> = {}
    headers.forEach((h, i) => {
        const clean = h.replace(/['"]/g, '').trim()
        if (['dia', 'día', 'day'].includes(clean)) headerMap['day'] = String(i)
        if (['ejercicio', 'exercise', 'nombre', 'name'].includes(clean)) headerMap['exercise_name'] = String(i)
        if (['series', 'sets'].includes(clean)) headerMap['sets'] = String(i)
        if (['reps', 'repeticiones', 'repetitions'].includes(clean)) headerMap['reps'] = String(i)
        if (['rir'].includes(clean)) headerMap['rir'] = String(i)
        if (['rest', 'descanso', 'rest_seconds', 'descanso_s'].includes(clean)) headerMap['rest_seconds'] = String(i)
        if (['notas', 'notes', 'nota', 'note'].includes(clean)) headerMap['notes'] = String(i)
    })

    // Must have at least day and exercise
    if (!headerMap['day'] || !headerMap['exercise_name']) {
        return []
    }

    const exercises: ParsedExercise[] = []

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''))

        const day = cols[parseInt(headerMap['day'])] || ''
        const exercise_name = cols[parseInt(headerMap['exercise_name'])] || ''

        if (!day || !exercise_name) continue

        exercises.push({
            day,
            exercise_name,
            sets: parseInt(cols[parseInt(headerMap['sets'])] || '3') || 3,
            reps: cols[parseInt(headerMap['reps'])] || '10',
            rir: cols[parseInt(headerMap['rir'])] || '',
            rest_seconds: parseInt(cols[parseInt(headerMap['rest_seconds'])] || '60') || 60,
            notes: cols[parseInt(headerMap['notes'])] || '',
        })
    }

    return exercises
}

function groupByDay(exercises: ParsedExercise[]): Map<string, ParsedExercise[]> {
    const map = new Map<string, ParsedExercise[]>()
    for (const ex of exercises) {
        const existing = map.get(ex.day) || []
        existing.push(ex)
        map.set(ex.day, existing)
    }
    return map
}

function buildStructure(grouped: Map<string, ParsedExercise[]>): StrengthStructure {
    const days: TemplateDay[] = []
    let dayOrder = 1

    for (const [dayName, exercises] of grouped) {
        const templateExercises: TemplateExercise[] = exercises.map((ex, idx) => ({
            id: crypto.randomUUID(),
            exercise_name: ex.exercise_name,
            order: idx + 1,
            sets: ex.sets,
            reps: ex.reps,
            rir: ex.rir || undefined,
            rest_seconds: ex.rest_seconds,
            notes: ex.notes || null,
        }))

        days.push({
            id: crypto.randomUUID(),
            name: dayName,
            order: dayOrder++,
            exercises: templateExercises,
        })
    }

    return { days, weeks: 4 }
}

// ============================================================================
// Component
// ============================================================================

export function ImportTemplateDialog({ trigger }: ImportTemplateDialogProps) {
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<1 | 2>(1)
    const [isPending, startTransition] = useTransition()
    const router = useRouter()
    const { toast } = useToast()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Step 1: Metadata
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [tags, setTags] = useState('')

    // File upload
    const [file, setFile] = useState<File | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [parseError, setParseError] = useState<string | null>(null)

    // Step 2: Parsed data
    const [parsedData, setParsedData] = useState<Map<string, ParsedExercise[]>>(new Map())

    const reset = () => {
        setStep(1)
        setName('')
        setDescription('')
        setTags('')
        setFile(null)
        setParseError(null)
        setParsedData(new Map())
    }

    const handleFileSelect = useCallback((selectedFile: File) => {
        setParseError(null)

        const validTypes = [
            'text/csv',
            'application/vnd.ms-excel',
            'text/plain',
        ]
        const ext = selectedFile.name.split('.').pop()?.toLowerCase()

        if (!validTypes.includes(selectedFile.type) && ext !== 'csv') {
            setParseError('Solo se admiten archivos CSV (.csv)')
            return
        }

        setFile(selectedFile)

        // Parse the file
        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            if (!text) {
                setParseError('No se pudo leer el archivo')
                return
            }

            const exercises = parseCSV(text)
            if (exercises.length === 0) {
                setParseError(
                    'No se pudieron extraer ejercicios. Verifica que el CSV tenga las columnas requeridas: Dia, Ejercicio, Series, Reps, RIR, Rest, Notas'
                )
                return
            }

            const grouped = groupByDay(exercises)
            setParsedData(grouped)
        }
        reader.onerror = () => {
            setParseError('Error al leer el archivo')
        }
        reader.readAsText(selectedFile)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const droppedFile = e.dataTransfer.files[0]
        if (droppedFile) handleFileSelect(droppedFile)
    }, [handleFileSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback(() => {
        setIsDragging(false)
    }, [])

    const canProceedToStep2 = name.trim().length > 0 && parsedData.size > 0

    const handleNext = () => {
        if (canProceedToStep2) {
            setStep(2)
        }
    }

    const handleSave = () => {
        if (parsedData.size === 0) return

        const tagArray = tags
            ? tags.split(',').map(t => t.trim()).filter(Boolean)
            : []

        startTransition(async () => {
            // Step 1: Create the template
            const result = await createTemplate({
                name: name.trim(),
                description: description.trim() || undefined,
                tags: tagArray,
                type: 'strength',
            })

            if (!result.success || !result.template) {
                toast({
                    title: 'Error al crear plantilla',
                    description: result.error || 'Error inesperado',
                    variant: 'destructive',
                })
                return
            }

            // Step 2: Update with the parsed structure
            const structure = buildStructure(parsedData)
            const updateResult = await updateTemplate(result.template.id, { structure })

            if (!updateResult.success) {
                toast({
                    title: 'Error al guardar estructura',
                    description: updateResult.error || 'Error inesperado',
                    variant: 'destructive',
                })
                return
            }

            toast({
                title: 'Plantilla importada',
                description: `"${name}" creada con ${parsedData.size} días y ${Array.from(parsedData.values()).reduce((acc, exs) => acc + exs.length, 0)} ejercicios.`,
                className: 'bg-green-500 text-white border-none',
            })

            setOpen(false)
            reset()
            router.refresh()
            router.push(`/coach/templates/${result.template.id}`)
        })
    }

    const downloadExample = () => {
        const csvContent = `Dia,Ejercicio,Series,Reps,RIR,Rest,Notas
Espalda,Dominadas,4,8-10,2,90,Agarre prono
Espalda,Remo con barra,4,10-12,2,90,
Espalda,Jalón al pecho,3,12-15,1,60,
Espalda,Face pulls,3,15-20,0,45,
Pecho,Press banca,4,6-8,2,120,
Pecho,Press inclinado mancuernas,4,10-12,2,90,
Pecho,Aperturas en polea,3,12-15,1,60,
Pierna,Sentadilla,5,5,3,180,
Pierna,Prensa,4,10-12,2,90,
Pierna,Curl femoral,3,12-15,1,60,
Pierna,Extensiones,3,15-20,0,60,`

        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'plantilla_ejemplo.csv'
        a.click()
        URL.revokeObjectURL(url)
    }

    const totalExercises = Array.from(parsedData.values()).reduce((acc, exs) => acc + exs.length, 0)

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val)
            if (!val) reset()
        }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline">
                        <Upload className="mr-2 h-4 w-4" />
                        Importar CSV
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                {step === 1 ? (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-primary" />
                                Importar Plantilla de Fuerza
                            </DialogTitle>
                            <DialogDescription>
                                Sube un archivo CSV con tus ejercicios organizados por día de entrenamiento.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            {/* Name */}
                            <div className="space-y-2">
                                <Label>Nombre de la plantilla *</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ej: Push Pull Legs - Hipertrofia"
                                />
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <Label>Descripción</Label>
                                <Textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Breve descripción del objetivo..."
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>

                            {/* Tags */}
                            <div className="space-y-2">
                                <Label>Etiquetas (opcional)</Label>
                                <Input
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    placeholder="Separadas por comas (ej: fuerza, hipertrofia)"
                                />
                                <p className="text-xs text-muted-foreground">Ayuda a filtrar y organizar tus plantillas.</p>
                            </div>

                            {/* CSV Format Guide */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium flex items-center gap-2">
                                        <Info className="h-4 w-4 text-primary" />
                                        Formato del CSV
                                    </h4>
                                    <Button variant="ghost" size="sm" className="gap-2 text-primary" onClick={downloadExample}>
                                        <Download className="h-3.5 w-3.5" />
                                        Descargar ejemplo
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    El archivo debe tener las siguientes columnas (separadas por comas o punto y coma):
                                </p>
                                <div className="bg-background rounded-md border p-3 overflow-x-auto">
                                    <code className="text-xs whitespace-nowrap">
                                        Dia, Ejercicio, Series, Reps, RIR, Rest, Notas
                                    </code>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Los ejercicios se agruparán automáticamente por la columna <strong>Dia</strong>.
                                </p>
                            </div>

                            {/* File Upload */}
                            <div className="space-y-2">
                                <Label>Archivo CSV *</Label>
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={cn(
                                        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
                                        isDragging
                                            ? 'border-primary bg-primary/5 scale-[1.02]'
                                            : file
                                                ? 'border-green-500/50 bg-green-500/5'
                                                : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
                                    )}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0]
                                            if (f) handleFileSelect(f)
                                        }}
                                    />
                                    {file ? (
                                        <div className="space-y-2">
                                            <FileSpreadsheet className="h-10 w-10 text-green-500 mx-auto" />
                                            <p className="text-sm font-medium">{file.name}</p>
                                            {parsedData.size > 0 && (
                                                <div className="flex items-center justify-center gap-2">
                                                    <Badge variant="secondary" className="bg-green-500/10 text-green-500">
                                                        {parsedData.size} días
                                                    </Badge>
                                                    <Badge variant="secondary" className="bg-green-500/10 text-green-500">
                                                        {totalExercises} ejercicios
                                                    </Badge>
                                                </div>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                Haz clic para cambiar el archivo
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <Upload className="h-10 w-10 text-muted-foreground/50 mx-auto" />
                                            <p className="text-sm text-muted-foreground">
                                                Arrastra un archivo CSV aquí o <span className="text-primary font-medium">haz clic para seleccionar</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {parseError && (
                                    <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
                                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>{parseError}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleNext} disabled={!canProceedToStep2}>
                                Siguiente
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Dumbbell className="h-5 w-5 text-primary" />
                                Vista previa: {name}
                            </DialogTitle>
                            <DialogDescription>
                                Revisa los datos importados organizados por día de entrenamiento antes de guardar.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2 max-h-[50vh] overflow-y-auto pr-1">
                            {Array.from(parsedData.entries()).map(([dayName, exercises]) => (
                                <Card key={dayName} className="overflow-hidden">
                                    <div className="bg-primary/10 px-4 py-2 flex items-center justify-between">
                                        <h4 className="font-semibold text-sm flex items-center gap-2">
                                            <Dumbbell className="h-4 w-4 text-primary" />
                                            {dayName}
                                        </h4>
                                        <Badge variant="secondary">{exercises.length} ejercicios</Badge>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/30">
                                                    <th className="p-2 text-left font-medium text-xs">Ejercicio</th>
                                                    <th className="p-2 text-center font-medium text-xs">Series</th>
                                                    <th className="p-2 text-center font-medium text-xs">Reps</th>
                                                    <th className="p-2 text-center font-medium text-xs">RIR</th>
                                                    <th className="p-2 text-center font-medium text-xs">Descanso</th>
                                                    <th className="p-2 text-left font-medium text-xs">Notas</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {exercises.map((ex, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/20">
                                                        <td className="p-2 font-medium">{ex.exercise_name}</td>
                                                        <td className="p-2 text-center">{ex.sets}</td>
                                                        <td className="p-2 text-center">{ex.reps}</td>
                                                        <td className="p-2 text-center">{ex.rir || '-'}</td>
                                                        <td className="p-2 text-center">{ex.rest_seconds}s</td>
                                                        <td className="p-2 text-muted-foreground text-xs">{ex.notes || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            ))}
                        </div>

                        {/* Summary */}
                        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground py-1">
                            <span><strong>{parsedData.size}</strong> días</span>
                            <span>·</span>
                            <span><strong>{totalExercises}</strong> ejercicios</span>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={() => setStep(1)}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Volver
                            </Button>
                            <Button onClick={handleSave} disabled={isPending}>
                                {isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check className="mr-2 h-4 w-4" />
                                        Guardar Plantilla
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}

'use client'

import { useState, useCallback, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
    Upload,
    FileText,
    Download,
    ArrowLeft,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ChevronDown,
    ChevronRight,
    TriangleAlert,
    X,
} from 'lucide-react'
import {
    parseDietCsv,
    downloadCsvTemplate,
    validateCsvFile,
    type CsvParseResult,
    type CsvParseSuccess,
} from '@/lib/dietCsvParser'
import { useCreateDietPlan } from '@/hooks/useDietOptions'
import type { DayType, DietPlanStatus } from '@/data/nutrition/types'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface DietCsvImportWizardProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    coachId: string
    clientId: string
    hasActivePlan: boolean
}

type WizardStep = 'upload' | 'preview'

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DietCsvImportWizard({
    open,
    onOpenChange,
    coachId,
    clientId,
    hasActivePlan,
}: DietCsvImportWizardProps) {
    const [step, setStep] = useState<WizardStep>('upload')
    const [parseResult, setParseResult] = useState<CsvParseSuccess | null>(null)
    const [fileName, setFileName] = useState('')
    const [fileError, setFileError] = useState<string | null>(null)

    // Step 2 form state
    const [planName, setPlanName] = useState('')
    const [effectiveFrom, setEffectiveFrom] = useState(
        new Date().toISOString().split('T')[0]
    )
    const [planStatus, setPlanStatus] = useState<DietPlanStatus>('active')

    // Archive confirmation
    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

    // Preview expand state: track which dayType+meal combos are expanded
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const createMutation = useCreateDietPlan(coachId, clientId)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ---- handlers -------------------------------------------------------

    const handleClose = () => {
        onOpenChange(false)
        // Reset after animation
        setTimeout(reset, 300)
    }

    function reset() {
        setStep('upload')
        setParseResult(null)
        setFileName('')
        setFileError(null)
        setPlanName('')
        setEffectiveFrom(new Date().toISOString().split('T')[0])
        setPlanStatus('active')
        setExpanded(new Set())
        setShowArchiveConfirm(false)
    }

    const processFile = useCallback(async (file: File) => {
        setFileError(null)

        // Validate file meta
        const metaError = validateCsvFile(file)
        if (metaError) {
            setFileError(metaError)
            return
        }

        // Read content
        const text = await file.text()

        // Parse
        const result = parseDietCsv(text)

        if (!result.ok) {
            // Show first 5 errors at most to avoid overwhelming
            const msg = result.errors
                .slice(0, 5)
                .map(e => `Fila ${e.row}: ${e.message}`)
                .join('\n') +
                (result.errors.length > 5
                    ? `\n… y ${result.errors.length - 5} error(es) más.`
                    : '')
            setFileError(msg)
            return
        }

        setParseResult(result)
        setFileName(file.name)
        // Default plan name from file name (strip extension)
        setPlanName(file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' '))
        // Expand all day types by default in preview
        const dayTypes = [...new Set(result.meals.map(m => m.day_type))]
        setExpanded(new Set(dayTypes))
        setStep('preview')
    }, [])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) processFile(file)
        // Reset input so same file can be re-selected
        e.target.value = ''
    }

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) processFile(file)
    }, [processFile])

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault()
    }

    const handleImport = () => {
        if (hasActivePlan && planStatus === 'active') {
            setShowArchiveConfirm(true)
        } else {
            doImport()
        }
    }

    const doImport = async () => {
        if (!parseResult) return

        try {
            await createMutation.mutateAsync({
                name: planName.trim() || 'Dieta importada',
                type: 'options',
                status: planStatus,
                effective_from: effectiveFrom,
                effective_to: null,
                meals: parseResult.meals,
            })
            handleClose()
        } catch {
            // Error toast handled by mutation onError
        }
    }

    const toggleExpanded = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(key)) {
                next.delete(key)
            } else {
                next.add(key)
            }
            return next
        })
    }

    // ---- render ---------------------------------------------------------

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="h-5 w-5" />
                            Importar dieta desde CSV
                        </DialogTitle>
                        <StepIndicator current={step} />
                    </DialogHeader>

                    {step === 'upload' && (
                        <UploadStep
                            fileName={fileName}
                            fileError={fileError}
                            fileInputRef={fileInputRef}
                            onFileChange={handleFileChange}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDownloadTemplate={downloadCsvTemplate}
                            onCancel={handleClose}
                        />
                    )}

                    {step === 'preview' && parseResult && (
                        <PreviewStep
                            parseResult={parseResult}
                            planName={planName}
                            effectiveFrom={effectiveFrom}
                            planStatus={planStatus}
                            hasActivePlan={hasActivePlan}
                            expanded={expanded}
                            isSaving={createMutation.isPending}
                            onPlanNameChange={setPlanName}
                            onEffectiveFromChange={setEffectiveFrom}
                            onPlanStatusChange={setPlanStatus}
                            onToggleExpanded={toggleExpanded}
                            onBack={() => setStep('upload')}
                            onImport={handleImport}
                            onCancel={handleClose}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Archive confirmation */}
            <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Reemplazar dieta activa?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Ya existe un plan activo para este cliente. Al importar este CSV
                            como plan activo, el plan actual se archivará automáticamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setShowArchiveConfirm(false)
                                doImport()
                            }}
                        >
                            Sí, importar y archivar el actual
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

// ============================================================================
// STEP INDICATOR
// ============================================================================

function StepIndicator({ current }: { current: WizardStep }) {
    const steps: { id: WizardStep; label: string }[] = [
        { id: 'upload', label: 'Archivo' },
        { id: 'preview', label: 'Preview' },
    ]
    const idx = steps.findIndex(s => s.id === current)

    return (
        <div className="flex justify-center gap-4 py-1">
            {steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                    <div
                        className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                            i === idx
                                ? 'bg-primary text-primary-foreground'
                                : i < idx
                                    ? 'bg-green-500 text-white'
                                    : 'bg-muted text-muted-foreground'
                        )}
                    >
                        {i < idx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className="text-sm hidden sm:inline text-muted-foreground">
                        {s.label}
                    </span>
                </div>
            ))}
        </div>
    )
}

// ============================================================================
// STEP 1: UPLOAD
// ============================================================================

interface UploadStepProps {
    fileName: string
    fileError: string | null
    fileInputRef: React.RefObject<HTMLInputElement>
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
    onDownloadTemplate: () => void
    onCancel: () => void
}

function UploadStep({
    fileName,
    fileError,
    fileInputRef,
    onFileChange,
    onDrop,
    onDragOver,
    onDownloadTemplate,
    onCancel,
}: UploadStepProps) {
    return (
        <div className="space-y-5 py-2">
            {/* Drag & Drop zone */}
            <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                    'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                    'hover:border-primary/60 hover:bg-primary/5',
                    fileError
                        ? 'border-destructive/60 bg-destructive/5'
                        : 'border-muted-foreground/30'
                )}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={onFileChange}
                />
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium text-sm">
                    {fileName
                        ? <span className="text-primary flex items-center justify-center gap-2">
                            <FileText className="h-4 w-4" />
                            {fileName}
                        </span>
                        : 'Arrastra tu archivo CSV aquí o haz clic para seleccionarlo'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Solo archivos .csv · Máximo 2 MB</p>
            </div>

            {/* Errors */}
            {fileError && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-destructive mb-1">Error al procesar el archivo</p>
                            <pre className="text-xs text-destructive/80 whitespace-pre-wrap font-mono">
                                {fileError}
                            </pre>
                        </div>
                    </div>
                </div>
            )}

            {/* Template download + instructions */}
            <div className="bg-muted/40 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Cómo preparar tu archivo</p>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onDownloadTemplate() }}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Descargar plantilla
                    </Button>
                </div>

                <div className="text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">Columnas obligatorias</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span>• Tipo de día</span>
                        <span>• Cantidad</span>
                        <span>• Nombre de la comida</span>
                        <span>• Unidad</span>
                        <span>• Nombre de la opción</span>
                        <span>• Nombre del alimento</span>
                    </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground">Valores válidos para «Tipo de día»</p>
                    <ul className="space-y-0.5 ml-2">
                        <li><strong>Entreno</strong> — día de entrenamiento</li>
                        <li><strong>Descanso</strong> — día de descanso</li>
                        <li><strong>Normal</strong> — día estándar</li>
                        <li><strong>Doble sesión</strong> — se tratará como entreno</li>
                    </ul>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Estructura</p>
                    <ul className="space-y-0.5 ml-2">
                        <li>Un mismo tipo de día puede tener varias comidas</li>
                        <li>Una misma comida puede tener varias opciones</li>
                        <li>Cada opción puede tener varios alimentos</li>
                    </ul>
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
            </div>
        </div>
    )
}

// ============================================================================
// STEP 2: PREVIEW
// ============================================================================

interface PreviewStepProps {
    parseResult: CsvParseSuccess
    planName: string
    effectiveFrom: string
    planStatus: DietPlanStatus
    hasActivePlan: boolean
    expanded: Set<string>
    isSaving: boolean
    onPlanNameChange: (v: string) => void
    onEffectiveFromChange: (v: string) => void
    onPlanStatusChange: (v: DietPlanStatus) => void
    onToggleExpanded: (key: string) => void
    onBack: () => void
    onImport: () => void
    onCancel: () => void
}

function PreviewStep({
    parseResult,
    planName,
    effectiveFrom,
    planStatus,
    hasActivePlan,
    expanded,
    isSaving,
    onPlanNameChange,
    onEffectiveFromChange,
    onPlanStatusChange,
    onToggleExpanded,
    onBack,
    onImport,
    onCancel,
}: PreviewStepProps) {
    const { stats, warnings, meals } = parseResult

    // Group meals by day_type preserving order
    const dayTypes = [...new Set(meals.map(m => m.day_type))] as DayType[]

    return (
        <div className="space-y-5 py-2">
            {/* Warnings */}
            {warnings.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 mb-1 text-yellow-600">
                        <TriangleAlert className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-medium">Avisos de normalización</span>
                    </div>
                    {warnings.map((w, i) => (
                        <p key={i} className="text-xs text-yellow-600/90">
                            Fila {w.row}: {w.message}
                        </p>
                    ))}
                </div>
            )}

            {/* Active plan warning */}
            {hasActivePlan && planStatus === 'active' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                        <strong>Ya existe un plan activo.</strong> Al importar como "Activo" se archivará el plan actual.
                        Si no quieres esto, cambia el estado a "Borrador".
                    </p>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'Tipos de día', value: stats.dayTypes },
                    { label: 'Comidas', value: stats.meals },
                    { label: 'Opciones', value: stats.options },
                    { label: 'Alimentos', value: stats.items },
                ].map(s => (
                    <Card key={s.label} className="p-3 text-center">
                        <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </Card>
                ))}
            </div>

            {/* Plan config */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1 space-y-1.5">
                    <Label>Nombre del plan</Label>
                    <Input
                        value={planName}
                        onChange={e => onPlanNameChange(e.target.value)}
                        placeholder="Nombre de la dieta"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Fecha inicio</Label>
                    <Input
                        type="date"
                        value={effectiveFrom}
                        onChange={e => onEffectiveFromChange(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label>Estado</Label>
                    <Select value={planStatus} onValueChange={v => onPlanStatusChange(v as DietPlanStatus)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Activo</SelectItem>
                            <SelectItem value="draft">Borrador</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Data preview */}
            <div>
                <p className="text-sm font-medium mb-2">Vista previa de la dieta</p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {dayTypes.map(dt => {
                        const dtMeals = meals.filter(m => m.day_type === dt)
                        const isOpen = expanded.has(dt)

                        return (
                            <div key={dt} className="border rounded-lg overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => onToggleExpanded(dt)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-xs">
                                            {DAY_TYPE_LABELS[dt] || dt}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {dtMeals.length} comida{dtMeals.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    {isOpen
                                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    }
                                </button>

                                {isOpen && (
                                    <div className="border-t divide-y">
                                        {dtMeals.map(meal => {
                                            const mealKey = `${dt}__${meal.name}`
                                            const mealOpen = expanded.has(mealKey)

                                            return (
                                                <div key={meal.name}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onToggleExpanded(mealKey)}
                                                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/20 text-sm"
                                                    >
                                                        <span className="font-medium">{meal.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="text-xs">
                                                                {meal.options.length} opción{meal.options.length !== 1 ? 'es' : ''}
                                                            </Badge>
                                                            {mealOpen
                                                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                            }
                                                        </div>
                                                    </button>

                                                    {mealOpen && (
                                                        <div className="px-4 pb-2 space-y-1.5">
                                                            {meal.options.map(opt => (
                                                                <div key={opt.name} className="bg-muted/20 rounded p-2">
                                                                    <p className="text-xs font-medium mb-1">{opt.name}</p>
                                                                    <ul className="space-y-0.5">
                                                                        {opt.items.map((item, i) => (
                                                                            <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                                                                                <span className="text-primary">•</span>
                                                                                <strong>
                                                                                    {item.quantity_value}
                                                                                    {item.quantity_unit && ` ${item.quantity_unit}`}
                                                                                </strong>
                                                                                {' '}{item.name}
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between pt-3 border-t">
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onBack} disabled={isSaving}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Atrás
                    </Button>
                    <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
                        <X className="h-4 w-4 mr-1" />
                        Cancelar
                    </Button>
                </div>
                <Button
                    onClick={onImport}
                    disabled={isSaving || !planName.trim()}
                    className="gap-2"
                >
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isSaving ? 'Importando...' : 'Importar dieta'}
                </Button>
            </div>
        </div>
    )
}

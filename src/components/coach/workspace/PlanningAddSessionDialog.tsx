"use client"

import { useState, useTransition, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
    Dumbbell,
    Footprints,
    CalendarPlus,
    Loader2,
    FileText,
    PenLine,
    Search,
    Heart,
    Check,
    ArrowLeft
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

import { getActiveProgram, scheduleStrengthSession, scheduleCardioSession } from "@/app/(coach)/coach/workspace/planning-actions"
import { getTemplates } from "../../../../app/(coach)/coach/templates/actions"
import { CardioSessionForm } from "./CardioSessionForm"
import { CardioStructure, CardioBlock, TrainingTemplate } from "@/types/templates"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Legacy helper (same as in CardioTemplateDialog)
// ---------------------------------------------------------------------------
function blocksToText(blocks: CardioBlock[]): string {
    if (!blocks || blocks.length === 0) return ''
    return blocks.map((block, i) => {
        const prefix = `Bloque ${i + 1}`
        if (block.type === 'continuous') {
            const d: string[] = []
            if (block.distance) d.push(`${block.distance}km`)
            if (block.duration) d.push(`${block.duration} min`)
            const pace = block.targetPace || block.intensity
            if (pace) d.push(`@ ${pace}`)
            if (block.targetHR) d.push(`[${block.targetHR}]`)
            return `${prefix} – Continuo: ${d.join(' – ') || 'Sin detalles'}`
        }
        if (block.type === 'intervals') {
            const sets = block.sets || '?'
            const effort = block.workDistance ? `${block.workDistance}km` : block.workDuration ? `${block.workDuration}min` : '?'
            const d = [`${sets}x${effort}`]
            const pace = block.workTargetPace || block.workIntensity
            if (pace) d.push(`@ ${pace}`)
            if (block.restDuration) d.push(`– Recu: ${block.restDuration}' ${block.restType === 'active' ? 'activo' : 'pasivo'}`)
            return `${prefix} – Series: ${d.join(' ')}`
        }
        if (block.type === 'station') {
            const d: string[] = []
            if (block.duration) d.push(`${block.duration} min`)
            if (block.notes) d.push(block.notes)
            return `${prefix} – Estación: ${d.join(' – ') || 'Sin detalles'}`
        }
        return `${prefix}: ${block.notes || 'Sin detalles'}`
    }).join('\n')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface PlanningAddSessionDialogProps {
    clientId: string;
    coachId: string;
    date: Date;
    onSessionAdded: () => void;
}

type SessionType = 'strength' | 'cardio' | null;
type CardioMode = 'choose' | 'template-list' | 'editor';

export function PlanningAddSessionDialog({ clientId, coachId, date, onSessionAdded }: PlanningAddSessionDialogProps) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [sessionType, setSessionType] = useState<SessionType>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    // Strength State
    const [activeProgram, setActiveProgram] = useState<any>(null);
    const [selectedDayId, setSelectedDayId] = useState<string>("");
    const [loadingProgram, setLoadingProgram] = useState(false);

    // Cardio wizard state
    const [cardioMode, setCardioMode] = useState<CardioMode>('choose');
    const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<TrainingTemplate | null>(null);
    const [cardioInitialData, setCardioInitialData] = useState<{
        name?: string;
        description?: string;
        structure?: CardioStructure;
    } | undefined>(undefined);

    // Fetch Active Program when dialog opens or session type changes to strength
    useEffect(() => {
        if (open && sessionType === 'strength' && !activeProgram) {
            setLoadingProgram(true);
            getActiveProgram(clientId)
                .then(res => {
                    if (res.success) {
                        setActiveProgram(res.data);
                    } else {
                        toast({
                            title: "Error",
                            description: "No se pudo cargar el programa activo.",
                            variant: "destructive"
                        });
                    }
                })
                .finally(() => setLoadingProgram(false));
        }
    }, [open, sessionType, clientId, activeProgram, toast]);

    // Fetch templates when user picks cardio
    useEffect(() => {
        if (open && sessionType === 'cardio' && templates.length === 0 && !loadingTemplates) {
            setLoadingTemplates(true);
            getTemplates('cardio')
                .then(data => setTemplates(data))
                .catch((_err: unknown) => { /* fail silently, user can still create from scratch */ })
                .finally(() => setLoadingTemplates(false));
        }
    }, [open, sessionType, templates.length, loadingTemplates]);

    const filteredTemplates = useMemo(() => {
        if (!searchQuery.trim()) return templates;
        const q = searchQuery.toLowerCase();
        return templates.filter(t =>
            t.name.toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q) ||
            t.tags?.some(tag => tag.toLowerCase().includes(q))
        );
    }, [templates, searchQuery]);

    const handleReset = () => {
        setStep(1);
        setSessionType(null);
        setSelectedDayId("");
        setCardioMode('choose');
        setSearchQuery('');
        setSelectedTemplate(null);
        setCardioInitialData(undefined);
    };

    const handleSelectType = (type: 'strength' | 'cardio') => {
        setSessionType(type);
        if (type === 'strength') {
            setStep(2);
        }
        // For cardio, stay on step 1 but show cardio sub-step (choose mode)
    };

    // When user picks "Crear desde cero"
    const handleCardioFromScratch = () => {
        setCardioInitialData(undefined);
        setCardioMode('editor');
        setStep(2);
    };

    // When user picks "Usar plantilla"
    const handleShowTemplateList = () => {
        setCardioMode('template-list');
    };

    // When user selects a template and confirms
    const handleConfirmTemplate = () => {
        if (!selectedTemplate) return;

        const structure = (selectedTemplate.structure as CardioStructure) || {};
        const legacyBlocks = structure.blocks || [];
        const hasLegacyBlocks = legacyBlocks.length > 0 && !structure.description;
        const description = structure.description
            || (hasLegacyBlocks ? blocksToText(legacyBlocks) : '')
            || selectedTemplate.description
            || '';

        setCardioInitialData({
            name: selectedTemplate.name,
            description: description,
            structure: {
                trainingType: structure.trainingType || 'rodaje',
                notes: structure.notes || '',
                blocks: [],
            },
        });
        setCardioMode('editor');
        setStep(2);
    };

    // Go back within cardio sub-steps
    const handleCardioBack = () => {
        if (cardioMode === 'template-list') {
            setCardioMode('choose');
            setSearchQuery('');
            setSelectedTemplate(null);
        } else if (cardioMode === 'editor') {
            setCardioMode('choose');
            setCardioInitialData(undefined);
            setStep(1);
        } else {
            // Back to type selection
            setSessionType(null);
        }
    };

    // SUBMIT STRENGTH
    const handleStrengthSubmit = () => {
        if (!selectedDayId || !activeProgram) return;

        startTransition(async () => {
            const result = await scheduleStrengthSession({
                clientId,
                date,
                programId: activeProgram.id,
                dayId: selectedDayId,
            });

            if (result.success) {
                toast({
                    title: "Sesión agendada",
                    description: "La sesión de fuerza se ha añadido al calendario.",
                    className: "bg-green-500 text-white border-none",
                });
                onSessionAdded();
                setOpen(false);
                handleReset();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "No se pudo agendar la sesión.",
                    variant: "destructive"
                });
            }
        });
    };

    // SUBMIT CARDIO
    const handleCardioSubmit = async (data: { name: string; description?: string; structure: CardioStructure }) => {
        startTransition(async () => {
            const result = await scheduleCardioSession({
                clientId,
                coachId,
                date,
                name: data.name,
                description: data.description,
                structure: data.structure
            });

            if (result.success) {
                toast({
                    title: "Sesión agendada",
                    description: "La sesión de cardio se ha añadido al calendario.",
                    className: "bg-green-500 text-white border-none",
                });
                onSessionAdded();
                setOpen(false);
                handleReset();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "No se pudo agendar la sesión.",
                    variant: "destructive"
                });
            }
        });
    };

    // Compute dialog title
    const dialogTitle = (() => {
        if (step === 2 && sessionType === 'cardio') {
            return `Sesión de Cardio - ${format(date, "d 'de' MMMM", { locale: es })}`;
        }
        return `Añadir Sesión - ${format(date, "EEEE d 'de' MMMM", { locale: es })}`;
    })();

    const dialogDescription = (() => {
        if (sessionType === 'cardio' && cardioMode === 'choose') {
            return 'Elige cómo quieres añadir la sesión de cardio.';
        }
        if (sessionType === 'cardio' && cardioMode === 'template-list') {
            return 'Selecciona una plantilla para empezar.';
        }
        if (step === 2 && sessionType === 'cardio') {
            return selectedTemplate
                ? `Basada en: "${selectedTemplate.name}". Puedes modificar todo antes de guardar.`
                : 'Configura los detalles de tu sesión.';
        }
        return 'Agenda un entrenamiento para este día.';
    })();

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val);
            if (!val) handleReset();
        }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/20 hover:text-primary">
                    <CalendarPlus className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>

                {/* ═══════════════════════════════════════════════ */}
                {/* STEP 1: SELECT TYPE (Strength / Cardio)        */}
                {/* ═══════════════════════════════════════════════ */}
                {step === 1 && !sessionType && (
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <Card
                            className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                            onClick={() => handleSelectType('strength')}
                        >
                            <CardContent className="flex flex-col items-center justify-center p-6 gap-4">
                                <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/40">
                                    <Dumbbell className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="text-center">
                                    <h3 className="font-semibold text-lg">Fuerza</h3>
                                    <p className="text-sm text-muted-foreground">Sesión del programa activo</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                            onClick={() => handleSelectType('cardio')}
                        >
                            <CardContent className="flex flex-col items-center justify-center p-6 gap-4">
                                <div className="p-4 rounded-full bg-orange-100 dark:bg-orange-900/40">
                                    <Footprints className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div className="text-center">
                                    <h3 className="font-semibold text-lg">Cardio</h3>
                                    <p className="text-sm text-muted-foreground">Running, Bici, Remo...</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════ */}
                {/* CARDIO SUB-STEP: Choose mode                   */}
                {/* ═══════════════════════════════════════════════ */}
                {step === 1 && sessionType === 'cardio' && cardioMode === 'choose' && (
                    <div className="space-y-4 py-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCardioBack}
                            className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="mr-1 h-4 w-4" /> Volver
                        </Button>

                        <div className="grid grid-cols-2 gap-4">
                            <Card
                                className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                                onClick={handleShowTemplateList}
                            >
                                <CardContent className="flex flex-col items-center justify-center p-6 gap-4">
                                    <div className="p-4 rounded-full bg-violet-100 dark:bg-violet-900/40">
                                        <FileText className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="font-semibold text-lg">Usar plantilla</h3>
                                        <p className="text-sm text-muted-foreground">Rellena con una plantilla existente</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card
                                className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                                onClick={handleCardioFromScratch}
                            >
                                <CardContent className="flex flex-col items-center justify-center p-6 gap-4">
                                    <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/40">
                                        <PenLine className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="font-semibold text-lg">Crear desde cero</h3>
                                        <p className="text-sm text-muted-foreground">Formulario vacío</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════ */}
                {/* CARDIO SUB-STEP: Template list                 */}
                {/* ═══════════════════════════════════════════════ */}
                {step === 1 && sessionType === 'cardio' && cardioMode === 'template-list' && (
                    <div className="space-y-4 py-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCardioBack}
                            className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="mr-1 h-4 w-4" /> Volver
                        </Button>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar plantilla..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Template list */}
                        {loadingTemplates ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">
                                    {templates.length === 0
                                        ? 'No tienes plantillas de cardio. Crea una en Plantillas.'
                                        : 'No se encontraron plantillas con esa búsqueda.'}
                                </p>
                            </div>
                        ) : (
                            <ScrollArea className="max-h-[280px]">
                                <div className="space-y-2 pr-2">
                                    {filteredTemplates.map((template) => {
                                        const structure = (template.structure as CardioStructure) || {};
                                        const isSelected = selectedTemplate?.id === template.id;
                                        return (
                                            <Card
                                                key={template.id}
                                                className={cn(
                                                    "cursor-pointer transition-all hover:bg-accent/50",
                                                    isSelected && "border-primary bg-primary/5"
                                                )}
                                                onClick={() => setSelectedTemplate(template)}
                                            >
                                                <CardContent className="p-3 flex items-center gap-3">
                                                    <div className={cn(
                                                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                                                        isSelected ? "bg-primary text-primary-foreground" : "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {isSelected
                                                            ? <Check className="h-5 w-5" />
                                                            : <Heart className="h-5 w-5" />
                                                        }
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-sm truncate">{template.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {structure.trainingType && (
                                                                <span className="capitalize">{structure.trainingType}</span>
                                                            )}
                                                            {template.description && (
                                                                <span> · {template.description}</span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    {template.tags && template.tags.length > 0 && (
                                                        <div className="hidden sm:flex gap-1 shrink-0">
                                                            {template.tags.slice(0, 2).map((tag, i) => (
                                                                <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                                                                    {tag}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </ScrollArea>
                        )}

                        {/* Confirm button */}
                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleConfirmTemplate}
                                disabled={!selectedTemplate}
                            >
                                Continuar con plantilla
                            </Button>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════ */}
                {/* STEP 2: STRENGTH FORM                          */}
                {/* ═══════════════════════════════════════════════ */}
                {step === 2 && sessionType === 'strength' && (
                    <div className="space-y-6 py-4">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="sm" onClick={() => { setStep(1); setSessionType(null); }} className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground">
                                <ArrowLeft className="mr-1 h-4 w-4" /> Volver
                            </Button>
                        </div>

                        {loadingProgram ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : activeProgram ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Programa Activo: <span className="font-bold">{activeProgram.name}</span></Label>
                                    <Select value={selectedDayId} onValueChange={setSelectedDayId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecciona un día de entrenamiento" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {activeProgram.training_days?.map((day: any) => (
                                                <SelectItem key={day.id} value={day.id}>
                                                    {day.order}. {day.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleStrengthSubmit} disabled={!selectedDayId || isPending}>
                                        {isPending ? "Agendando..." : "Agendar Sesión"}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>No hay un programa de entrenamiento activo para este cliente.</p>
                                <Button variant="link" onClick={() => { setStep(1); setSessionType(null); }}>Volver</Button>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════ */}
                {/* STEP 2: CARDIO FORM                            */}
                {/* ═══════════════════════════════════════════════ */}
                {step === 2 && sessionType === 'cardio' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCardioBack}
                                className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground"
                            >
                                <ArrowLeft className="mr-1 h-4 w-4" /> Volver
                            </Button>
                        </div>

                        <CardioSessionForm
                            key={selectedTemplate?.id || 'blank'}
                            initialData={cardioInitialData}
                            onSubmit={handleCardioSubmit}
                            isSubmitting={isPending}
                            onCancel={handleCardioBack}
                        />
                    </div>
                )}

            </DialogContent>
        </Dialog>
    )
}

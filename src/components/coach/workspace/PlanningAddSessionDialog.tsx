"use client"

import { useState, useTransition, useEffect } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
    Dumbbell,
    Footprints,
    CalendarPlus,
    Loader2
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
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent } from "@/components/ui/card"

import { getActiveProgram, scheduleStrengthSession, scheduleCardioSession } from "@/app/(coach)/coach/workspace/planning-actions"
import { CardioSessionForm } from "./CardioSessionForm"
import { CardioStructure } from "@/types/templates"

interface PlanningAddSessionDialogProps {
    clientId: string;
    date: Date;
    onSessionAdded: () => void;
}

type SessionType = 'strength' | 'cardio' | null;

export function PlanningAddSessionDialog({ clientId, date, onSessionAdded }: PlanningAddSessionDialogProps) {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [sessionType, setSessionType] = useState<SessionType>(null);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    // Strength State
    const [activeProgram, setActiveProgram] = useState<any>(null);
    const [selectedDayId, setSelectedDayId] = useState<string>("");
    const [loadingProgram, setLoadingProgram] = useState(false);

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

    const handleReset = () => {
        setStep(1);
        setSessionType(null);
        setSelectedDayId("");
    };

    const handleSelectType = (type: 'strength' | 'cardio') => {
        setSessionType(type);
        setStep(2);
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
                    <DialogTitle>Añadir Sesión - {format(date, "EEEE d 'de' MMMM", { locale: es })}</DialogTitle>
                    <DialogDescription>
                        Agenda un entrenamiento para este día.
                    </DialogDescription>
                </DialogHeader>

                {/* STEP 1: SELECT TYPE */}
                {step === 1 && (
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

                {/* STEP 2: STRENGTH FORM */}
                {step === 2 && sessionType === 'strength' && (
                    <div className="space-y-6 py-4">
                        <div className="flex items-center justify-between">
                            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground">
                                ← Volver
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
                                <Button variant="link" onClick={() => setStep(1)}>Volver</Button>
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 2: CARDIO FORM */}
                {step === 2 && sessionType === 'cardio' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="p-0 h-auto font-normal text-muted-foreground hover:text-foreground">
                                ← Volver
                            </Button>
                        </div>

                        <CardioSessionForm
                            onSubmit={handleCardioSubmit}
                            isSubmitting={isPending}
                            onCancel={() => setStep(1)}
                        />
                    </div>
                )}

            </DialogContent>
        </Dialog>
    )
}

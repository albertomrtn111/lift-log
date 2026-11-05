'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { BrandingSettingsPanel } from '@/components/coach/settings/BrandingSettingsPanel'
import { LibrarySettingsPanel } from '@/components/coach/settings/LibrarySettingsPanel'
import { TeamSettingsPanel } from '@/components/coach/settings/TeamSettingsPanel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    applyLibraryTemplateAction,
    finishSalaOnboardingAction,
    getSalaSetupAction,
    saveCenterAction,
    type AgendaMode,
} from '@/lib/onboarding/sala-actions'
import { LIBRARY_TEMPLATES } from '@/lib/training/workspace-library-rules'
import { cn } from '@/lib/utils'

const STEPS = ['Datos del centro', 'Logo y colores', 'Ejercicios favoritos', 'Tu equipo', 'Agenda'] as const

const AGENDA_OPTIONS: { value: AgendaMode; label: string; description: string }[] = [
    { value: 'connected', label: 'Conectada', description: 'Las citas llegan de tu programa de gestión, como FisioTrack.' },
    { value: 'own', label: 'Propia', description: 'Tu equipo crea las citas en NexTrain.' },
    { value: 'none', label: 'Sin agenda', description: 'Solo registráis las sesiones.' },
]

export function SalaOnboardingWizard() {
    const [step, setStep] = useState(0)
    const [name, setName] = useState('')
    const [address, setAddress] = useState('')
    const [agendaMode, setAgendaMode] = useState<AgendaMode>('none')
    const [libraryVersion, setLibraryVersion] = useState(0)
    const [pending, startTransition] = useTransition()

    useEffect(() => {
        void getSalaSetupAction().then(result => {
            if (result.success && result.data) {
                setName(result.data.name)
                setAddress(result.data.address)
                setAgendaMode(result.data.agendaMode)
            }
        })
    }, [])

    function next() {
        if (step === 0) {
            startTransition(async () => {
                const result = await saveCenterAction({ name, address })
                if (result.success) setStep(1)
                else toast.error(result.error)
            })
            return
        }
        if (step < STEPS.length - 1) {
            setStep(step + 1)
            return
        }
        startTransition(async () => {
            const result = await finishSalaOnboardingAction(agendaMode)
            if (result.success) {
                // Recarga completa: el panel tiene que leer ya la sala terminada.
                window.location.assign('/coach/dashboard')
            } else {
                toast.error(result.error)
            }
        })
    }

    function applyTemplate(template: string) {
        startTransition(async () => {
            const result = await applyLibraryTemplateAction(template)
            if (result.success) {
                toast.success(`${result.data?.added ?? 0} ejercicios en tu biblioteca`)
                setLibraryVersion(version => version + 1)
            } else {
                toast.error(result.error)
            }
        })
    }

    return (
        <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-28 lg:pb-8">
            <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Paso {step + 1} de {STEPS.length}</p>
                <h1 className="text-2xl font-bold tracking-tight">{STEPS[step]}</h1>
                <div className="flex gap-1.5 pt-2" aria-hidden="true">
                    {STEPS.map((label, index) => (
                        <span
                            key={label}
                            className={cn('h-1.5 flex-1 rounded-full', index <= step ? 'bg-primary' : 'bg-muted')}
                        />
                    ))}
                </div>
            </div>

            {step === 0 && (
                <Card className="space-y-4 p-5">
                    <div className="space-y-1.5">
                        <Label htmlFor="center-name">Nombre del centro</Label>
                        <Input id="center-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="center-address">Dirección</Label>
                        <Input id="center-address" value={address} onChange={event => setAddress(event.target.value)} />
                    </div>
                </Card>
            )}

            {step === 1 && <BrandingSettingsPanel />}

            {step === 2 && (
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(LIBRARY_TEMPLATES).map(([key, template]) => (
                            <Card key={key} className="space-y-3 p-4">
                                <div>
                                    <p className="text-sm font-medium">{template.label}</p>
                                    <p className="text-xs text-muted-foreground">{template.description}</p>
                                </div>
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => applyTemplate(key)}>
                                    Empezar con esta plantilla
                                </Button>
                            </Card>
                        ))}
                    </div>
                    <LibrarySettingsPanel key={libraryVersion} />
                </div>
            )}

            {step === 3 && <TeamSettingsPanel />}

            {step === 4 && (
                <div className="grid gap-3" role="radiogroup" aria-label="Modo de agenda">
                    {AGENDA_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={agendaMode === option.value}
                            onClick={() => setAgendaMode(option.value)}
                            className={cn(
                                'rounded-lg border p-4 text-left transition-colors',
                                agendaMode === option.value ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                            )}
                        >
                            <span className="block text-sm font-medium">{option.label}</span>
                            <span className="block text-xs text-muted-foreground">{option.description}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>
                    Atrás
                </Button>
                <Button disabled={pending} onClick={next}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {step === STEPS.length - 1 ? 'Terminar' : 'Siguiente'}
                </Button>
            </div>
        </div>
    )
}

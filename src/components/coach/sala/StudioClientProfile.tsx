'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StudioGridData } from '@/data/studio'
import {
    findPeopleAction,
    getLinkedPatientAction,
    linkPatientAction,
    saveClientProfileAction,
    type StudioPatientMatch,
} from '@/lib/studio/client-actions'
import { birthdayInfo, cleanObjectives, nameKey } from '@/lib/studio/client-rules'

const today = () => new Date().toISOString().slice(0, 10)

/** Objetivos, cumpleaños y ficha de FisioTrack del cliente. */
export function StudioClientProfile({ data }: { data: StudioGridData }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const client = data.client
    const [objectives, setObjectives] = useState<string[]>(client.objectives.length > 0 ? client.objectives : [''])
    const [birthday, setBirthday] = useState(client.birthday ?? '')
    const changed = JSON.stringify(cleanObjectives(objectives)) !== JSON.stringify(client.objectives)
        || (birthday || null) !== (client.birthday || null)

    function save() {
        startTransition(async () => {
            const result = await saveClientProfileAction(client.id, objectives, birthday || null)
            if (!result.success) return void toast.error(result.error)
            toast.success('Guardado')
            router.refresh()
        })
    }

    const info = birthdayInfo(birthday || null, today())

    return (
        <section className="space-y-4" aria-labelledby="ficha-datos">
            <h3 id="ficha-datos" className="text-sm font-semibold">Objetivos y datos</h3>
            <div className="space-y-1.5">
                <span className="text-sm font-medium">Objetivos</span>
                {objectives.map((point, index) => (
                    <div key={index} className="flex gap-2">
                        <Input
                            value={point}
                            maxLength={200}
                            autoComplete="off"
                            aria-label={`Objetivo ${index + 1}`}
                            placeholder={index === 0 ? 'Volver a correr sin dolor, bajar 5 kg…' : ''}
                            onChange={event => setObjectives(objectives.map((entry, position) => (position === index ? event.target.value : entry)))}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && objectives.length < 12) {
                                    event.preventDefault()
                                    setObjectives([...objectives.slice(0, index + 1), '', ...objectives.slice(index + 1)])
                                }
                            }}
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="shrink-0"
                            aria-label={`Quitar el objetivo ${index + 1}`}
                            onClick={() => setObjectives(objectives.length > 1 ? objectives.filter((_, position) => position !== index) : [''])}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ))}
                {objectives.length < 12 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setObjectives([...objectives, ''])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Otro objetivo
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
                <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="ficha-cumple">Fecha de nacimiento</Label>
                    <Input id="ficha-cumple" type="date" value={birthday} onChange={event => setBirthday(event.target.value)} />
                </div>
                <p className="pb-2 text-sm text-muted-foreground">{info ? `${info.age} años · cumple el ${info.label}` : ''}</p>
            </div>
            <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" disabled={isPending || !changed} onClick={save}>
                    Guardar objetivos y datos
                </Button>
            </div>
            <FisioTrackLink coachId={data.coachId} clientId={client.id} clientName={client.fullName} />
        </section>
    )
}

/** Vincular, cambiar o desvincular su paciente de FisioTrack. */
function FisioTrackLink({ coachId, clientId, clientName }: { coachId: string; clientId: string; clientName: string }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [patient, setPatient] = useState<StudioPatientMatch | null | undefined>(undefined)
    const [searching, setSearching] = useState(false)
    const [query, setQuery] = useState('')
    const [found, setFound] = useState<StudioPatientMatch[]>([])

    useEffect(() => {
        let current = true
        getLinkedPatientAction(clientId).then(result => {
            if (current) setPatient(result.success ? result.data : null)
        })
        return () => { current = false }
    }, [clientId])

    useEffect(() => {
        if (!searching || nameKey(query).length < 2) return
        let current = true
        const timer = setTimeout(() => {
            findPeopleAction(coachId, query).then(result => {
                if (current && result.success) setFound(result.data.patients)
            })
        }, 300)
        return () => { current = false; clearTimeout(timer) }
    }, [coachId, query, searching])

    function link(next: StudioPatientMatch | null) {
        startTransition(async () => {
            const result = await linkPatientAction(clientId, next?.id ?? null)
            if (!result.success) return void toast.error(result.error)
            setPatient(next)
            setSearching(false)
            setQuery('')
            toast.success(next ? `Vinculado con ${next.full_name}` : 'Desvinculado de FisioTrack')
            router.refresh()
        })
    }

    if (patient === undefined) return null

    return (
        <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-medium">FisioTrack</p>
                    <p className="truncate text-xs text-muted-foreground">
                        {patient ? `Vinculado con ${patient.full_name}: sus citas crean sus sesiones.` : 'Sin vincular: sus citas no llegan a la sala.'}
                    </p>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                            setSearching(!searching)
                            setQuery(searching ? '' : clientName)
                        }}
                    >
                        {patient ? 'Cambiar' : 'Vincular'}
                    </Button>
                    {patient && (
                        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => link(null)}>
                            Desvincular
                        </Button>
                    )}
                </div>
            </div>
            {searching && (
                <div className="space-y-1.5">
                    <Input
                        value={query}
                        autoComplete="off"
                        aria-label="Buscar paciente de FisioTrack"
                        placeholder="Nombre del paciente en FisioTrack"
                        onChange={event => setQuery(event.target.value)}
                    />
                    {nameKey(query).length >= 2 && found.length === 0 && (
                        <p className="text-xs text-muted-foreground">No hay pacientes sin vincular con ese nombre.</p>
                    )}
                    {found.map(entry => {
                        const info = birthdayInfo(entry.birth_date, today())
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                disabled={isPending}
                                onClick={() => link(entry)}
                                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                            >
                                <span className="block text-sm">{entry.full_name}</span>
                                {info && <span className="block text-xs text-muted-foreground">{info.age} años</span>}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

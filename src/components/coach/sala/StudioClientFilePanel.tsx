'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { StudioGridData } from '@/data/studio'
import { BODY_REGIONS, BODY_WIDTH } from '@/lib/studio/body-map'
import {
    emptyInjuryForm,
    injuryFields,
    injuryToForm,
    regionLabel,
    regionStates,
    sortInjuries,
    structuresFor,
} from '@/lib/studio/body-rules'
import { timeAgo } from '@/lib/studio/editor-rules'
import {
    deleteInjuryAction,
    getClientFileAction,
    saveInjuryAction,
    saveRelevantNoteAction,
    type StudioClientFile,
} from '@/lib/studio/session-actions'
import { cn } from '@/lib/utils'

const MAP_WIDTH = BODY_WIDTH * 2 + 20
const VIEW_OFFSET: Record<string, number> = { f: 0, b: BODY_WIDTH + 20 }

function regionPoints(region: (typeof BODY_REGIONS)[number]) {
    const offset = VIEW_OFFSET[region.v]
    if ('ellipse' in region) {
        const [cx, cy, rx, ry] = region.ellipse as number[]
        return { kind: 'ellipse' as const, cx: cx + offset, cy, rx, ry }
    }
    return { kind: 'polygon' as const, points: (region.polygon as number[][]).map(([x, y]) => `${x + offset},${y}`).join(' ') }
}

function RegionShape({ region, className, ...props }: {
    region: (typeof BODY_REGIONS)[number]
    className: string
} & React.SVGProps<SVGPolygonElement & SVGEllipseElement>) {
    const shape = regionPoints(region)
    return shape.kind === 'ellipse'
        ? <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} className={className} {...props} />
        : <polygon points={shape.points} className={className} {...props} />
}

function BodyMap({ states, selected, onPick }: {
    states: Map<string, string>
    selected: string | null
    onPick: (regionId: string) => void
}) {
    const baseFill: Record<string, string> = {
        mus: 'fill-muted-foreground/30',
        art: 'fill-primary/30',
        zona: 'fill-muted-foreground/15',
    }
    return (
        <svg viewBox={`0 0 ${MAP_WIDTH} 372`} className="mx-auto w-full max-w-sm" role="group" aria-label="Mapa del cuerpo">
            <g aria-hidden="true">
                {BODY_REGIONS.map(region => (
                    <RegionShape key={region.id} region={region} className="fill-muted stroke-muted [stroke-linejoin:round] [stroke-width:7]" />
                ))}
            </g>
            <g>
                {BODY_REGIONS.map(region => {
                    const state = states.get(region.id)
                    return (
                        <RegionShape
                            key={region.id}
                            region={region}
                            role="button"
                            tabIndex={0}
                            aria-label={`${region.label}${state === 'active' ? ', lesión activa' : state === 'past' ? ', lesión pasada' : ''}`}
                            aria-pressed={selected === region.id}
                            onClick={() => onPick(region.id)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    onPick(region.id)
                                }
                            }}
                            className={cn(
                                'cursor-pointer stroke-background outline-none transition-colors [stroke-linejoin:round] [stroke-width:1] hover:fill-primary/60 focus-visible:fill-primary/60',
                                state === 'active' ? 'fill-destructive' : state === 'past' ? 'fill-amber-500' : baseFill[region.kind],
                                selected === region.id && 'stroke-primary [stroke-width:2.5]'
                            )}
                        >
                            <title>{region.label}</title>
                        </RegionShape>
                    )
                })}
            </g>
            <text x={BODY_WIDTH / 2} y={368} textAnchor="middle" className="fill-muted-foreground text-[11px]">Frente</text>
            <text x={BODY_WIDTH * 1.5 + 20} y={368} textAnchor="middle" className="fill-muted-foreground text-[11px]">Espalda</text>
            <text x={22} y={14} className="fill-muted-foreground text-[9px]">Dcha</text>
            <text x={BODY_WIDTH - 22} y={14} textAnchor="end" className="fill-muted-foreground text-[9px]">Izda</text>
            <text x={BODY_WIDTH + 42} y={14} className="fill-muted-foreground text-[9px]">Izda</text>
            <text x={MAP_WIDTH - 22} y={14} textAnchor="end" className="fill-muted-foreground text-[9px]">Dcha</text>
        </svg>
    )
}

type InjuryForm = ReturnType<typeof emptyInjuryForm>

/** Lo que hay que tener presente antes de entrenar a este cliente. Solo lo ve quien lleva su entrenamiento. */
export function StudioClientFilePanel({ data, onClose }: { data: StudioGridData; onClose: () => void }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [file, setFile] = useState<StudioClientFile | null>(null)
    const [note, setNote] = useState('')
    const [form, setForm] = useState<InjuryForm | null>(null)
    const clientId = data.client.id

    const load = useMemo(() => async () => {
        const result = await getClientFileAction(clientId)
        if (!result.success) return void toast.error(result.error)
        setFile(result.data)
        setNote(result.data.note?.note ?? '')
    }, [clientId])

    useEffect(() => { void load() }, [load])

    const injuries = useMemo(() => sortInjuries(file?.injuries ?? []) as StudioClientFile['injuries'], [file])
    const states = useMemo(() => regionStates(file?.injuries ?? []), [file])
    const person = (id: string | null | undefined) => (id && data.professionals[id]) || 'alguien del equipo'

    function saveNote() {
        startTransition(async () => {
            const result = await saveRelevantNoteAction(clientId, file?.note?.version ?? null, note)
            await load()
            if (!result.success) return void toast.error(result.error)
            toast.success('Guardado')
        })
    }

    function saveInjury() {
        if (!form) return
        const { fields, error } = injuryFields(form)
        if (error) return void toast.error(error)
        startTransition(async () => {
            const result = await saveInjuryAction(clientId, form.id, form.version, fields!)
            await load()
            if (!result.success) return void toast.error(result.error)
            setForm(null)
            router.refresh()
        })
    }

    function removeInjury(id: string, version: number) {
        startTransition(async () => {
            const result = await deleteInjuryAction(id, version)
            await load()
            if (!result.success) return void toast.error(result.error)
            setForm(null)
            router.refresh()
        })
    }

    const structures = form ? structuresFor(form.region) : []

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">Ficha de {data.client.fullName}</SheetTitle>
                    <SheetDescription>Datos de salud. No salen en informes ni los ve el atleta.</SheetDescription>
                </SheetHeader>

                {!file ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                        <section className="space-y-2" aria-labelledby="ficha-relevante">
                            <Label id="ficha-relevante" htmlFor="ficha-nota">Aspectos relevantes</Label>
                            <Textarea
                                id="ficha-nota"
                                rows={4}
                                maxLength={5000}
                                value={note}
                                placeholder="Medicación, alergias, cirugías, objetivos, miedos, disponibilidad…"
                                onChange={event => setNote(event.target.value)}
                            />
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    {file.note ? `Actualizado por ${person(file.note.updated_by)}, ${timeAgo(file.note.updated_at)}` : 'Sin datos todavía'}
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isPending || note.trim() === (file.note?.note ?? '')}
                                    onClick={saveNote}
                                >
                                    Guardar
                                </Button>
                            </div>
                        </section>

                        <section className="space-y-3" aria-labelledby="ficha-mapa">
                            <h3 id="ficha-mapa" className="text-sm font-semibold">Lesiones</h3>
                            <p className="text-xs text-muted-foreground">Toca una zona para apuntar una lesión.</p>
                            <BodyMap
                                states={states}
                                selected={form?.region ?? null}
                                onPick={region => setForm(emptyInjuryForm(region))}
                            />
                            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Activa</span>
                                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pasada</span>
                            </div>

                            {form && (
                                <div className="space-y-3 rounded-md border p-3">
                                    <p className="text-sm font-semibold">{regionLabel(form.region)}</p>
                                    {structures.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estructura">
                                            {structures.map((structure: string) => (
                                                <button
                                                    key={structure}
                                                    type="button"
                                                    aria-pressed={form.structure === structure}
                                                    onClick={() => setForm({ ...form, structure: form.structure === structure ? '' : structure })}
                                                    className={cn(
                                                        'min-h-8 rounded-full border px-3 text-xs',
                                                        form.structure === structure
                                                            ? 'border-primary bg-primary text-primary-foreground'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {structure}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <Input
                                        value={form.detail}
                                        maxLength={1000}
                                        autoComplete="off"
                                        aria-label="Qué pasó"
                                        placeholder="Qué pasó: grado II, operado, tratamiento…"
                                        onChange={event => setForm({ ...form, detail: event.target.value })}
                                    />
                                    <Input
                                        value={form.occurred}
                                        maxLength={80}
                                        autoComplete="off"
                                        aria-label="Cuándo"
                                        placeholder="Cuándo: 2023, marzo de 2025…"
                                        onChange={event => setForm({ ...form, occurred: event.target.value })}
                                    />
                                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Estado de la lesión">
                                        {[['active', 'Sigue activa'], ['past', 'Pasada']].map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                aria-pressed={form.status === value}
                                                onClick={() => setForm({ ...form, status: value })}
                                                className={cn(
                                                    'h-9 rounded-md border text-sm font-medium',
                                                    form.status === value
                                                        ? 'border-primary bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="button" className="flex-1" disabled={isPending} onClick={saveInjury}>
                                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Guardar lesión
                                        </Button>
                                        <Button type="button" variant="outline" disabled={isPending} onClick={() => setForm(null)}>Cancelar</Button>
                                    </div>
                                </div>
                            )}

                            {injuries.length > 0 && (
                                <ul className="space-y-1.5">
                                    {injuries.map(injury => (
                                        <li key={injury.id} className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-sm">
                                            <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', injury.status === 'active' ? 'bg-destructive' : 'bg-amber-500')} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-medium">
                                                    {regionLabel(injury.region)}{injury.structure ? ` · ${injury.structure}` : ''}
                                                </span>
                                                {injury.detail && <span className="block">{injury.detail}</span>}
                                                <span className="block text-xs text-muted-foreground">
                                                    {[injury.occurred, `${person(injury.updated_by)}, ${timeAgo(injury.updated_at)}`].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Editar ${regionLabel(injury.region)}`} onClick={() => setForm(injuryToForm(injury))}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 shrink-0"
                                                disabled={isPending}
                                                aria-label={`Quitar ${regionLabel(injury.region)}`}
                                                onClick={() => removeInjury(injury.id, injury.version)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

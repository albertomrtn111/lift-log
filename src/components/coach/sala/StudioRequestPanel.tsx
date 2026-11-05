'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { StudioExerciseSearch } from '@/components/coach/sala/StudioExerciseSearch'
import { keepKeyboardClosed } from '@/components/coach/sala/panel-focus'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { StudioGridData, StudioRequest, StudioSession } from '@/data/studio'
import { libraryDefaults } from '@/lib/studio/editor-rules'
import { formatShortDate } from '@/lib/studio/grid-rules'
import { createRequestAction, setRequestStatusAction } from '@/lib/studio/session-actions'

const ANYONE = 'anyone'

/** Encargos de una sesión: dejar uno nuevo, o ver y cerrar los que hay. */
export function StudioRequestPanel({ data, session, onClose }: {
    data: StudioGridData
    session: StudioSession
    onClose: () => void
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const requests = data.requests.filter(request => request.session_id === session.id)
    const [toUser, setToUser] = useState(ANYONE)
    const [title, setTitle] = useState('')
    const [message, setMessage] = useState('')
    const [items, setItems] = useState<{ catalogExerciseId: string; name: string }[]>([])

    const person = (id: string | null) => (id ? data.professionals[id] ?? 'Otro profesional' : 'cualquiera')

    function create() {
        if (!title.trim()) return void toast.error('Ponle un título al encargo.')
        startTransition(async () => {
            const result = await createRequestAction({
                sessionId: session.id,
                toUser: toUser === ANYONE ? null : toUser,
                title,
                message,
                items: items.map(item => ({
                    catalog_exercise_id: item.catalogExerciseId,
                    ...libraryDefaults(data.entries, data.blocks, item.catalogExerciseId),
                })),
            })
            if (!result.success) return void toast.error(result.error)
            router.refresh()
            setTitle('')
            setMessage('')
            setItems([])
            toast.success('Encargo guardado')
        })
    }

    function setStatus(request: StudioRequest, status: 'pending' | 'done') {
        startTransition(async () => {
            const result = await setRequestStatusAction(request.id, status)
            if (!result.success) return void toast.error(result.error)
            router.refresh()
        })
    }

    return (
        <Sheet open onOpenChange={open => { if (!open) onClose() }}>
            <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={keepKeyboardClosed}>
                <SheetHeader className="border-b p-4 pr-10 text-left">
                    <SheetTitle className="text-base">Encargos · {formatShortDate(session.session_date)}</SheetTitle>
                    <SheetDescription>{data.client.fullName}</SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                    {requests.length > 0 && (
                        <ul className="space-y-2">
                            {requests.map(request => (
                                <li key={request.id} className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
                                    <p className="font-semibold">{request.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        De {person(request.from_user)} para {person(request.to_user)}
                                        {request.status === 'done' ? ` · hecho por ${person(request.done_by)}` : ' · pendiente'}
                                    </p>
                                    {request.message && <p className="whitespace-pre-wrap">{request.message}</p>}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => setStatus(request, request.status === 'done' ? 'pending' : 'done')}
                                    >
                                        {request.status === 'done' ? 'Reabrir' : 'Marcar como hecho'}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <section className="space-y-3" aria-labelledby="encargo-nuevo">
                        <h3 id="encargo-nuevo" className="text-sm font-semibold">Dejar un encargo</h3>
                        <div className="space-y-1.5">
                            <Label>Para</Label>
                            <Select value={toUser} onValueChange={setToUser}>
                                <SelectTrigger aria-label="Para quién"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ANYONE}>Cualquiera</SelectItem>
                                    {data.team.map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="encargo-titulo">Título</Label>
                            <Input id="encargo-titulo" value={title} maxLength={120} autoComplete="off" onChange={event => setTitle(event.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="encargo-mensaje">Mensaje</Label>
                            <Textarea id="encargo-mensaje" rows={3} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} />
                        </div>
                        {items.map((item, index) => (
                            <div key={`${item.catalogExerciseId}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
                                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    aria-label={`Quitar ${item.name}`}
                                    onClick={() => setItems(items.filter((_, position) => position !== index))}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        ))}
                        <StudioExerciseSearch
                            id="encargo-buscar"
                            label="Ejercicios para esa sesión (opcional)"
                            entries={data.entries}
                            onPick={entry => setItems([...items, { catalogExerciseId: entry.catalogExerciseId, name: entry.shortName ?? entry.name }])}
                        />
                    </section>
                </div>

                <div className="border-t p-4">
                    <Button type="button" className="w-full" disabled={isPending} onClick={create}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Dejar encargo
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Bell, CalendarDays, Camera, ClipboardList, Sparkles, Watch, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { AvatarPhotoPicker } from '@/components/profile/AvatarPhotoPicker'
import { useClientAppContext } from '@/contexts/ClientAppContext'
import type { AnnouncementIcon, AnnouncementStatus, AnnouncementView } from '@/lib/announcements/announcements.js'
import { getPendingAthleteAnnouncementAction, resolveAnnouncementAction } from './actions'

const ICONS: Record<AnnouncementIcon, LucideIcon> = {
    camera: Camera,
    sparkles: Sparkles,
    watch: Watch,
    bell: Bell,
    clipboard: ClipboardList,
    calendar: CalendarDays,
}

/** Margen para que la pantalla cargue antes de que suba el aviso */
const SHOW_DELAY_MS = 1200
const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

/**
 * Enseña al entrar en la app el primer aviso de novedades pendiente del
 * atleta (catálogo en src/lib/announcements/catalog.js). Si hay otro diálogo
 * abierto (feedback de Strava, notificaciones…), espera a que se cierre.
 */
export function AnnouncementHost() {
    const [announcement, setAnnouncement] = useState<AnnouncementView | null>(null)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        let cancelled = false
        let observer: MutationObserver | null = null
        const tryOpen = () => {
            if (document.querySelector(OPEN_DIALOG_SELECTOR)) return false
            observer?.disconnect()
            setOpen(true)
            return true
        }
        const timer = window.setTimeout(async () => {
            const pending = await getPendingAthleteAnnouncementAction().catch(() => null)
            if (cancelled || !pending) return
            setAnnouncement(pending)
            if (tryOpen()) return
            observer = new MutationObserver(() => { tryOpen() })
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
        }, SHOW_DELAY_MS)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
            observer?.disconnect()
        }
    }, [])

    if (!announcement) return null
    return <AnnouncementSheet announcement={announcement} open={open} onClose={() => setOpen(false)} />
}

export function AnnouncementSheet({ announcement, open, onClose }: {
    announcement: AnnouncementView
    open: boolean
    onClose: () => void
}) {
    const statusRef = useRef<AnnouncementStatus | null>(null)

    const resolve = useCallback((status: AnnouncementStatus) => {
        // Completado gana a descartado: cerrar después de completar no lo rebaja
        if (statusRef.current === 'completed' || statusRef.current === status) return
        statusRef.current = status
        void resolveAnnouncementAction(announcement.id, status)
    }, [announcement.id])

    const close = useCallback(() => {
        resolve('dismissed')
        onClose()
    }, [resolve, onClose])

    const Icon = ICONS[announcement.icon]
    const { action } = announcement

    return (
        <Sheet open={open} onOpenChange={(value) => { if (!value) close() }}>
            <SheetContent
                side="bottom"
                className="mx-auto max-w-lg rounded-t-3xl px-5 pb-[max(1.5rem,calc(var(--safe-area-bottom)+1rem))] pt-7 [&>button:last-child]:top-4"
            >
                {action.type === 'avatar-upload' ? (
                    <AvatarAnnouncementBody
                        announcement={announcement}
                        actionLabel={action.label}
                        onUploaded={() => resolve('completed')}
                        onClose={close}
                    />
                ) : (
                    <div className="flex flex-col">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Icon className="h-6 w-6" />
                        </span>
                        <AnnouncementText announcement={announcement} />
                        <div className="mt-6 flex flex-col gap-2">
                            <Button asChild size="lg" className="h-12 rounded-2xl text-[15px] font-semibold">
                                <Link href={action.href} onClick={() => { resolve('completed'); onClose() }}>
                                    {action.label}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button variant="ghost" className="h-11 rounded-2xl" onClick={close}>
                                {announcement.dismissLabel ?? 'Ahora no'}
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}

function AnnouncementText({ announcement, centered }: { announcement: AnnouncementView; centered?: boolean }) {
    return (
        <div className={centered ? 'text-center' : undefined}>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-primary">{announcement.eyebrow}</p>
            <SheetTitle className="mt-1.5 text-[1.4rem] font-bold leading-tight tracking-tight">{announcement.title}</SheetTitle>
            <SheetDescription className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{announcement.body}</SheetDescription>
        </div>
    )
}

function AvatarAnnouncementBody({ announcement, actionLabel, onUploaded, onClose }: {
    announcement: AnnouncementView
    actionLabel: string
    onUploaded: () => void
    onClose: () => void
}) {
    const { client } = useClientAppContext()
    return (
        <AvatarPhotoPicker name={client?.profile.full_name ?? null} initialUrl={null} onUploaded={onUploaded}>
            {({ choose, uploading, uploaded }) => uploaded ? (
                <div className="text-center">
                    <SheetTitle className="mt-5 text-[1.4rem] font-bold leading-tight tracking-tight">¡Foto lista!</SheetTitle>
                    <SheetDescription className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                        Ya aparece en tu perfil. Puedes cambiarla cuando quieras.
                    </SheetDescription>
                    <Button size="lg" className="mt-6 h-12 w-full rounded-2xl text-[15px] font-semibold" onClick={onClose}>
                        Hecho
                    </Button>
                </div>
            ) : (
                <>
                    <AnnouncementText announcement={announcement} centered />
                    <div className="mt-6 flex flex-col gap-2">
                        <Button size="lg" className="h-12 rounded-2xl text-[15px] font-semibold" onClick={choose} disabled={uploading}>
                            <Camera className="h-4 w-4" />
                            {uploading ? 'Subiendo…' : actionLabel}
                        </Button>
                        <Button variant="ghost" className="h-11 rounded-2xl" onClick={onClose} disabled={uploading}>
                            {announcement.dismissLabel ?? 'Ahora no'}
                        </Button>
                    </div>
                </>
            )}
        </AvatarPhotoPicker>
    )
}

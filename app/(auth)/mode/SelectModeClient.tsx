'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Briefcase, Loader2, User } from 'lucide-react'
import { AuthHeading, AuthShell } from '@/components/auth/AuthShell'
import { APP_MODE_COOKIE, LAST_MODE_COOKIE, type AppMode, getModeRedirectPath } from '@/lib/mode-utils'
import { cn } from '@/lib/utils'

function setCookie(name: string, value: string, days: number = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}

const MODES: Array<{ mode: AppMode; icon: React.ElementType; title: string; text: string; iconClass: string }> = [
    { mode: 'coach', icon: Briefcase, title: 'Entrar como coach', text: 'Gestiona atletas, planes, revisiones y cobros.', iconClass: 'bg-primary/10 text-primary' },
    { mode: 'client', icon: User, title: 'Entrar como atleta', text: 'Tu entrenamiento, tu dieta y tu progreso.', iconClass: 'bg-success/10 text-success' },
]

export function SelectModeClient() {
    const router = useRouter()
    const [pending, setPending] = useState<AppMode | null>(null)

    const handleSelectMode = (mode: AppMode) => {
        setPending(mode)
        // Modo de esta sesión y preferencia para la próxima vez
        setCookie(APP_MODE_COOKIE, mode)
        setCookie(LAST_MODE_COOKIE, mode)
        router.push(getModeRedirectPath(mode))
        router.refresh()
    }

    return (
        <AuthShell>
            <AuthHeading title="¿Cómo quieres entrar?" description="Tu cuenta tiene acceso como coach y como atleta." />

            <div className="space-y-3">
                {MODES.map(({ mode, icon: Icon, title, text, iconClass }) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => handleSelectMode(mode)}
                        disabled={pending !== null}
                        className={cn(
                            'group flex w-full items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md disabled:cursor-default',
                            pending === mode && 'border-primary/50 ring-1 ring-primary/25',
                            pending && pending !== mode && 'opacity-50',
                        )}
                    >
                        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', iconClass)}>
                            <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{title}</span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
                        </span>
                        {pending === mode
                            ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            : <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
                    </button>
                ))}
            </div>

            <p className="mt-6 text-sm text-muted-foreground">Puedes cambiar de modo en cualquier momento desde el menú.</p>
        </AuthShell>
    )
}

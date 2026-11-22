import { redirect } from 'next/navigation'
import { LogOut, Mail, UserRoundX, KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AuthShell, AuthStatus, SUPPORT_EMAIL } from '@/components/auth/AuthShell'
import { getSignupIntent } from '@/lib/onboarding/coach-workspace'
import { getLostLicense, type LicenseContact, type LostLicense } from '@/lib/auth/license'

export default async function NoAccessPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Coach recién registrado: su espacio se crea en la bienvenida
    if (getSignupIntent(user)) {
        redirect('/welcome')
    }

    const lost = await getLostLicense(user.id).catch(error => {
        console.error('[no-access] No se pudo comprobar la baja', error instanceof Error ? error.message : error)
        return null
    })
    if (lost) return <LostLicenseScreen lost={lost} userId={user.id} />

    return (
        <AuthShell>
            <AuthStatus
                icon={UserRoundX}
                tone="muted"
                title="Tu cuenta aún no está activa"
                actions={
                    <>
                        <Button asChild size="lg" className="h-11 rounded-xl text-[15px] font-semibold">
                            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Activar mi cuenta de NexTrain')}&body=${encodeURIComponent(`ID de usuario: ${user.id}`)}`}>
                                Escribir a soporte
                            </a>
                        </Button>
                        <SignOutButton />
                    </>
                }
            >
                <p>
                    Has entrado como <span className="font-semibold text-foreground">{user.email}</span>, pero esta cuenta todavía no tiene acceso de atleta ni de coach.
                </p>
                <ul className="space-y-1.5 text-sm">
                    <li><span className="font-semibold text-foreground">Si eres atleta:</span> tu entrenador tiene que darte de alta con este mismo email.</li>
                    <li><span className="font-semibold text-foreground">Si eres coach:</span> escríbenos y activamos tu cuenta.</li>
                </ul>
                <p className="pt-2 text-xs">ID de usuario: <span className="font-mono">{user.id}</span></p>
            </AuthStatus>
        </AuthShell>
    )
}

function LostLicenseScreen({ lost, userId }: { lost: LostLicense; userId: string }) {
    const workspace = <span className="font-semibold text-foreground">{lost.workspaceName}</span>

    if (lost.kind === 'athlete') {
        const who = lost.contact.name ?? 'tu entrenador'
        return (
            <AuthShell>
                <AuthStatus
                    icon={KeyRound}
                    tone="muted"
                    title="Te has quedado sin licencia"
                    actions={
                        <>
                            <ContactButton contact={lost.contact} label={`Escribir a ${who}`} subject="Mi acceso a NexTrain" />
                            <SignOutButton />
                        </>
                    }
                >
                    <p>
                        {workspace} te ha dado de baja en NexTrain{lost.since ? ` el ${formatDay(lost.since)}` : ''}, así que ya no puedes ver tu plan ni registrar entrenamientos.
                    </p>
                    <p>
                        Tu historial, tus check-ins y tus fotos siguen guardados. Si {who} te vuelve a dar de alta, lo recuperas todo tal cual.
                    </p>
                </AuthStatus>
            </AuthShell>
        )
    }

    if (lost.isOwner || !lost.contact) {
        return (
            <AuthShell>
                <AuthStatus
                    icon={KeyRound}
                    tone="muted"
                    title="Te has quedado sin licencia"
                    actions={
                        <>
                            <ContactButton
                                contact={{ name: 'soporte', email: SUPPORT_EMAIL }}
                                label="Escribir a soporte"
                                subject="Reactivar mi licencia de NexTrain"
                                body={`ID de usuario: ${userId}`}
                            />
                            <SignOutButton />
                        </>
                    }
                >
                    <p>
                        La licencia de NexTrain de {workspace} está dada de baja, así que no puedes entrar en el espacio ni en la app de tus atletas.
                    </p>
                    <p>
                        Tus datos y los de tus atletas siguen guardados. Escríbenos y, en cuanto la reactivemos, lo tendrás todo como lo dejaste.
                    </p>
                </AuthStatus>
            </AuthShell>
        )
    }

    const who = lost.contact.name ?? 'el responsable del espacio'
    return (
        <AuthShell>
            <AuthStatus
                icon={KeyRound}
                tone="muted"
                title="Te has quedado sin licencia"
                actions={
                    <>
                        <ContactButton contact={lost.contact} label={`Escribir a ${who}`} subject="Mi acceso a NexTrain" />
                        <SignOutButton />
                    </>
                }
            >
                <p>
                    Ya no formas parte del equipo de {workspace} en NexTrain, así que no puedes entrar en su espacio ni ver a sus atletas.
                </p>
                <p>
                    Lo que hiciste se queda guardado. Si {who} te vuelve a invitar, recuperas tu acceso y los atletas que llevabas.
                </p>
            </AuthStatus>
        </AuthShell>
    )
}

function ContactButton({ contact, label, subject, body }: { contact: LicenseContact; label: string; subject: string; body?: string }) {
    if (!contact.email) return null
    const query = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`
    return (
        <Button asChild size="lg" className="h-11 gap-2 rounded-xl text-[15px] font-semibold">
            <a href={`mailto:${contact.email}?${query}`}>
                <Mail className="h-4 w-4" />
                {label}
            </a>
        </Button>
    )
}

function SignOutButton() {
    return (
        <form action="/api/auth/signout" method="post">
            <Button variant="ghost" className="h-10 w-full gap-2 rounded-xl" type="submit">
                <LogOut className="h-4 w-4" />
                Cerrar sesión
            </Button>
        </form>
    )
}

function formatDay(day: string) {
    const date = new Date(`${day}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return day
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

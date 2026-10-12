import { redirect } from 'next/navigation'
import { LogOut, UserRoundX } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { AuthShell, AuthStatus, SUPPORT_EMAIL } from '@/components/auth/AuthShell'

export default async function NoAccessPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

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
                        <form action="/api/auth/signout" method="post">
                            <Button variant="ghost" className="h-10 w-full gap-2 rounded-xl" type="submit">
                                <LogOut className="h-4 w-4" />
                                Cerrar sesión
                            </Button>
                        </form>
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

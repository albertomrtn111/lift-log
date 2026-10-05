import Image from 'next/image'
import { redirect } from 'next/navigation'
import { Bot, CalendarDays, CheckCircle2, Dumbbell, ShieldCheck, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

function ErrorCard({ title, message }: { title: string; message: string }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 safe-area-inset-top safe-area-inset-bottom">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription className="break-words">{message}</CardDescription>
                </CardHeader>
            </Card>
        </main>
    )
}

export default async function OAuthConsentPage({
    searchParams,
}: {
    searchParams: { authorization_id?: string }
}) {
    const authorizationId = searchParams.authorization_id?.trim()
    if (!authorizationId) {
        return <ErrorCard title="Solicitud incompleta" message="Falta el identificador de autorización. Vuelve a iniciar la conexión desde tu asistente." />
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
        redirect(`/login?redirect=${encodeURIComponent(next)}`)
    }

    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .in('role', ['owner', 'coach'])
        .limit(1)
        .maybeSingle()

    if (!membership) {
        return <ErrorCard title="Acceso solo para entrenadores" message="Esta conexión permite consultar y gestionar clientes. Inicia sesión con una cuenta de entrenador activa." />
    }

    const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
    if (error || !details) {
        return <ErrorCard title="La autorización ha caducado" message="No hemos podido validar la solicitud. Vuelve a conectar NexTrain desde tu asistente." />
    }

    if (!('authorization_id' in details)) redirect(details.redirect_url)

    const clientName = details.client.name || 'Tu asistente de IA'
    const requestedScopes = details.scope.split(' ').filter(Boolean)
    const clientHost = (() => {
        try {
            return details.client.uri ? new URL(details.client.uri).host : null
        } catch {
            return null
        }
    })()

    return (
        <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-primary/5 px-4 py-8 safe-area-inset-top safe-area-inset-bottom sm:py-12">
            <Card className="w-full max-w-xl overflow-hidden">
                <CardHeader className="space-y-5 border-b border-border/70 bg-muted/20 p-5 sm:p-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                            <Image src="/Logo_nexttrain.png" alt="NexTrain" fill sizes="48px" className="object-cover" priority />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-primary">Conectar con NexTrain</p>
                            <CardTitle className="break-words text-xl leading-tight sm:text-2xl">{clientName} solicita acceso</CardTitle>
                            {clientHost && <p className="mt-1 truncate text-xs text-muted-foreground">{clientHost}</p>}
                        </div>
                    </div>
                    <CardDescription className="text-sm leading-6">
                        Autoriza a este asistente para ayudarte con tus clientes usando tu cuenta. Solo verá los datos permitidos para tu espacio de entrenador.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 p-5 sm:p-7">
                    <div className="space-y-3">
                        <p className="text-sm font-semibold">Podrá ayudarte a:</p>
                        <ul className="grid gap-3 text-sm sm:grid-cols-2">
                            <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
                                <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                <span className="break-words">Consultar clientes y su evolución</span>
                            </li>
                            <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
                                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                <span className="break-words">Revisar calendarios y eventos</span>
                            </li>
                            <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
                                <Dumbbell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                <span className="break-words">Crear entrenamientos de fuerza y cardio</span>
                            </li>
                            <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
                                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                                <span className="break-words">Crear tareas de seguimiento</span>
                            </li>
                        </ul>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-100">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                        <div className="min-w-0 space-y-1">
                            <p className="font-semibold">Tus permisos siguen mandando</p>
                            <p className="break-words leading-5 opacity-90">La conexión no usa una clave general de la base de datos. Cada petición se ejecuta con tu identidad y respeta las reglas de acceso de NexTrain.</p>
                        </div>
                    </div>

                    {requestedScopes.length > 0 && (
                        <details className="rounded-xl border border-border/70 px-4 py-3 text-sm">
                            <summary className="cursor-pointer font-medium">Permisos técnicos solicitados</summary>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {requestedScopes.map((scope) => (
                                    <span key={scope} className="max-w-full break-all rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{scope}</span>
                                ))}
                            </div>
                        </details>
                    )}
                </CardContent>

                <CardFooter className="flex flex-col-reverse gap-3 border-t border-border/70 bg-muted/20 p-5 sm:flex-row sm:justify-end sm:p-7">
                    <form action="/api/oauth/decision" method="POST" className="w-full sm:w-auto">
                        <input type="hidden" name="authorization_id" value={authorizationId} />
                        <Button type="submit" name="decision" value="deny" variant="outline" className="h-11 w-full sm:w-auto">
                            Cancelar
                        </Button>
                    </form>
                    <form action="/api/oauth/decision" method="POST" className="w-full sm:w-auto">
                        <input type="hidden" name="authorization_id" value={authorizationId} />
                        <Button type="submit" name="decision" value="approve" className="h-11 w-full sm:w-auto">
                            <CheckCircle2 className="h-4 w-4" />
                            Autorizar conexión
                        </Button>
                    </form>
                </CardFooter>
            </Card>
        </main>
    )
}

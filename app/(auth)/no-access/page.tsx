import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NoAccessPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>

                <h1 className="text-2xl font-bold mb-2">Cuenta sin asignación</h1>
                <p className="text-muted-foreground mb-8">
                    Tu cuenta ha sido creada correctamente, pero aún no tiene un rol de cliente o coach asignado.
                    <br /><br />
                    Si eres un cliente, por favor espera a que tu coach te dé acceso. Si eres un coach, contacta con soporte para activar tu membresía.
                </p>

                <div className="space-y-3">
                    <form action="/api/auth/signout" method="post">
                        <Button variant="outline" className="w-full gap-2" type="submit">
                            <LogOut className="h-4 w-4" />
                            Cerrar sesión
                        </Button>
                    </form>

                    <p className="text-xs text-muted-foreground">
                        ID de usuario: <span className="font-mono">{user.id}</span>
                    </p>
                </div>
            </Card>
        </div>
    )
}

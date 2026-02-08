import { createClient } from '@/lib/supabase/server'
import { getCoachIdForUser } from '@/lib/auth/get-user-role'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Mail, Calendar, Users, LogOut } from 'lucide-react'
import Link from 'next/link'
import { LogoutButton } from '@/components/coach/LogoutButton'

export default async function CoachProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const coachId = await getCoachIdForUser(user.id)

    // Get coach info
    const { data: coach } = await supabase
        .from('coaches')
        .select('*')
        .eq('id', coachId)
        .single()

    // Get membership info
    const { data: membership } = await supabase
        .from('coach_memberships')
        .select('role, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

    // Get client count
    const { count: clientCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('status', 'active')

    return (
        <div className="min-h-screen pb-20 lg:pb-4">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
                <div className="px-4 lg:px-8 py-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Mi Perfil</h1>
                            <p className="text-sm text-muted-foreground">Configuración de cuenta</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="px-4 lg:px-8 pt-6 space-y-6">
                {/* Profile Card */}
                <Card className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-2xl font-bold text-white">
                            {coach?.business_name?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || 'C'}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-semibold">{coach?.business_name || 'Coach'}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{user.email}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
                                    {membership?.role === 'owner' ? 'Propietario' : 'Coach'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4 text-center">
                        <Users className="h-6 w-6 text-primary mx-auto mb-2" />
                        <span className="text-2xl font-bold">{clientCount || 0}</span>
                        <span className="text-xs text-muted-foreground block">Clientes activos</span>
                    </Card>
                    <Card className="p-4 text-center">
                        <Calendar className="h-6 w-6 text-success mx-auto mb-2" />
                        <span className="text-sm font-medium">
                            {new Date(user.created_at || '').toLocaleDateString('es-ES', {
                                year: 'numeric',
                                month: 'short'
                            })}
                        </span>
                        <span className="text-xs text-muted-foreground block">Miembro desde</span>
                    </Card>
                </div>

                {/* Quick Links */}
                <Card className="divide-y">
                    <Link
                        href="/coach/members"
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <span>Gestionar miembros</span>
                        </div>
                        <span className="text-muted-foreground">→</span>
                    </Link>
                    <Link
                        href="/routine"
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <span>Ver como cliente</span>
                        </div>
                        <span className="text-muted-foreground">→</span>
                    </Link>
                </Card>

                {/* Logout */}
                <Card className="p-4">
                    <LogoutButton />
                </Card>
            </div>
        </div>
    )
}

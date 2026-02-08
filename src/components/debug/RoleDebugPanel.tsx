'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface DebugData {
    authUser: {
        id: string | null
        email: string | null
        error?: string
    }
    profile: {
        data: Record<string, unknown> | null
        error?: { code: string; message: string; details: string }
    }
    memberships: {
        data: Record<string, unknown>[] | null
        error?: { code: string; message: string; details: string }
    }
    clients: {
        data: Record<string, unknown>[] | null
        error?: { code: string; message: string; details: string }
    }
}

/**
 * Debug panel component - only renders in development mode
 * Shows auth user, profiles, coach_memberships, and clients queries
 */
export function RoleDebugPanel() {
    const [data, setData] = useState<DebugData | null>(null)
    const [loading, setLoading] = useState(true)
    const { toast } = useToast()

    useEffect(() => {
        // Only run in development
        if (process.env.NODE_ENV === 'production') {
            setLoading(false)
            return
        }

        async function fetchDebugData() {
            const supabase = createClient()
            const debugData: DebugData = {
                authUser: { id: null, email: null },
                profile: { data: null },
                memberships: { data: null },
                clients: { data: null },
            }

            try {
                // 1. Get auth user
                const { data: { user }, error: authError } = await supabase.auth.getUser()
                if (authError) {
                    debugData.authUser.error = authError.message
                    console.error('[RoleDebug] auth.getUser error:', authError)
                } else if (user) {
                    debugData.authUser.id = user.id
                    debugData.authUser.email = user.email || null
                }

                const userId = debugData.authUser.id
                if (!userId) {
                    setData(debugData)
                    setLoading(false)
                    return
                }

                // 2. Query profiles
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id, email, full_name')
                    .eq('id', userId)
                    .maybeSingle()

                if (profileError) {
                    debugData.profile.error = {
                        code: profileError.code,
                        message: profileError.message,
                        details: profileError.details || '',
                    }
                } else {
                    debugData.profile.data = profile
                }

                // 3. Query coach_memberships
                const { data: memberships, error: memberError } = await supabase
                    .from('coach_memberships')
                    .select('id, coach_id, user_id, role, status')
                    .eq('user_id', userId)

                if (memberError) {
                    debugData.memberships.error = {
                        code: memberError.code,
                        message: memberError.message,
                        details: memberError.details || '',
                    }
                } else {
                    debugData.memberships.data = memberships
                }

                // 4. Query clients (production-like)
                const { data: clients, error: clientErr } = await supabase
                    .from('clients')
                    .select('id, coach_id, user_id, status, full_name')
                    .eq('user_id', userId)

                if (clientErr) {
                    debugData.clients.error = {
                        code: clientErr.code,
                        message: clientErr.message,
                        details: clientErr.details || '',
                    }
                } else {
                    debugData.clients.data = clients
                }

            } catch (e) {
                console.error('[RoleDebug] Unexpected error:', e)
            } finally {
                setData(debugData)
                setLoading(false)
            }
        }

        fetchDebugData()
    }, [toast])

    // Don't render in production
    if (process.env.NODE_ENV === 'production') {
        return null
    }

    if (loading) {
        return (
            <Card className="p-4 mt-4 bg-yellow-500/10 border-yellow-500/50">
                <p className="text-sm font-mono">🔍 Loading debug data...</p>
            </Card>
        )
    }

    if (!data) {
        return null
    }

    return (
        <Card className="p-4 mt-4 bg-yellow-500/10 border-yellow-500/50">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                🔧 Debug Panel (Dev Only)
            </h3>

            <div className="space-y-4 text-xs font-mono">
                {/* Auth User */}
                <div>
                    <p className="font-semibold text-yellow-600 mb-1">auth.getUser()</p>
                    {data.authUser.error ? (
                        <Badge variant="destructive">{data.authUser.error}</Badge>
                    ) : (
                        <div className="bg-background p-2 rounded border">
                            <p><span className="text-muted-foreground">id:</span> {data.authUser.id}</p>
                            <p><span className="text-muted-foreground">email:</span> {data.authUser.email}</p>
                        </div>
                    )}
                </div>

                {/* Profiles */}
                <div>
                    <p className="font-semibold text-yellow-600 mb-1">profiles</p>
                    {data.profile.error ? (
                        <div className="text-destructive">
                            <p>Code: {data.profile.error.code}</p>
                            <p>Message: {data.profile.error.message}</p>
                            <p>Details: {data.profile.error.details}</p>
                        </div>
                    ) : data.profile.data ? (
                        <pre className="bg-background p-2 rounded border overflow-x-auto">
                            {JSON.stringify(data.profile.data, null, 2)}
                        </pre>
                    ) : (
                        <Badge variant="outline">No profile found</Badge>
                    )}
                </div>

                {/* Coach Memberships */}
                <div>
                    <p className="font-semibold text-yellow-600 mb-1">
                        coach_memberships
                        <span className="text-muted-foreground ml-2">
                            (count: {data.memberships.data?.length ?? 'N/A'})
                        </span>
                    </p>
                    {data.memberships.error ? (
                        <div className="text-destructive">
                            <p>Code: {data.memberships.error.code}</p>
                            <p>Message: {data.memberships.error.message}</p>
                            <p>Details: {data.memberships.error.details}</p>
                        </div>
                    ) : data.memberships.data && data.memberships.data.length > 0 ? (
                        <pre className="bg-background p-2 rounded border overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(data.memberships.data, null, 2)}
                        </pre>
                    ) : (
                        <Badge variant="outline">No memberships found</Badge>
                    )}
                </div>

                {/* Clients */}
                <div>
                    <p className="font-semibold text-yellow-600 mb-1">
                        clients
                        <span className="text-muted-foreground ml-2">
                            (count: {data.clients.data?.length ?? 'N/A'})
                        </span>
                    </p>
                    {data.clients.error ? (
                        <div className="text-destructive">
                            <p>Code: {data.clients.error.code}</p>
                            <p>Message: {data.clients.error.message}</p>
                            <p>Details: {data.clients.error.details}</p>
                        </div>
                    ) : data.clients.data && data.clients.data.length > 0 ? (
                        <pre className="bg-background p-2 rounded border overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(data.clients.data, null, 2)}
                        </pre>
                    ) : (
                        <Badge variant="outline">No client records found</Badge>
                    )}
                </div>

                {/* Role Resolution Logic */}
                <div className="border-t pt-3 mt-3">
                    <p className="font-semibold text-yellow-600 mb-1">Resolution Logic</p>
                    <div className="bg-background p-2 rounded border">
                        {(() => {
                            const activeMemberships = data.memberships.data?.filter(
                                m => m.status === 'active' && (m.role === 'owner' || m.role === 'coach')
                            ) || []
                            const activeClients = data.clients.data?.filter(
                                c => c.status === 'active'
                            ) || []

                            const isCoach = activeMemberships.length > 0
                            const isClient = activeClients.length > 0

                            let resolvedRole = 'none'
                            if (isCoach && isClient) resolvedRole = 'both'
                            else if (isCoach) resolvedRole = 'coach'
                            else if (isClient) resolvedRole = 'client'

                            return (
                                <>
                                    <p><span className="text-muted-foreground mr-2 font-medium">Auth User ID:</span> <code className="bg-muted px-1 rounded text-[10px]">{data.authUser.id}</code></p>
                                    <p><span className="text-muted-foreground mr-2 font-medium">Active memberships:</span> {activeMemberships.length}</p>
                                    <p><span className="text-muted-foreground mr-2 font-medium">Active clients:</span> {activeClients.length}</p>

                                    {activeClients.map(c => (
                                        <div key={c.id as string} className="mt-1 pl-2 border-l-2 border-primary/20">
                                            <p><span className="text-muted-foreground mr-1">Client ID:</span> <code className="text-[10px]">{c.id as string}</code></p>
                                            <p><span className="text-muted-foreground mr-1">User ID:</span> <code className="text-[10px]">{c.user_id as string}</code></p>
                                            <p><span className="text-muted-foreground mr-1">Name:</span> {c.full_name as string}</p>
                                        </div>
                                    ))}

                                    <p className="mt-3 pt-2 border-t border-muted/50 font-bold">
                                        <span className="text-muted-foreground">Resolved role:</span>{' '}
                                        <Badge variant={resolvedRole === 'none' ? 'destructive' : 'default'}>
                                            {resolvedRole}
                                        </Badge>
                                    </p>

                                    {resolvedRole === 'none' && activeMemberships.length === 0 && data.memberships.data && data.memberships.data.length > 0 && (
                                        <p className="text-warning mt-1 italic">
                                            ⚠️ Found {data.memberships.data.length} membership(s) but none are active owners/coaches.
                                        </p>
                                    )}

                                    {activeClients.length === 0 && data.clients.data && data.clients.data.length > 0 && (
                                        <p className="text-warning mt-1 italic">
                                            ⚠️ Found {data.clients.data.length} client record(s) but none are status='active'.
                                        </p>
                                    )}

                                    <div className="mt-4 pt-3 border-t border-muted/50">
                                        <p className="font-semibold text-primary mb-2 italic">Identity Fallback Resolution:</p>
                                        {(() => {
                                            const profileData = data.profile.data as any
                                            const clientData = activeClients[0] as any
                                            const authEmail = data.authUser.email

                                            const email = profileData?.email || authEmail || 'Sin email'
                                            const name = profileData?.full_name || clientData?.full_name || (authEmail ? authEmail.split('@')[0] : 'Usuario')

                                            return (
                                                <div className="bg-muted/30 p-2 rounded text-[11px] space-y-1">
                                                    <p>
                                                        <span className="font-medium">Final Name:</span>
                                                        <span className={!profileData?.full_name && clientData?.full_name ? "text-blue-500 ml-2" : "ml-2"}>
                                                            {name}
                                                            {!profileData?.full_name && clientData?.full_name && " (from client table)"}
                                                            {!profileData?.full_name && !clientData?.full_name && " (derived from email)"}
                                                        </span>
                                                    </p>
                                                    <p>
                                                        <span className="font-medium">Final Email:</span>
                                                        <span className={!profileData?.email && authEmail ? "text-blue-500 ml-2" : "ml-2"}>
                                                            {email}
                                                            {!profileData?.email && authEmail && " (from auth.users)"}
                                                        </span>
                                                    </p>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                </>
                            )
                        })()}
                    </div>
                </div>
            </div>
        </Card>
    )
}

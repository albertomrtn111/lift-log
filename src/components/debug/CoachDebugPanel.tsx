'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatSupabaseErrorVerbose, isRlsError } from '@/lib/supabase/helpers'
import { Loader2, CheckCircle, XCircle, Bug } from 'lucide-react'

interface CoachDebugPanelProps {
    coachId: string
    clientId: string | null
}

interface DebugData {
    authUser: { id: string | null; email: string | null; error?: string }
    memberships: {
        data: Array<{
            id: string
            coach_id: string
            user_id: string
            role: string
            status: string
        }> | null
        error?: { code: string; message: string; details: string }
    }
    resolvedCoachId: string
    selectedClientId: string | null
}

/**
 * Debug panel for Coach Workspace - only renders in development mode.
 * Shows auth user, coach memberships, and provides RLS permission testing.
 */
export function CoachDebugPanel({ coachId, clientId }: CoachDebugPanelProps) {
    const [data, setData] = useState<DebugData | null>(null)
    const [loading, setLoading] = useState(true)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
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
                memberships: { data: null },
                resolvedCoachId: coachId,
                selectedClientId: clientId,
            }

            // 1. Get auth user
            try {
                const { data: { user }, error } = await supabase.auth.getUser()
                if (error) {
                    debugData.authUser.error = error.message
                } else if (user) {
                    debugData.authUser.id = user.id
                    debugData.authUser.email = user.email || null
                }
            } catch (e) {
                debugData.authUser.error = String(e)
            }

            const userId = debugData.authUser.id
            if (userId) {
                // 2. Query coach_memberships (ALL rows for this user)
                try {
                    const { data: memberships, error } = await supabase
                        .from('coach_memberships')
                        .select('id, coach_id, user_id, role, status')
                        .eq('user_id', userId)

                    if (error) {
                        debugData.memberships.error = {
                            code: error.code,
                            message: error.message,
                            details: error.details || '',
                        }
                        console.error('[CoachDebug] coach_memberships error:', error)
                    } else {
                        debugData.memberships.data = memberships
                    }
                } catch (e) {
                    console.error('[CoachDebug] coach_memberships exception:', e)
                }
            }

            setData(debugData)
            setLoading(false)
        }

        fetchDebugData()
    }, [coachId, clientId, toast])

    const testDietPermissions = async () => {
        if (!clientId) {
            setTestResult({ success: false, message: 'No client selected' })
            return
        }

        setTesting(true)
        setTestResult(null)

        const supabase = createClient()

        try {
            // Test INSERT on diet_plans
            const testPayload = {
                coach_id: coachId,
                client_id: clientId,
                name: '__debug_test_plan__',
                type: 'options' as const,
                status: 'draft' as const,
                effective_from: new Date().toISOString().split('T')[0],
            }

            console.log('[CoachDebug] Testing diet_plans insert with payload:', testPayload)

            const { data: plan, error: insertError } = await supabase
                .from('diet_plans')
                .insert(testPayload)
                .select()
                .single()

            if (insertError) {
                const verbose = formatSupabaseErrorVerbose(insertError, { table: 'diet_plans', operation: 'INSERT' })
                console.error('[CoachDebug] diet_plans INSERT failed:', insertError)

                const isRls = isRlsError(insertError)

                toast({
                    title: `diet_plans INSERT ${isRls ? '(RLS)' : 'ERROR'}`,
                    description: verbose,
                    variant: 'destructive',
                })

                setTestResult({
                    success: false,
                    message: isRls
                        ? `Bloqueado por permisos (RLS). Revisa coach_id/client_id/role.\n\n${verbose}`
                        : verbose,
                })
            } else {
                console.log('[CoachDebug] diet_plans INSERT success, id:', plan.id)

                // Clean up - delete test plan
                const { error: deleteError } = await supabase
                    .from('diet_plans')
                    .delete()
                    .eq('id', plan.id)

                if (deleteError) {
                    console.warn('[CoachDebug] Cleanup delete failed:', deleteError)
                }

                toast({
                    title: '✅ Permisos OK',
                    description: 'diet_plans INSERT + DELETE funcionó correctamente.',
                })

                setTestResult({
                    success: true,
                    message: 'OK: diet_plans INSERT + DELETE funcionó correctamente.',
                })
            }
        } catch (e) {
            console.error('[CoachDebug] Test exception:', e)
            setTestResult({
                success: false,
                message: `Exception: ${String(e)}`,
            })
        } finally {
            setTesting(false)
        }
    }

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

    const activeMemberships = data.memberships.data?.filter(
        m => m.status === 'active' && (m.role === 'owner' || m.role === 'coach')
    ) || []

    return (
        <Card className="p-4 bg-yellow-500/10 border-yellow-500/50">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Coach Debug Panel (Dev Only)
            </h3>

            <div className="space-y-3 text-xs font-mono">
                {/* Auth User */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <p className="text-muted-foreground">auth.uid:</p>
                        <p className="font-semibold truncate">{data.authUser.id || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">email:</p>
                        <p className="font-semibold truncate">{data.authUser.email || 'N/A'}</p>
                    </div>
                </div>

                {/* Memberships */}
                <div>
                    <p className="text-muted-foreground">
                        coach_memberships (active owner/coach):
                        <Badge variant={activeMemberships.length > 0 ? 'default' : 'destructive'} className="ml-2">
                            {activeMemberships.length}
                        </Badge>
                    </p>
                    {data.memberships.error && (
                        <p className="text-destructive mt-1">
                            {data.memberships.error.code}: {data.memberships.error.message}
                        </p>
                    )}
                    {activeMemberships.length > 0 && (
                        <div className="mt-1 bg-background p-2 rounded border text-xs max-h-20 overflow-auto">
                            {activeMemberships.map(m => (
                                <div key={m.id}>
                                    coach_id: {m.coach_id} | role: {m.role}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Resolved IDs */}
                <div className="grid grid-cols-2 gap-2 border-t pt-2">
                    <div>
                        <p className="text-muted-foreground">Resolved coach_id:</p>
                        <p className={data.resolvedCoachId ? 'text-success' : 'text-destructive'}>
                            {data.resolvedCoachId || 'NULL ⚠️'}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Selected client_id:</p>
                        <p className={data.selectedClientId ? 'text-success' : 'text-warning'}>
                            {data.selectedClientId || 'None selected'}
                        </p>
                    </div>
                </div>

                {/* Test Button */}
                <div className="border-t pt-3 mt-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={testDietPermissions}
                        disabled={testing || !clientId}
                        className="w-full gap-2"
                    >
                        {testing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Bug className="h-4 w-4" />
                        )}
                        Test Diet Permissions
                    </Button>

                    {testResult && (
                        <div className={`mt-2 p-2 rounded border text-xs ${testResult.success ? 'bg-success/10 border-success' : 'bg-destructive/10 border-destructive'}`}>
                            <div className="flex items-center gap-1 mb-1">
                                {testResult.success ? (
                                    <CheckCircle className="h-3 w-3 text-success" />
                                ) : (
                                    <XCircle className="h-3 w-3 text-destructive" />
                                )}
                                <span className="font-semibold">{testResult.success ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <pre className="whitespace-pre-wrap">{testResult.message}</pre>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

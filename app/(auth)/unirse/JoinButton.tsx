'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { acceptInvitationAction } from './actions'

export function JoinButton({ invitationId }: { invitationId: string }) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    return (
        <div className="space-y-3">
            <Button
                className="w-full"
                disabled={pending}
                onClick={() => startTransition(async () => {
                    const result = await acceptInvitationAction(invitationId)
                    if (result.success) {
                        router.replace(result.redirectTo)
                        router.refresh()
                    } else {
                        setError(result.error)
                    }
                })}
            >
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unirme al equipo
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    )
}

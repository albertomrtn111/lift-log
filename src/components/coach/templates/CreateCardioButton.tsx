'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { createDraftCardioTemplate } from '../../../../app/(coach)/coach/templates/actions'

export function CreateCardioButton() {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    const handleCreateClick = () => {
        startTransition(async () => {
            const result = await createDraftCardioTemplate()

            if (result.success && result.id) {
                toast({
                    title: 'Creando sesión...',
                    description: 'Redirigiendo al editor.',
                    duration: 2000,
                })
                router.push(`/coach/templates/${result.id}`)
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'No se pudo crear la sesión.',
                    variant: 'destructive',
                })
            }
        })
    }

    return (
        <Button onClick={handleCreateClick} disabled={isPending}>
            {isPending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                </>
            ) : (
                <>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva Sesión Cardio
                </>
            )}
        </Button>
    )
}

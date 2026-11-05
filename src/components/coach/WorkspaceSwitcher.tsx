'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Workspace } from '@/lib/auth/active-coach'
import { switchWorkspaceAction } from '@/lib/auth/workspace-actions'

/** Selector de espacio. Solo aparece para quien pertenece a más de uno. */
export function WorkspaceSwitcher({ workspaces }: { workspaces: Workspace[] }) {
    const [switching, setSwitching] = useState(false)
    if (workspaces.length < 2) return null

    const active = workspaces.find(workspace => workspace.is_active) ?? workspaces[0]

    async function change(coachId: string) {
        if (coachId === active.coach_id) return
        setSwitching(true)
        const result = await switchWorkspaceAction(coachId)
        if (result.success) {
            // Recarga completa: nada de lo que hay en memoria es del espacio nuevo.
            window.location.assign('/coach/dashboard')
        } else {
            toast.error(result.error ?? 'No se pudo cambiar de espacio.')
            setSwitching(false)
        }
    }

    return (
        <Select value={active.coach_id} onValueChange={change} disabled={switching}>
            <SelectTrigger className="h-9 w-full" aria-label="Cambiar de espacio">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {workspaces.map(workspace => (
                    <SelectItem key={workspace.coach_id} value={workspace.coach_id}>
                        {workspace.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

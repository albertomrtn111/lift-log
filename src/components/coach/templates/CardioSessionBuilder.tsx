'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'

import { useToast } from '@/hooks/use-toast'
import { updateTemplate } from '../../../../app/(coach)/coach/templates/actions'
import { TrainingTemplate, CardioStructure, CardioBlock } from '@/types/templates'
import { CardioSessionForm } from '@/components/coach/workspace/CardioSessionForm'

// ---------------------------------------------------------------------------
// Legacy helper: convert old blocks[] JSON → readable text for "Detalles"
// ---------------------------------------------------------------------------
function blocksToText(blocks: CardioBlock[]): string {
    if (!blocks || blocks.length === 0) return ''

    return blocks.map((block, i) => {
        const parts: string[] = []
        const prefix = `Bloque ${i + 1}`

        if (block.type === 'continuous') {
            const details: string[] = []
            if (block.distance) details.push(`${block.distance}km`)
            if (block.duration) details.push(`${block.duration} min`)
            const pacing = block.targetPace || block.intensity
            if (pacing) details.push(`@ ${pacing}`)
            if (block.targetHR) details.push(`[${block.targetHR}]`)
            parts.push(`${prefix} – Continuo: ${details.join(' – ') || 'Sin detalles'}`)
        } else if (block.type === 'intervals') {
            const details: string[] = []
            const sets = block.sets || '?'
            const dist = block.workDistance ? `${block.workDistance}km` : ''
            const dur = block.workDuration ? `${block.workDuration}min` : ''
            const effort = dist || dur || '?'
            details.push(`${sets}x${effort}`)
            const pacing = block.workTargetPace || block.workIntensity
            if (pacing) details.push(`@ ${pacing}`)
            if (block.workTargetHR) details.push(`[${block.workTargetHR}]`)
            if (block.restDuration) {
                const restKind = block.restType === 'active' ? 'activo' : 'pasivo'
                details.push(`– Recu: ${block.restDuration}' ${restKind}`)
            }
            parts.push(`${prefix} – Series: ${details.join(' ')}`)
        } else if (block.type === 'station') {
            const details: string[] = []
            if (block.duration) details.push(`${block.duration} min`)
            if (block.notes) details.push(block.notes)
            parts.push(`${prefix} – Estación: ${details.join(' – ') || 'Sin detalles'}`)
        } else {
            parts.push(`${prefix}: ${block.notes || 'Sin detalles'}`)
        }

        // Append block-level notes if not already used
        if (block.notes && block.type !== 'station') {
            parts.push(`  Notas: ${block.notes}`)
        }

        return parts.join('\n')
    }).join('\n')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface CardioSessionBuilderProps {
    template: TrainingTemplate
}

export function CardioSessionBuilder({ template }: CardioSessionBuilderProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()

    // Parse existing structure
    const structure = (template.structure as CardioStructure) || {}
    const legacyBlocks = structure.blocks || []
    const hasLegacyBlocks = legacyBlocks.length > 0 && !structure.description

    // Build initial data for the simple form
    const initialDescription = structure.description
        || (hasLegacyBlocks ? blocksToText(legacyBlocks) : '')

    const initialData = {
        name: template.name,
        description: template.description || initialDescription,
        structure: {
            trainingType: structure.trainingType || 'rodaje',
            notes: structure.notes || '',
            blocks: [] as CardioBlock[],
        } as CardioStructure,
    }

    // Handle submit - save via updateTemplate
    const handleSubmit = async (data: { name: string; description?: string; structure: CardioStructure }) => {
        startTransition(async () => {
            const result = await updateTemplate(template.id, {
                name: data.name,
                description: data.description || null,
                structure: {
                    trainingType: data.structure.trainingType,
                    description: data.description,
                    notes: data.structure.notes,
                    blocks: [], // Always empty in simple mode
                },
            })

            if (result.success) {
                toast({
                    title: 'Plantilla guardada',
                    description: 'Los cambios se han guardado correctamente.',
                    className: 'bg-green-500 text-white border-none',
                })
                router.refresh()
            } else {
                toast({
                    title: 'Error',
                    description: result.error || 'No se pudo guardar la plantilla.',
                    variant: 'destructive',
                })
            }
        })
    }

    return (
        <div className="max-w-2xl mx-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight">Diseño de Sesión</h2>
                <p className="text-muted-foreground">
                    Configura el tipo y detalla el entrenamiento.
                </p>
                {hasLegacyBlocks && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                        ⚠️ Esta plantilla tenía un diseño por bloques. Se ha convertido a texto.
                        Al guardar se usará el formato simple.
                    </p>
                )}
            </div>

            <CardioSessionForm
                initialData={initialData}
                onSubmit={handleSubmit}
                isSubmitting={isPending}
            />
        </div>
    )
}

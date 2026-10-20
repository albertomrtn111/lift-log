'use client'

import { useState } from 'react'
import { ChevronsUpDown, Dumbbell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExerciseLibraryDialog } from '@/components/training/ExerciseLibraryDialog'
import type { CatalogExercise } from '@/lib/training/exercise-catalog'
import { cn } from '@/lib/utils'

interface ExerciseCatalogPickerProps {
    exercises: CatalogExercise[]
    value?: string | null
    legacyName?: string | null
    onSelect: (exercise: CatalogExercise) => void | Promise<void>
    loading?: boolean
    error?: string | null
    disabled?: boolean
    className?: string
    placeholder?: string
}

export function ExerciseCatalogPicker({
    exercises,
    value,
    legacyName,
    onSelect,
    loading,
    error,
    disabled,
    className,
    placeholder,
}: ExerciseCatalogPickerProps) {
    const [open, setOpen] = useState(false)
    const selected = exercises.find(exercise => exercise.id === value)

    return (
        <>
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => setOpen(true)}
                className={cn(
                    'min-h-9 w-full min-w-0 justify-between gap-2 text-left font-semibold',
                    !selected && legacyName && 'border-amber-500/50 text-amber-700 dark:text-amber-400',
                    className
                )}
            >
                <span className="flex min-w-0 items-center gap-2">
                    <Dumbbell className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">
                        {selected?.name ?? (legacyName ? `Vincular: ${legacyName}` : placeholder ?? 'Elegir de la biblioteca')}
                    </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
            <ExerciseLibraryDialog
                open={open}
                onOpenChange={setOpen}
                exercises={exercises}
                onSelect={onSelect}
                value={value}
                legacyName={legacyName}
                loading={loading}
                error={error}
            />
        </>
    )
}

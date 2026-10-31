'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
    value: string
    label: string
    hint?: string
}

/** Selector de varios valores con buscador. Vacío = todos */
export function MultiSelect({ options, value, onChange, placeholder, emptyLabel = 'Todos', className, ariaLabel }: {
    options: MultiSelectOption[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder: string
    emptyLabel?: string
    className?: string
    ariaLabel?: string
}) {
    const [open, setOpen] = useState(false)
    const selected = options.filter(option => value.includes(option.value))
    const summary = selected.length === 0
        ? emptyLabel
        : selected.length <= 2 ? selected.map(option => option.label).join(', ') : `${selected.length} seleccionados`

    const toggle = (optionValue: string) => onChange(value.includes(optionValue) ? value.filter(item => item !== optionValue) : [...value, optionValue])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={ariaLabel}
                    className={cn(
                        'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm',
                        className
                    )}
                >
                    <span className={cn('min-w-0 flex-1 truncate', selected.length === 0 && 'text-muted-foreground')}>{summary}</span>
                    {selected.length > 0 ? (
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="Quitar selección"
                            onClick={event => { event.stopPropagation(); onChange([]) }}
                            onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); onChange([]) } }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </span>
                    ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[240px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                            {options.map(option => {
                                const isSelected = value.includes(option.value)
                                return (
                                    <CommandItem key={option.value} value={`${option.label} ${option.hint ?? ''} ${option.value}`} onSelect={() => toggle(option.value)}>
                                        <span className={cn('mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border', isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                                            {isSelected && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {option.hint && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

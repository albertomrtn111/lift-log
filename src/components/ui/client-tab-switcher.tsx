'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/*
 * Subnavegación de la app del atleta: un control segmentado (pocas opciones
 * que caben a lo ancho) y una fila de chips desplazable (muchas opciones o de
 * ancho variable). Los dos comparten aspecto: pista suave, indicador que se
 * desliza hasta la opción activa y zona táctil de 44px.
 */

// ---------------------------------------------------------------------------
// Enlace con el deslizamiento del contenido
// ---------------------------------------------------------------------------

type SwipeListener = (position: number | null) => void

/**
 * Canal entre <SwipeTabPanels> y <ClientTabSwitcher>: mientras el dedo arrastra
 * el contenido, el panel publica la posición fraccional (1.4 = entre la 2.ª y
 * la 3.ª pestaña) y el indicador la sigue sin re-renderizar la página. `null`
 * devuelve el indicador a la pestaña activa.
 */
export interface TabSwipeLink {
    set: (position: number | null) => void
    subscribe: (listener: SwipeListener) => () => void
}

export function useTabSwipeLink(): TabSwipeLink {
    const [link] = useState<TabSwipeLink>(() => {
        const listeners = new Set<SwipeListener>()
        return {
            set: position => listeners.forEach(listener => listener(position)),
            subscribe: listener => {
                listeners.add(listener)
                return () => { listeners.delete(listener) }
            },
        }
    })
    return link
}

// useLayoutEffect avisa en el servidor; en el cliente evita un frame con el
// indicador mal colocado.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

// ---------------------------------------------------------------------------
// Control segmentado
// ---------------------------------------------------------------------------

interface ClientTabOption<T extends string> {
    value: T
    label: string
}

interface ClientTabSwitcherProps<T extends string> {
    value: T
    options: ClientTabOption<T>[]
    onValueChange: (value: T) => void
    className?: string
    /** `fill` ocupa todo el ancho; `content` se ajusta a la opción más larga */
    fit?: 'fill' | 'content'
    'aria-label'?: string
    /** Conecta el indicador con el deslizamiento del contenido */
    swipeLink?: TabSwipeLink
    /** id base para enlazar cada pestaña con su panel (aria-controls) */
    idBase?: string
}

/** Selector segmentado tipo píldora con indicador deslizante */
export function ClientTabSwitcher<T extends string>({
    value,
    options,
    onValueChange,
    className,
    fit = 'fill',
    'aria-label': ariaLabel,
    swipeLink,
    idBase,
}: ClientTabSwitcherProps<T>) {
    const rootRef = useRef<HTMLDivElement>(null)
    const activeIndex = Math.max(0, options.findIndex(option => option.value === value))
    // El panel suelta el arrastre (set(null)) justo al confirmar la nueva
    // pestaña, antes de que este efecto se vuelva a suscribir: se lee por ref
    const activeIndexRef = useRef(activeIndex)
    activeIndexRef.current = activeIndex

    useIsomorphicLayoutEffect(() => {
        const root = rootRef.current
        if (!root) return
        root.style.setProperty('--segment-index', String(activeIndex))
        // Sin transición en el primer pintado: el indicador ya nace en su sitio
        requestAnimationFrame(() => { root.dataset.ready = 'true' })
    }, [activeIndex])

    useEffect(() => {
        if (!swipeLink) return
        return swipeLink.subscribe(position => {
            const root = rootRef.current
            if (!root) return
            if (position === null) {
                delete root.dataset.dragging
                root.style.setProperty('--segment-index', String(activeIndexRef.current))
            } else {
                root.dataset.dragging = 'true'
                const clamped = Math.min(Math.max(position, 0), options.length - 1)
                root.style.setProperty('--segment-index', String(clamped))
            }
        })
    }, [swipeLink, options.length])

    return (
        <div
            ref={rootRef}
            role="tablist"
            aria-label={ariaLabel}
            className={cn(
                'client-segmented',
                fit === 'fill' ? 'grid w-full' : 'inline-grid auto-cols-fr grid-flow-col',
                className
            )}
            style={fit === 'fill' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
        >
            <span
                aria-hidden
                className="client-segmented-indicator"
                style={{ width: `calc((100% - 0.5rem) / ${options.length})` }}
            />
            {options.map((option, index) => {
                const isActive = index === activeIndex
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="tab"
                        id={idBase ? `${idBase}-tab-${option.value}` : undefined}
                        aria-controls={idBase ? `${idBase}-panel-${option.value}` : undefined}
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => onValueChange(option.value)}
                        onKeyDown={event => handleArrowKeys(event, index, options, onValueChange)}
                        className={cn('client-segment', isActive && 'client-segment-active')}
                    >
                        <span className="truncate">{option.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Chips desplazables
// ---------------------------------------------------------------------------

export interface ClientChipOption<T extends string> {
    value: T
    label: string
    /** Texto pequeño antes de la etiqueta (p. ej. «LUN») */
    prefix?: string
    /** Texto secundario tras la etiqueta (p. ej. «520 kcal») */
    detail?: string
    icon?: React.ElementType
    /** Contador a la derecha */
    count?: number
    /** Color del indicador cuando esta opción está activa (por defecto, el primario) */
    tone?: string
    /** Color del texto sobre `tone` (por defecto, blanco) */
    toneText?: string
    /** Nombre accesible si la etiqueta visible no basta */
    ariaLabel?: string
}

interface ClientChipTabsProps<T extends string> {
    value: T
    options: ClientChipOption<T>[]
    onValueChange: (value: T) => void
    className?: string
    /** Clases de la fila interna (p. ej. el padding lateral cuando la fila sangra) */
    listClassName?: string
    'aria-label'?: string
}

/** Fila de chips con desplazamiento horizontal e indicador que viaja entre ellos */
export function ClientChipTabs<T extends string>({
    value,
    options,
    onValueChange,
    className,
    listClassName,
    'aria-label': ariaLabel,
}: ClientChipTabsProps<T>) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const indicatorRef = useRef<HTMLSpanElement>(null)
    const hasPositioned = useRef(false)
    const activeIndex = Math.max(0, options.findIndex(option => option.value === value))
    const activeTone = options[activeIndex]?.tone

    useIsomorphicLayoutEffect(() => {
        const list = listRef.current
        const indicator = indicatorRef.current
        const scroller = scrollerRef.current
        if (!list || !indicator || !scroller) return

        const place = () => {
            const button = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[activeIndex]
            if (!button) return
            indicator.style.width = `${button.offsetWidth}px`
            indicator.style.transform = `translateX(${button.offsetLeft}px)`
        }

        place()
        const button = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')[activeIndex]
        if (button) {
            const target = button.offsetLeft - (scroller.clientWidth - button.offsetWidth) / 2
            const smooth = hasPositioned.current && !prefersReducedMotion()
            scroller.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' })
        }
        if (!hasPositioned.current) {
            hasPositioned.current = true
            requestAnimationFrame(() => { list.dataset.ready = 'true' })
        }

        const observer = new ResizeObserver(place)
        observer.observe(list)
        return () => observer.disconnect()
    }, [activeIndex, options.length])

    return (
        <div ref={scrollerRef} className={cn('overflow-x-auto overscroll-x-contain scrollbar-hide', className)}>
            <div
                ref={listRef}
                role="tablist"
                aria-label={ariaLabel}
                className={cn('client-chip-list', listClassName)}
            >
                <span
                    ref={indicatorRef}
                    aria-hidden
                    className={cn('client-chip-indicator', activeTone ?? 'bg-primary')}
                />
                {options.map((option, index) => {
                    const isActive = index === activeIndex
                    const Icon = option.icon
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-label={option.ariaLabel}
                            tabIndex={isActive ? 0 : -1}
                            onClick={() => onValueChange(option.value)}
                            onKeyDown={event => handleArrowKeys(event, index, options, onValueChange)}
                            className={cn(
                                'client-chip',
                                isActive && 'client-chip-active',
                                isActive && option.tone && (option.toneText ?? 'text-white')
                            )}
                        >
                            {Icon && <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />}
                            {option.prefix && (
                                <span className={cn('text-[10.5px] font-bold uppercase tracking-wide', isActive ? 'opacity-75' : 'text-muted-foreground/80')}>
                                    {option.prefix}
                                </span>
                            )}
                            <span className="max-w-[10rem] truncate">{option.label}</span>
                            {option.detail && (
                                <span className={cn('text-[11px] font-medium tabular-nums', isActive ? 'opacity-75' : 'text-muted-foreground')}>
                                    {option.detail}
                                </span>
                            )}
                            {option.count !== undefined && option.count > 0 && (
                                <span className={cn(
                                    'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none tabular-nums',
                                    isActive ? 'bg-white/20' : 'bg-muted text-muted-foreground'
                                )}>
                                    {option.count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Flechas, Inicio y Fin mueven la selección, como en un tablist nativo */
function handleArrowKeys<T extends string>(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    options: Array<{ value: T }>,
    onValueChange: (value: T) => void
) {
    const last = options.length - 1
    const next = event.key === 'ArrowRight' ? Math.min(index + 1, last)
        : event.key === 'ArrowLeft' ? Math.max(index - 1, 0)
        : event.key === 'Home' ? 0
        : event.key === 'End' ? last
        : null
    if (next === null || next === index) return
    event.preventDefault()
    onValueChange(options[next].value)
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[next]?.focus()
}

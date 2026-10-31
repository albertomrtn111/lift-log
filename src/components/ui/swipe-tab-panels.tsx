'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { prefersReducedMotion, type TabSwipeLink } from '@/components/ui/client-tab-switcher'

/*
 * Paneles de sub-pestañas que se cambian deslizando con el dedo: el contenido
 * sigue al dedo, el panel vecino asoma por el lado y el indicador del
 * ClientTabSwitcher se mueve a la vez (vía `swipeLink`).
 *
 * Para no chocar con otros gestos, el arrastre no empieza:
 * - cerca de los bordes de la pantalla (gesto de volver/avanzar de iOS);
 * - sobre algo que ya se desplaza en horizontal (chips, carruseles, tablas);
 * - sobre gráficas, deslizadores o campos de texto, ni en `[data-swipe-ignore]`.
 *
 * Cada panel se monta la primera vez que se visita (o se asoma) y se conserva
 * después, para que deslizar sea fluido y no se pierda lo que había.
 */

const EDGE_GUARD_PX = 24
const AXIS_LOCK_PX = 10
const COMMIT_RATIO = 0.28
const FLICK_VELOCITY = 0.35 // px/ms
const SETTLE_MS = 340

const IGNORE_SELECTOR = [
    '[data-swipe-ignore]',
    '.recharts-wrapper',
    'input[type="range"]',
    '[role="slider"]',
    'textarea',
    'input:not([type="checkbox"]):not([type="radio"])',
    'select',
    '[contenteditable="true"]',
].join(',')

interface SwipeTabPanelsProps<T extends string> {
    value: T
    values: readonly T[]
    onValueChange: (value: T) => void
    renderPanel: (value: T) => ReactNode
    swipeLink?: TabSwipeLink
    /** Mismo id base que el ClientTabSwitcher para enlazar pestañas y paneles */
    idBase?: string
    className?: string
    panelClassName?: string
}

type Gesture =
    | { phase: 'idle' }
    | { phase: 'pending' | 'dragging'; startX: number; startY: number; lastX: number; lastT: number; velocity: number; width: number }

export function SwipeTabPanels<T extends string>({
    value,
    values,
    onValueChange,
    renderPanel,
    swipeLink,
    idBase,
    className,
    panelClassName,
}: SwipeTabPanelsProps<T>) {
    const viewportRef = useRef<HTMLDivElement>(null)
    const trackRef = useRef<HTMLDivElement>(null)
    const activeIndex = Math.max(0, values.indexOf(value))
    const [mounted, setMounted] = useState<Set<T>>(() => new Set([value]))
    const [peeking, setPeeking] = useState(false)
    // Desplazamiento vertical de los vecinos: si la página está bajada, asoman
    // alineados con el borde inferior de la cabecera y no con el inicio del panel
    const [peekTop, setPeekTop] = useState(0)
    const [enterFrom, setEnterFrom] = useState<'left' | 'right' | null>(null)

    const latest = useRef({ activeIndex, values, onValueChange, swipeLink })
    latest.current = { activeIndex, values, onValueChange, swipeLink }
    const gesture = useRef<Gesture>({ phase: 'idle' })
    const pendingCommit = useRef<{ peekTop: number } | null>(null)
    const currentPeekTop = useRef(0)
    const previousIndex = useRef(activeIndex)

    // Montaje perezoso de la pestaña activa
    if (!mounted.has(value)) {
        setMounted(prev => new Set(prev).add(value))
    }

    // Al cambiar de pestaña: si venía de un deslizamiento, se recoloca todo sin
    // salto antes de pintar; si venía de un toque, entra con un fundido lateral.
    useLayoutEffect(() => {
        if (previousIndex.current === activeIndex) return
        const direction = activeIndex > previousIndex.current ? 'right' : 'left'
        previousIndex.current = activeIndex
        const track = trackRef.current

        if (pendingCommit.current) {
            const { peekTop: offset } = pendingCommit.current
            pendingCommit.current = null
            if (track) {
                delete track.dataset.settling
                track.style.transform = ''
            }
            if (offset > 0) window.scrollBy(0, -offset)
            setPeeking(false)
            latest.current.swipeLink?.set(null)
            return
        }

        scrollPanelsIntoView(viewportRef.current)
        setEnterFrom(prefersReducedMotion() ? null : direction)
    }, [activeIndex])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const reset = () => {
            gesture.current = { phase: 'idle' }
        }

        const settle = (target: 'stay' | 'next' | 'prev', width: number) => {
            const track = trackRef.current
            const { activeIndex: index, values: list, onValueChange: change, swipeLink: link } = latest.current
            const nextIndex = target === 'next' ? index + 1 : target === 'prev' ? index - 1 : index

            const finish = () => {
                if (target === 'stay') {
                    if (track) {
                        delete track.dataset.settling
                        track.style.transform = ''
                    }
                    setPeeking(false)
                    link?.set(null)
                } else {
                    change(list[nextIndex])
                }
            }

            if (target !== 'stay') {
                pendingCommit.current = { peekTop: currentPeekTop.current }
                link?.set(nextIndex)
            } else {
                link?.set(null)
            }

            if (!track || prefersReducedMotion()) {
                finish()
                return
            }

            track.dataset.settling = 'true'
            const offset = target === 'next' ? -width : target === 'prev' ? width : 0
            track.style.transform = `translate3d(${offset}px, 0, 0)`

            let done = false
            const complete = () => {
                if (done) return
                done = true
                track.removeEventListener('transitionend', complete)
                finish()
            }
            track.addEventListener('transitionend', complete)
            window.setTimeout(complete, SETTLE_MS + 80)
        }

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1 || pendingCommit.current) return reset()
            const touch = event.touches[0]
            const target = event.target as Element | null
            if (touch.clientX < EDGE_GUARD_PX || touch.clientX > window.innerWidth - EDGE_GUARD_PX) return reset()
            if (!target || target.closest(IGNORE_SELECTOR) || isInsideHorizontalScroller(target, viewport)) return reset()

            gesture.current = {
                phase: 'pending',
                startX: touch.clientX,
                startY: touch.clientY,
                lastX: touch.clientX,
                lastT: event.timeStamp,
                velocity: 0,
                width: viewport.clientWidth,
            }
        }

        const onTouchMove = (event: TouchEvent) => {
            const state = gesture.current
            if (state.phase === 'idle') return
            const touch = event.touches[0]
            const dx = touch.clientX - state.startX
            const dy = touch.clientY - state.startY

            if (state.phase === 'pending') {
                if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
                if (Math.abs(dx) < Math.abs(dy) * 1.3) return reset()
                state.phase = 'dragging'
                const top = peekOffset(viewport)
                currentPeekTop.current = top
                setPeekTop(top)
                setEnterFrom(null)
                setPeeking(true)
                // Monta ya los vecinos para que asomen al arrastrar
                const { activeIndex: index, values: list } = latest.current
                setMounted(prev => {
                    const next = new Set(prev)
                    if (index > 0) next.add(list[index - 1])
                    if (index < list.length - 1) next.add(list[index + 1])
                    return next.size === prev.size ? prev : next
                })
            }

            if (event.cancelable) event.preventDefault()
            const dt = Math.max(1, event.timeStamp - state.lastT)
            state.velocity = (touch.clientX - state.lastX) / dt
            state.lastX = touch.clientX
            state.lastT = event.timeStamp

            const { activeIndex: index, values: list, swipeLink: link } = latest.current
            const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === list.length - 1)
            const offset = atEdge ? dx * 0.25 : dx
            const track = trackRef.current
            if (track) track.style.transform = `translate3d(${offset}px, 0, 0)`
            link?.set(index - offset / state.width)
        }

        const onTouchEnd = () => {
            const state = gesture.current
            reset()
            if (state.phase !== 'dragging') return
            const dx = state.lastX - state.startX
            const { activeIndex: index, values: list } = latest.current
            const wantsNext = dx < 0 && index < list.length - 1
            const wantsPrev = dx > 0 && index > 0
            const farEnough = Math.abs(dx) > state.width * COMMIT_RATIO
            const flicked = Math.abs(state.velocity) > FLICK_VELOCITY && Math.sign(state.velocity) === Math.sign(dx) && Math.abs(dx) > 30
            if ((wantsNext || wantsPrev) && (farEnough || flicked)) {
                settle(wantsNext ? 'next' : 'prev', state.width)
            } else {
                settle('stay', state.width)
            }
        }

        viewport.addEventListener('touchstart', onTouchStart, { passive: true })
        viewport.addEventListener('touchmove', onTouchMove, { passive: false })
        viewport.addEventListener('touchend', onTouchEnd)
        viewport.addEventListener('touchcancel', onTouchEnd)
        return () => {
            viewport.removeEventListener('touchstart', onTouchStart)
            viewport.removeEventListener('touchmove', onTouchMove)
            viewport.removeEventListener('touchend', onTouchEnd)
            viewport.removeEventListener('touchcancel', onTouchEnd)
        }
    }, [])

    return (
        <div ref={viewportRef} className={cn('relative overflow-x-clip [touch-action:pan-y_pinch-zoom]', className)}>
            <div ref={trackRef} className="client-swipe-track relative">
                {values.map((panelValue, index) => {
                    if (!mounted.has(panelValue)) return null
                    const offset = index - activeIndex
                    const isActive = offset === 0
                    const isVisible = isActive || (peeking && Math.abs(offset) === 1)
                    return (
                        <div
                            key={panelValue}
                            role="tabpanel"
                            id={idBase ? `${idBase}-panel-${panelValue}` : undefined}
                            aria-labelledby={idBase ? `${idBase}-tab-${panelValue}` : undefined}
                            hidden={!isVisible}
                            className={cn(
                                panelClassName,
                                !isActive && 'absolute inset-x-0',
                                isActive && enterFrom === 'right' && 'client-panel-enter-right',
                                isActive && enterFrom === 'left' && 'client-panel-enter-left'
                            )}
                            style={isActive ? undefined : { top: peekTop, transform: `translateX(${offset * 100}%)` }}
                            onAnimationEnd={isActive ? () => setEnterFrom(null) : undefined}
                        >
                            {renderPanel(panelValue)}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/** Distancia desde el inicio de los paneles hasta el borde inferior de la cabecera fija */
function peekOffset(viewport: HTMLElement) {
    const header = document.querySelector('.app-mobile-header')
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0
    return Math.max(0, headerBottom - viewport.getBoundingClientRect().top)
}

/** Si la página está bajada, sube hasta el inicio de los paneles */
function scrollPanelsIntoView(viewport: HTMLElement | null) {
    if (!viewport) return
    const offset = peekOffset(viewport)
    if (offset > 0) window.scrollBy(0, -offset)
}

function isInsideHorizontalScroller(target: Element, boundary: HTMLElement) {
    let element: Element | null = target
    while (element && element !== boundary) {
        if (element instanceof HTMLElement && element.scrollWidth > element.clientWidth + 1) {
            const overflowX = getComputedStyle(element).overflowX
            if (overflowX === 'auto' || overflowX === 'scroll') return true
        }
        element = element.parentElement
    }
    return false
}

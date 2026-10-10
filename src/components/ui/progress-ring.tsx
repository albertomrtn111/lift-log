import { cn } from '@/lib/utils'

interface ProgressRingProps {
    /** 0..1 */
    value: number
    size?: number
    stroke?: number
    className?: string
    children?: React.ReactNode
}

export function ProgressRing({ value, size = 68, stroke = 7, className, children }: ProgressRingProps) {
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const clamped = Math.min(Math.max(value, 0), 1)
    const offset = circumference * (1 - clamped)

    return (
        <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className={cn('transition-[stroke-dashoffset] duration-700 ease-out', clamped >= 1 ? 'stroke-success' : 'stroke-primary')}
                />
            </svg>
            {children && (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
                    {children}
                </span>
            )}
        </div>
    )
}

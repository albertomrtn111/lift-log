'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface KPIStatCardProps {
    title: string
    value: number | string
    icon: ReactNode
    variant?: 'default' | 'warning' | 'danger' | 'success' | 'muted'
    subtitle?: string
    className?: string
    /** If provided, makes the card a clickable link/anchor */
    href?: string
    /** HTML id for scroll anchoring */
    id?: string
}

export function KPIStatCard({
    title,
    value,
    icon,
    variant = 'default',
    subtitle,
    className,
    href,
    id,
}: KPIStatCardProps) {
    const variantStyles = {
        default: 'bg-primary/10 text-primary',
        warning: 'bg-warning/10 text-warning',
        danger: 'bg-destructive/10 text-destructive',
        success: 'bg-success/10 text-success',
        muted: 'bg-muted text-muted-foreground',
    }

    const content = (
        <Card
            id={id}
            className={cn(
                'h-full min-h-[128px] p-4 transition-all',
                href && 'cursor-pointer hover:shadow-md hover:border-primary/20',
                variant === 'muted' && 'opacity-60',
                className
            )}
        >
            <div className="flex h-full items-start justify-between gap-4">
                <div className="flex min-h-[88px] flex-1 flex-col justify-between">
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
                    {subtitle && (
                        <p className="mt-3 text-xs text-muted-foreground">{subtitle}</p>
                    )}
                </div>
                <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    variantStyles[variant]
                )}>
                    {icon}
                </div>
            </div>
        </Card>
    )

    if (href) {
        return (
            <a href={href} className="block no-underline">
                {content}
            </a>
        )
    }

    return content
}

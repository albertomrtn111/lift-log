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
                'p-4 transition-all',
                href && 'cursor-pointer hover:shadow-md hover:border-primary/20',
                variant === 'muted' && 'opacity-60'
            )}
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">{title}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
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
